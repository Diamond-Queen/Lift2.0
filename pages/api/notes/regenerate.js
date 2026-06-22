const { generateCompletion } = require('../../../lib/ai');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');
const { getServerSession } = require('next-auth/next');
const { authOptions } = require('../../../lib/authOptions');
const prisma = require('../../../lib/prisma');
const cache = require('../../../lib/cache');

async function handler(req, res) {
  setSecureHeaders(res);

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
      auditLog('regenerate_notes_blocked', null, { ip, reason: validation.reason }, 'warning');
      return res.status(403).json({ ok: false, error: 'Blocked by firewall', reason: validation.reason, blockUntil: validation.blockUntil });
    }
    const rl = trackIpRateLimit(ip, '/api/notes/regenerate');
    if (!rl.allowed) {
      auditLog('regenerate_notes_rate_limited', null, { ip });
      return res.status(429).json({ ok: false, error: 'Rate limit exceeded', reason: rl.reason, blockUntil: rl.blockUntil });
    }

    // Authenticate user
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { contentItemId, type } = req.body;
    if (!contentItemId) {
      return res.status(400).json({ error: 'contentItemId required' });
    }
    // type can be 'flashcards', 'quiz', or undefined (for both)
    if (type && !['flashcards', 'quiz'].includes(type)) {
      return res.status(400).json({ error: 'type must be "flashcards", "quiz", or undefined' });
    }

    // Fetch the content item to get originalInput
    const contentItem = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
      select: { 
        id: true,
        userId: true, 
        originalInput: true, 
        metadata: true,
        type: true
      }
    });

    if (!contentItem) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Verify user owns this content
    if (contentItem.userId !== session.user.id) {
      auditLog('regenerate_notes_unauthorized', session.user.id, { contentItemId }, 'warning');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only regenerate notes type
    if (contentItem.type !== 'note') {
      return res.status(400).json({ error: 'Can only regenerate notes' });
    }

    const notes = contentItem.originalInput;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: 'Original notes not found' });
    }

    // Load user preferences for flashcard/quiz difficulty
    let flashcardDifficulty = 'medium';
    let quizDifficulty = 'medium';
    try {
      const cacheKey = `user_prefs_${session.user.id}`;
      let userPrefs = cache.get(cacheKey);
      
      if (!userPrefs) {
        const user = await prisma.user.findUnique({ 
          where: { id: session.user.id }, 
          select: { preferences: true } 
        });
        userPrefs = user?.preferences;
        if (userPrefs) cache.set(cacheKey, userPrefs, 5 * 60 * 1000);
      }
      
      flashcardDifficulty = userPrefs?.flashcardDifficulty || 'medium';
      quizDifficulty = userPrefs?.quizDifficulty || 'medium';
    } catch (err) {
      logger.warn('Failed to load regenerate preferences', { error: err.message });
    }

    // Check what to regenerate based on current metadata
    const currentMetadata = contentItem.metadata || {};
    const flashcardsExist = Array.isArray(currentMetadata.flashcards) && currentMetadata.flashcards.length > 0;
    const quizExists = Array.isArray(currentMetadata.quiz) && currentMetadata.quiz.length > 0;

    // Determine what to regenerate based on type parameter
    let hasFlashcards = false;
    let hasQuiz = false;

    if (type === 'flashcards') {
      // Only regenerate flashcards
      if (!flashcardsExist) {
        return res.status(400).json({ error: 'This note has no flashcards to regenerate. Generate them first.' });
      }
      hasFlashcards = true;
    } else if (type === 'quiz') {
      // Only regenerate quiz
      if (!quizExists) {
        return res.status(400).json({ error: 'This note has no quiz to regenerate. Generate them first.' });
      }
      hasQuiz = true;
    } else {
      // Regenerate both (if either exist)
      if (!flashcardsExist && !quizExists) {
        return res.status(400).json({ error: 'This note has no flashcards or quiz to regenerate. Generate them first.' });
      }
      hasFlashcards = flashcardsExist;
      hasQuiz = quizExists;
    }

    // Build flashcard generation if needed
    const flashcardDifficultyMap = {
      'easy': 'Create straightforward flashcards covering fundamental definitions and basic concepts. Each answer should be 1-2 sentences. Focus on foundational knowledge that must be memorized.',
      'medium': 'Create balanced flashcards testing understanding of concepts and their relationships. Include some application questions. Answers can be 2-3 sentences with brief explanations.',
      'hard': 'Create challenging flashcards that test deep understanding, application, and synthesis. Include multi-part questions and scenario-based problems. Answers should explain reasoning and consequences.'
    };
    const flashcardInstruction = flashcardDifficultyMap[flashcardDifficulty] || flashcardDifficultyMap['medium'];

    const flashcardsPromise = hasFlashcards ? generateCompletion({
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
    }) : Promise.resolve({ content: '[]' });

    // Build quiz generation if needed
    const quizDifficultyMap = {
      easy: 'Create straightforward, single-step practice problems testing basic recall and simple application. Keep answers concise.',
      medium: 'Create balanced problems combining recall with application. Include some multi-step reasoning. Provide brief solution explanations.',
      hard: 'Create challenging problems requiring deep analysis and multi-step reasoning. Include scenario-based questions. Show detailed solution steps.'
    };
    const difficultyInstruction = quizDifficultyMap[quizDifficulty] || quizDifficultyMap['medium'];

    const quizPromise = hasQuiz ? generateCompletion({
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

    // Generate in parallel with 15 second timeout
    let flashcardsResp, quizResp;
    try {
      [flashcardsResp, quizResp] = await Promise.race([
        Promise.all([flashcardsPromise, quizPromise]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Generation timeout')), 15000))
      ]);
    } catch (timeoutErr) {
      logger.warn('regenerate_generation_timeout', { contentItemId, message: timeoutErr.message });
      return res.status(408).json({ ok: false, error: 'Generation took too long. Try with shorter notes.' });
    }

    // Parse flashcards
    let flashcards = [];
    if (hasFlashcards) {
      try {
        const rawContent = flashcardsResp.content;
        let jsonContent = rawContent;
        
        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
        
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleanStr = (s) => String(s || '').replace(/^\s+|\s+$/g, '').replace(/^Q:\s*/i, '').replace(/^A:\s*/i, '').trim();
          const isQuestionLike = (s) => /\?$/.test(s) || /^(what|who|why|how|when|where|explain)\b/i.test(s);

          const normalizeCard = (c) => {
            if (!c) return null;
            const qRaw = c.question ?? c.q ?? c.Q ?? c.prompt ?? c.questionText ?? c.front ?? '';
            let aRaw = c.answer ?? c.a ?? c.A ?? c.response ?? c.answerText ?? c.back ?? c.explanation ?? c.definition ?? '';
            let q = cleanStr(qRaw);
            let a = cleanStr(aRaw);

            if (!q && a && isQuestionLike(a)) {
              q = a;
              a = cleanStr(c.answer ?? c.a ?? c.A ?? c.response ?? c.answerText ?? c.back ?? c.explanation ?? c.definition ?? '');
            } else if (isQuestionLike(a) && !isQuestionLike(q)) {
              const tmp = q; q = a; a = tmp;
            }

            if ((!a || a.length < 3) && (c.definition || c.explanation || c.back)) {
              a = cleanStr(c.definition || c.explanation || c.back);
            }

            if (!q || !a) return null;

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
        logger.error('regenerate_flashcard_parse_error', { contentItemId, message: parseError.message });
        flashcards = [];
      }
    }

    // Parse quiz
    let quiz = [];
    if (hasQuiz) {
      try {
        const rawQuiz = quizResp.content || '[]';
        let quizContent = rawQuiz;
        const jsonMatch = rawQuiz.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch) quizContent = jsonMatch[0];
        
        const parsedQuiz = JSON.parse(quizContent);
        if (Array.isArray(parsedQuiz)) {
          const normalized = parsedQuiz.map((it) => {
            const item = { ...it };
            if (Array.isArray(item.options) && item.options.length > 0 && item.correctOption) {
              let ci = null;
              if (typeof item.correctOption === 'string') {
                const letter = item.correctOption.trim().toUpperCase();
                ci = letter.charCodeAt(0) - 65;
              } else if (typeof item.correctOption === 'number') {
                ci = Number(item.correctOption);
              }
              if (Number.isFinite(ci) && ci >= 0 && ci < item.options.length) {
                item.correctIndex = ci;
                item.answer = item.options[ci];
              }
            }
            return item;
          }).filter(i => i.question && ((Array.isArray(i.options) && typeof i.correctIndex === 'number') || i.answer));
          quiz = normalized.slice(0, 12);
        }
      } catch (qErr) {
        logger.error('regenerate_quiz_parse_error', { contentItemId, message: qErr.message });
        quiz = [];
      }
    }

    // Update the content item with new flashcards/quiz
    const updatedMetadata = {
      ...currentMetadata,
      ...(hasFlashcards && { flashcards }),
      ...(hasQuiz && { quiz }),
      // Track regeneration count
      regenerationCount: (currentMetadata.regenerationCount || 0) + 1
    };

    await prisma.contentItem.update({
      where: { id: contentItemId },
      data: { metadata: updatedMetadata }
    });

    logger.info('notes_regenerated', { 
      contentItemId, 
      userId: session.user.id,
      regenerationCount: updatedMetadata.regenerationCount,
      hasFlashcards: flashcards.length > 0,
      hasQuiz: quiz.length > 0
    });

    return res.json({ 
      ok: true,
      flashcards: hasFlashcards ? flashcards : undefined,
      quiz: hasQuiz ? quiz : undefined,
      regenerationCount: updatedMetadata.regenerationCount
    });
  } catch (err) {
    logger.error('regenerate_notes_error', { message: err.message, stack: err.stack });
    auditLog('regenerate_notes_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to regenerate. Please try again.' });
  }
}

module.exports = handler;
