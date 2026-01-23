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

    // --- Generate summary and flashcards in parallel (10 second timeout) ---
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Generation timed out. Try shorter notes.')), 10000)
    );

    // Adjust summary prompt based on user preference
    const summaryLengthMap = {
      'short': 'in 1-2 concise sentences',
      'medium': 'in 1 paragraph',
      'long': 'in 2-3 paragraphs'
    };
    const summaryInstruction = summaryLengthMap[summaryLength] || summaryLengthMap['medium'];

    const summaryPromise = generateCompletion({
      prompt: `You are an expert educator. Take the following notes and ELABORATE on them ${summaryInstruction}. Do not just repeat or condense - EXPAND with detailed explanations, real-world examples, context, and deeper insights. Add valuable information that helps truly understand the concepts:\n\n${notes}`,
      temperature: 0.8,
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
      prompt: `TASK: Generate 12 study flashcards ONLY in JSON format. ${flashcardInstruction} CRITICAL: Return ONLY this JSON structure, nothing else - no explanation, no markdown, just pure JSON:
[{"question":"...","answer":"..."},{"question":"...","answer":"..."}]

Create exactly 12 cards testing knowledge from:
${notes}`,
      temperature: 0.3,
      maxTokens: 1000,
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
      // Extract JSON array from response - handles text before/after JSON
      let jsonContent = rawContent;
      
      // Try to find JSON array in the content
      const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      // Parse and validate
      const parsed = JSON.parse(jsonContent);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure all items have question and answer
        flashcards = parsed.filter(card => 
          card.question && card.answer && typeof card.question === 'string' && typeof card.answer === 'string'
        ).slice(0, 12);
      }
    } catch (parseError) {
      logger.error('notes_json_parse_error', { raw: rawContent.slice(0, 200), message: parseError.message });
      // Template fallback: generate from notes directly
      flashcards = [];
    }
    
    // If still empty after parsing, use template fallback
    if (flashcards.length === 0) {
      const { buildFlashcardsTemplate } = require('../../lib/ai');
      try {
        flashcards = buildFlashcardsTemplate({ notes, flashcardDifficulty });
      } catch (templateErr) {
        logger.error('flashcard_template_error', { message: templateErr.message });
        flashcards = [];
      }
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