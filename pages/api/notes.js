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

    // Check subscription plan for notes feature
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.id) {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { 
            schoolId: true,
            subscriptions: { where: { status: { in: ['active'] } } }
          }
        });
        
        // School members and 'full' plan subscribers can use notes
        // 'career' and 'notes' plans have different access
        const hasSchoolAccess = !!user?.schoolId;
        const activeSub = user?.subscriptions?.[0];
        
        if (!hasSchoolAccess && activeSub && activeSub.plan === 'career') {
          return res.status(403).json({ 
            ok: false, 
            error: 'Notes feature is not included in your Career Only plan. Upgrade to Full Access to use notes.' 
          });
        }
      }
    } catch (err) {
      logger.error('Failed to check notes subscription', { error: err.message });
      // Continue - let request proceed if subscription check fails
    }

    // Load user preferences for AI tone and note preferences (if authenticated) - USE CACHE FIRST
    let summaryLength = 'medium'; // short, medium, long
    let flashcardDifficulty = 'medium'; // easy, medium, hard
    let quizDifficulty = 'medium'; // easy, medium, hard
    try {
      const { authOptions } = require('../../lib/authOptions');
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.id) {
        // Try cache first (5 minute TTL)
        const cacheKey = `user_prefs_${session.user.id}`;
        let userPrefs = cache.get(cacheKey);
        
        if (!userPrefs) {
          // Cache miss - fetch from DB (Prisma primary, pool fallback)
          if (prisma) {
            const user = await prisma.user.findUnique({ 
              where: { id: session.user.id }, 
              select: { preferences: true } 
            });
            userPrefs = user?.preferences;
          } else if (pool) {
            const { rows } = await pool.query('SELECT preferences FROM "User" WHERE id = $1', [session.user.id]);
            userPrefs = rows[0]?.preferences;
          }
          // Cache the result for 5 minutes
          if (userPrefs) cache.set(cacheKey, userPrefs, 5 * 60 * 1000);
        }
        
        summaryLength = userPrefs?.summaryLength || 'medium';
        flashcardDifficulty = userPrefs?.flashcardDifficulty || 'medium';
        quizDifficulty = userPrefs?.quizDifficulty || 'medium';
      }
    } catch (err) {
      // If preference load fails, continue with defaults
      logger.error('Failed to load notes preferences', { error: err.message });
    }

    const { notes, includeQuiz } = req.body;
    if (!notes || !notes.trim()) return res.status(400).json({ error: "Notes required" });
    if (notes.length > 1000000) return res.status(413).json({ error: 'Notes too long (max 1,000,000 characters)' });

    // --- Generate summary and flashcards in parallel (10 second timeout) ---
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Generation timed out. Try shorter notes.')), 10000)
    );

    // Adjust summary prompt based on user preference (difficulty + length)
    const summaryLengthMap = {
      'short': 'in 1-2 concise sentences focusing on the most critical concepts',
      'medium': 'in 1 paragraph covering main ideas and key relationships',
      'long': 'in 2-3 paragraphs with supporting details and examples'
    };
    const summaryInstruction = summaryLengthMap[summaryLength] || summaryLengthMap['medium'];

    const summaryPromise = generateCompletion({
      prompt: `You are an expert educator. Analyze the following notes and create a focused study summary ${summaryInstruction}.

IMPORTANT: 
1. FIRST identify the core concepts and main ideas - these are your priority.
2. Filter out unnecessary details, tangents, or redundant information.
3. Include relevant examples ONLY if they directly support understanding key concepts.
4. Organize by importance: fundamental concepts first, then supporting details.
5. If there is fluff or off-topic content in the notes, deprioritize or skip it.

Notes to summarize:
${notes}`,
      temperature: 0.7,
      type: 'text',
      context: { type: 'summary', notes, summaryLength }
    });

    // Adjust flashcard prompt based on difficulty preference
    const flashcardDifficultyMap = {
      'easy': 'Create straightforward flashcards covering fundamental definitions and basic concepts. Each answer should be 1-2 sentences. Focus on foundational knowledge that must be memorized.',
      'medium': 'Create balanced flashcards testing understanding of concepts and their relationships. Include some application questions. Answers can be 2-3 sentences with brief explanations.',
      'hard': 'Create challenging flashcards that test deep understanding, application, and synthesis. Include multi-part questions and scenario-based problems. Answers should explain reasoning and consequences.'
    };
    const flashcardInstruction = flashcardDifficultyMap[flashcardDifficulty] || flashcardDifficultyMap['medium'];

    const flashcardsPromise = generateCompletion({
      prompt: `TASK: Generate study flashcards in JSON format. ${flashcardInstruction}

CRITICAL REQUIREMENTS:
1. Focus on essential concepts - filter out unnecessary or tangential information.
2. Generate between 8-16 flashcards (aim for 10-14 cards for most content).
3. Order cards from most important to least important concepts.
4. Each question should be clear and specific.
5. Return ONLY this JSON structure, nothing else - no explanation, no markdown:
[{"question":"...","answer":"..."}]

Content to create flashcards from:
${notes}`,
      maxTokens: notes.length < 100 ? 500 : 1500,
      type: 'json',
      context: { type: 'flashcards', notes, flashcardDifficulty }
    });

    // Optional: generate practice quiz questions (problems + answers)
    const quizDifficultyMap = {
      easy: 'Create straightforward, single-step practice problems testing basic recall and simple application. Keep answers concise.',
      medium: 'Create balanced problems combining recall with application. Include some multi-step reasoning. Provide brief solution explanations.',
      hard: 'Create challenging problems requiring deep analysis and multi-step reasoning. Include scenario-based questions. Show detailed solution steps.'
    };
    const difficultyInstruction = quizDifficultyMap[quizDifficulty] || quizDifficultyMap['medium'];

    const quizPromise = includeQuiz ? generateCompletion({
      prompt: `TASK: Generate multiple-choice practice problems based on the notes. ${difficultyInstruction}

CRITICAL REQUIREMENTS:
1. Extract and focus on ACTUAL USEFUL INFORMATION - concepts that explain relationships, mechanisms, processes, or key principles - regardless of capitalization.
2. Ignore tangential information, examples that don't teach core concepts, and superficial details.
3. Aim for 6-12 problems that test core understanding and meaningful application.
4. Return ONLY a JSON array, no other text.
5. Each problem must have: "question", "options" (3-5 choices), "correctOption" (letter), and optional "solution".

Example format:
[{"question":"What is X?","options":["Option A","Option B","Option C"],"correctOption":"B","solution":"Explanation of why B is correct"}]

Important:
- Prioritize concepts that explain WHY or HOW things work, not just WHAT things are.
- Create plausible subject-specific distractors.
- For numeric problems include units.
- Avoid ambiguous questions and multiple correct answers.
- Order by importance: most essential concepts first.
- Do NOT add any text before or after the JSON array.

Notes to create problems from:
${notes}`,
      maxTokens: 2200,
      type: 'json',
      context: { type: 'quiz', notes, quizDifficulty }
    }) : Promise.resolve({ content: '[]' });

    const [summaryResp, flashcardsResp, quizResp] = await Promise.race([
      Promise.all([summaryPromise, flashcardsPromise, quizPromise]),
      timeout
    ]);

    const summary = summaryResp.content;
    let flashcards = [];
    const rawContent = flashcardsResp.content;
    let quiz = [];
    const rawQuiz = quizResp?.content || '[]';
    
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
        // Normalize a variety of possible keys and attempt to fix common issues
        const cleanStr = (s) => String(s || '').replace(/^\s+|\s+$/g, '').replace(/^Q:\s*/i, '').replace(/^A:\s*/i, '').trim();
        const isQuestionLike = (s) => /\?$/.test(s) || /^(what|who|why|how|when|where|explain)\b/i.test(s);

        const normalizeCard = (c) => {
          if (!c) return null;
          const qRaw = c.question ?? c.q ?? c.Q ?? c.prompt ?? c.questionText ?? c.front ?? '';
          let aRaw = c.answer ?? c.a ?? c.A ?? c.response ?? c.answerText ?? c.back ?? c.explanation ?? c.definition ?? '';
          let q = cleanStr(qRaw);
          let a = cleanStr(aRaw);

          // If answer looks like a question and question does not, swap them
          if (!q && a && isQuestionLike(a)) {
            q = a;
            a = cleanStr(c.answer ?? c.a ?? c.A ?? c.response ?? c.answerText ?? c.back ?? c.explanation ?? c.definition ?? '');
          } else if (isQuestionLike(a) && !isQuestionLike(q)) {
            const tmp = q; q = a; a = tmp;
          }

          // Fallback: use explanation/definition/back fields if answer is empty
          if ((!a || a.length < 3) && (c.definition || c.explanation || c.back)) {
            a = cleanStr(c.definition || c.explanation || c.back);
          }

          // Reject if either side is missing after normalization
          if (!q || !a) return null;

          // Avoid trivial identical Q/A; try to salvage by stripping leading 'Explain:' or similar
          if (q === a) {
            const alt = a.replace(/^Explain:\s*/i, '').trim();
            if (alt && alt !== q) a = alt;
            else return null;
          }

          return { question: q, answer: a };
        };

        const normalized = parsed.map(normalizeCard).filter(Boolean);
        flashcards = normalized.slice(0, 12);
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

    // Parse quiz JSON if requested
    if (includeQuiz) {
      try {
        let quizContent = rawQuiz;
        // Match JSON array - handles both empty [] and populated [{...}] arrays
        const jsonMatch = rawQuiz.match(/\[[\s\S]*\]/);
        if (jsonMatch) quizContent = jsonMatch[0];
        const parsedQuiz = JSON.parse(quizContent);
        if (Array.isArray(parsedQuiz)) {
          // Normalize items: require question + options + correctOption OR question+answer
          const normalized = parsedQuiz.map((it) => {
            const item = { ...it };
            // Normalize options and correctIndex
            if (Array.isArray(item.options) && item.options.length > 0 && item.correctOption) {
              // Convert letter to index
              let ci = null;
              if (typeof item.correctOption === 'string') {
                const letter = item.correctOption.trim().toUpperCase();
                ci = letter.charCodeAt(0) - 65; // 'A' -> 0
              } else if (typeof item.correctOption === 'number') {
                ci = Number(item.correctOption);
              }
              if (Number.isFinite(ci) && ci >= 0 && ci < item.options.length) {
                item.correctIndex = ci;
                item.answer = item.options[ci];
              }
            }
            // Fallback: if no options but answer present, keep answer
            return item;
          }).filter(i => i.question && ((Array.isArray(i.options) && typeof i.correctIndex === 'number') || i.answer));
          quiz = normalized.slice(0, 12);
        }
      } catch (qErr) {
        logger.error('notes_quiz_parse_error', { raw: rawQuiz.slice(0, 200), message: qErr.message });
        quiz = [];
      }
    }

    // FIX 2: Removed '.map((f) => ({ ...f, flipped: false }))' 
    // This state management belongs to the client component.

    // If a summary is returned as a single block of text with internal newlines, 
    // it's better to process it into an array of paragraphs for display.
    const summaries = summary.split('\n\n').filter(p => p.trim() !== '');

    res.status(200).json({ summaries, flashcards, quiz });
  } catch (err) {
    logger.error('notes_handler_error', { message: err.message });
    auditLog('notes_handler_error', null, { message: err.message }, 'error');
    res.status(500).json({ ok: false, error: err.message || "An unexpected error occurred." });
  }
}

module.exports = handler;