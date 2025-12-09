const { generateCompletion } = require('../../lib/ai');
const logger = require('../../lib/logger');

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { notes } = req.body;
    if (!notes || !notes.trim()) return res.status(400).json({ error: "Notes required" });
    if (notes.length > 400000) return res.status(413).json({ error: 'Notes too long (max 400k characters)' });

    // --- Generate summary and flashcards in parallel with resilient adapter (max 120 seconds) ---
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Generation timeout - try shorter notes')), 120000)
    );

    const summaryPromise = generateCompletion({
      prompt: `Summarize the following notes clearly and concisely:\n\n${notes}`,
      temperature: 0.5,
      maxTokens: 1500,
      type: 'text',
      context: { type: 'summary', notes }
    });

    const flashcardsPromise = generateCompletion({
      prompt: `Create exactly 12 flashcards from the following text. Respond ONLY with valid JSON in this format:
[
  {"question":"...","answer":"..."},
  ...
]
Text:
${notes}`,
      temperature: 0.3,
      maxTokens: 1200,
      type: 'json',
      context: { type: 'flashcards', notes }
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
    res.status(500).json({ ok: false, error: err.message || "An unexpected error occurred." });
  }
}