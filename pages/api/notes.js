const { generateCompletion } = require('../../lib/ai');
const logger = require('../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  auditLog,
} = require('../../lib/security');
const { extractClientIp } = require('../../lib/ip');
const { getServerSession } = require('next-auth/next');
const { authOptions } = require('../../lib/authOptions');
const prisma = require('../../lib/prisma');
const { pool } = require('../../lib/db');
const cache = require('../../lib/cache');

async function handler(req, res) {
  setSecureHeaders(res);

  // Check if Prisma client is available
  if (!prisma) {
    logger.error('prisma_client_unavailable', { error: 'Prisma client failed to initialize' });
    return res.status(500).json({ ok: false, error: 'Database connection error. Please try again.' });
  }

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const ip = extractClientIp(req);
    const validation = validateRequest(req);
    if (!validation.valid) {
      auditLog('notes_request_blocked', null, { ip, reason: validation.reason }, 'warning');
      return res.status(400).json({ error: 'Request rejected', reason: validation.reason });
    }
    const rl = trackIpRateLimit(ip, '/api/notes');
    if (!rl.allowed) {
      auditLog('notes_rate_limited', null, { ip });
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    // Load user preferences for AI tone and note preferences (if authenticated) - USE CACHE FIRST
    let summaryLength = 'medium'; // short, medium, long
    let flashcardDifficulty = 'medium'; // easy, medium, hard
    try {
      const { authOptions } = require('../../lib/authOptions');
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.id) {
        // Try cache first (5 minute TTL)
        const cacheKey = `user_prefs_${session.user.id}`;
        let userPrefs = cache.get(cacheKey);
        
        if (!userPrefs) {
          // Cache miss - fetch from DB
          if (prisma) {
            const user = await prisma.user.findUnique({ 
              where: { id: session.user.id }, 
              select: { preferences: true } 
            });
            userPrefs = user?.preferences;
          } else {
            const { rows } = await pool.query('SELECT preferences FROM "User" WHERE id = $1', [session.user.id]);
            userPrefs = rows[0]?.preferences;
          }
          // Cache the result for 5 minutes
          if (userPrefs) cache.set(cacheKey, userPrefs, 5 * 60 * 1000);
        }
        
        summaryLength = userPrefs?.summaryLength || 'medium';
        flashcardDifficulty = userPrefs?.flashcardDifficulty || 'medium';
      }
    } catch (err) {
      // If preference load fails, continue with defaults
      logger.error('Failed to load notes preferences', { error: err.message });
    }

    const { notes } = req.body;
    if (!notes || !notes.trim()) return res.status(400).json({ error: "Notes required" });
    if (notes.length > 400000) return res.status(413).json({ error: 'Notes too long (max 400k characters)' });

    // --- Generate summary and flashcards in parallel with resilient adapter (25 second overall timeout) ---
    // Each AI provider has 10s timeout internally, so this gives them reasonable time
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Generation timeout - try shorter notes or split them')), 25000)
    );

    // Adjust summary prompt based on user preference
    const summaryLengthMap = {
      'short': 'in 1-2 concise sentences',
      'medium': 'in 1 paragraph',
      'long': 'in 2-3 paragraphs'
    };
    const summaryInstruction = summaryLengthMap[summaryLength] || summaryLengthMap['medium'];

    const summaryPromise = generateCompletion({
      prompt: `Summarize the following notes clearly and concisely ${summaryInstruction}:\n\n${notes}`,
      temperature: 0.5,
      type: 'text',
      context: { type: 'summary', notes, summaryLength }
    });

    // Adjust flashcard prompt based on difficulty preference
    const flashcardDifficultyMap = {
      'easy': 'Create 12 straightforward flashcards covering basic concepts and definitions.',
      'medium': 'Create 12 flashcards with balanced complexity covering key concepts.',
      'hard': 'Create 12 challenging flashcards that test deep understanding and application.'
    };
    const flashcardInstruction = flashcardDifficultyMap[flashcardDifficulty] || flashcardDifficultyMap['medium'];

    const flashcardsPromise = generateCompletion({
      prompt: `${flashcardInstruction} Respond ONLY with valid JSON in this format:
[
  {"question":"...","answer":"..."},
  ...
]
Text:
${notes}`,
      temperature: 0.3,
      type: 'json',
      context: { type: 'flashcards', notes, flashcardDifficulty }
    });

    const [summaryResp, flashcardsResp] = await Promise.race([
      Promise.all([summaryPromise, flashcardsPromise]),
      timeout
    ]);

    const summary = summaryResp.content;
    let flashcards = [];
    const rawContent = flashcardsResp.content;
    
    try {
      // FIX 1: Robust JSON parsing using regex to extract only the JSON block
      const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        flashcards = JSON.parse(jsonMatch[0]);
      }
      
      if (!Array.isArray(flashcards)) flashcards = [];
    } catch (parseError) {
      logger.error('notes_json_parse_error', { message: parseError.message });
      // Fallback: if parsing failed, return an empty array for flashcards
      flashcards = [];
    }

    // FIX 2: Removed '.map((f) => ({ ...f, flipped: false }))' 
    // This state management belongs to the client component.

    // If a summary is returned as a single block of text with internal newlines, 
    // it's better to process it into an array of paragraphs for display.
    const summaries = summary.split('\n\n').filter(p => p.trim() !== '');

    res.status(200).json({ summaries, flashcards });
  } catch (err) {
    logger.error('notes_handler_error', { message: err.message });
    auditLog('notes_handler_error', null, { message: err.message }, 'error');
    res.status(500).json({ ok: false, error: err.message || "An unexpected error occurred." });
  }
}

module.exports = handler;