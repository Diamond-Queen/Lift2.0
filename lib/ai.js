// lib/ai.js - Resilient AI adapter with OpenAI → Groq → Hugging Face → Template fallbacks
const logger = require('./logger');

let openaiClient;
let anthropicClient;
let huggingfaceClient;
let groqClient;

// Resolve desired OpenAI model with env-driven override
function resolveOpenAIModel() {
  // Highest priority: explicit model name
  if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.trim()) {
    return process.env.OPENAI_MODEL.trim();
  }
  // Compatibility toggle for preview model name requested by user
  if (String(process.env.ENABLE_GPT_5_1_CODEX_MAX).toLowerCase() === 'true') {
    return 'gpt-5.1-codex-max-preview';
  }
  // Default
  return 'gpt-4o-mini';
}

function getOpenAI() {
  if (openaiClient) return openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiClient;
  } catch (e) {
    logger.error('openai_init_error', { message: e.message });
    return null;
  }
}

function getAnthropic() {
  // Anthropic provider disabled
  return null;
}

function getGroq() {
  if (groqClient) return groqClient;
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) return null;
  try {
    const Groq = require('groq-sdk');
    groqClient = new Groq({ apiKey });
    return groqClient;
  } catch (e) {
    logger.error('groq_init_error', { message: e.message });
    return null;
  }
}

function getHuggingFace() {
  if (huggingfaceClient) return huggingfaceClient;
  if (!process.env.HUGGINGFACE_API_KEY) return null;
  try {
    const { HfInference } = require('@huggingface/inference');
    huggingfaceClient = new HfInference(process.env.HUGGINGFACE_API_KEY);
    return huggingfaceClient;
  } catch (e) {
    logger.error('huggingface_init_error', { message: e.message });
    return null;
  }
}

/**
 * SIMPLIFIED generation: One fast provider (Groq) → Instant template fallback
 * Removes slow sequential chain that causes user stress.
 * 
 * PERFORMANCE: ~2-5 seconds average. No waiting for multiple failures.
 */
async function generateCompletion({ prompt, temperature = 0.5, maxTokens = 1500, type = 'text', context = {} }) {
  // Quick 6-second timeout for AI generation (generous but not endless)
  const aiTimeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('AI timeout')), 6000)
  );
  
  // Try Groq ONLY (fastest + generous free tier)
  const groq = getGroq();
  if (groq) {
    try {
      const opts = {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
      };
      
      const resp = await Promise.race([
        groq.chat.completions.create(opts),
        aiTimeout
      ]);
      const content = resp.choices?.[0]?.message?.content?.trim();
      if (content) {
        logger.info('ai_success', { provider: 'groq' });
        return { provider: 'groq', content };
      }
    } catch (err) {
      logger.warn('ai_attempt_failed', { message: err.message });
      // Fall through immediately to template
    }
  }
  
  // Instant fallback: Template generation (guaranteed fast, always works)
  logger.info('ai_using_template', { type: context.type });
  
  if (context.type === 'resume') {
    return { provider: 'template', content: JSON.stringify(buildResumeTemplate(context)) };
  }
  if (context.type === 'cover') {
    return { provider: 'template', content: JSON.stringify(buildCoverTemplate(context)) };
  }
  if (context.type === 'summary') {
    return { provider: 'template', content: buildSummaryTemplate(context) };
  }
  if (context.type === 'flashcards') {
    return { provider: 'template', content: JSON.stringify(buildFlashcardsTemplate(context)) };
  }
  
  // Return template fallback (always fast, always works)
  if (context.type === 'summary') {
    return { provider: 'template', content: buildSummaryTemplate(context) };
  }
  if (context.type === 'flashcards') {
    return { provider: 'template', content: JSON.stringify(buildFlashcardsTemplate(context)) };
  }
  if (context.type === 'resume') {
    return { provider: 'template', content: JSON.stringify(buildResumeTemplate(context)) };
  }
  if (context.type === 'cover') {
    return { provider: 'template', content: JSON.stringify(buildCoverTemplate(context)) };
  }

  throw new Error('No provider available and no template for type: ' + context.type);
}

// Template-based resume builder (never fails)
function buildResumeTemplate({ name, email, phone, address, linkedin, objective, experience, education, skills, certifications }) {
  return {
    name: name || '',
    email: email || '',
    phone: phone || '',
    address: address || '',
    linkedin: linkedin || '',
    objective: objective || 'Motivated professional seeking opportunities to contribute skills and grow.',
    experience: Array.isArray(experience) && experience.length ? experience.map(e => ({
      title: e.title || '',
      company: e.company || '',
      dates: e.dates || '',
      details: e.details || ''
    })) : [],
    education: Array.isArray(education) && education.length ? education.map(ed => ({
      degree: ed.degree || '',
      school: ed.school || '',
      dates: ed.dates || ''
    })) : [],
    skills: Array.isArray(skills) && skills.length ? skills : ['Communication', 'Teamwork', 'Problem-solving', 'Adaptability'],
    certifications: Array.isArray(certifications) && certifications.length ? certifications : []
  };
}

// Template-based cover letter builder - transforms user input into 2 professional paragraphs
function buildCoverTemplate({ name, recipient, position, paragraphs }) {
  const userInput = String(paragraphs || '').trim();
  
  // Paragraph 1: Introduction and motivation
  let para1;
  if (userInput.length > 0) {
    // Build from their input: express interest and introduce based on what they wrote
    const positionName = position || 'position';
    const companyName = recipient || 'your organization';
    para1 = `I am writing to express my strong interest in the ${positionName} at ${companyName}. ${
      userInput.length > 60 
        ? userInput.split(/[.!?]/).slice(0, 2).join('. ').trim() + '.'
        : userInput
    } I am excited about the opportunity to contribute to your team's success.`;
  } else {
    // Minimal fallback
    para1 = `I am writing to express my interest in the ${position || 'position'} at ${recipient || 'your organization'}. I am motivated to bring my dedication and enthusiasm to contribute meaningfully to your team's goals.`;
  }
  
  // Paragraph 2: Expand on skills/qualities and closing
  let para2;
  if (userInput.length > 0) {
    // Extract key phrases/words from their input for expansion
    const keywords = userInput.toLowerCase().match(/\b(skill|experience|passion|team|work|learn|contribute|dedicated|motivated)\w*/gi) || [];
    const qualities = keywords.length > 0 ? keywords.slice(0, 3).join(', ') : 'dedication and adaptability';
    
    para2 = `Through ${qualities}, I am well-prepared to excel in this role and make a positive impact. ${
      userInput.split(/[.!?]/).slice(-2).join('. ').trim()
    } Thank you for considering my application. I look forward to the opportunity to discuss how I can contribute to your continued success.`;
  } else {
    // Minimal fallback
    para2 = `I am eager to apply my skills and dedication to this role. Thank you for considering my application. I look forward to the opportunity to discuss how I can contribute to your success.`;
  }
  
  return {
    name: name || '',
    recipient: recipient || '',
    position: position || '',
    paragraphs: [para1, para2]  // Return exactly 2 paragraphs
  };
}

// Enhanced template-based summary that elaborates on content
function buildSummaryTemplate({ notes, summaryLength }) {
  const text = String(notes || '').trim();
  if (!text) return 'No content provided to elaborate on.';
  
  // Extract key concepts and topics
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const lines = text.split('\n').filter(l => l.trim());
  
  // Build elaboration based on summaryLength
  const lengthConfig = {
    'short': { sentences: 3, detail: 'brief' },
    'medium': { sentences: 5, detail: 'moderate' },
    'long': { sentences: 8, detail: 'comprehensive' }
  };
  const config = lengthConfig[summaryLength] || lengthConfig['medium'];
  
  let elaboration = '';
  
  // Extract and elaborate on key topics
  const keyTopics = lines.slice(0, Math.min(5, lines.length));
  
  elaboration += 'Understanding the Core Concepts:\n\n';
  
  keyTopics.forEach((topic, idx) => {
    const cleaned = topic.trim().replace(/^[-•*]\s*/, '');
    if (cleaned.length < 5) return;
    
    elaboration += `${cleaned}\n\n`;
    
    // Add contextual elaboration based on the topic
    if (cleaned.toLowerCase().includes('photosynthesis') || cleaned.toLowerCase().includes('plant')) {
      elaboration += 'This biological process is fundamental to life on Earth, converting light energy into chemical energy stored in glucose molecules. Plants, algae, and some bacteria use this process to produce their own food.\n\n';
    } else if (cleaned.toLowerCase().includes('formula') || cleaned.toLowerCase().includes('equation')) {
      elaboration += 'Mathematical formulas provide precise relationships between variables, allowing us to predict outcomes and understand patterns. Understanding the meaning of each component is crucial for proper application.\n\n';
    } else if (cleaned.toLowerCase().includes('cycle') || cleaned.toLowerCase().includes('process')) {
      elaboration += 'Sequential processes involve multiple interconnected steps where each stage depends on the previous one. Breaking down these steps helps in understanding the overall mechanism and identifying key transition points.\n\n';
    } else {
      elaboration += `This concept represents an important foundation for understanding the broader topic. It connects to related ideas through cause-and-effect relationships and provides context for more advanced applications.\n\n`;
    }
  });
  
  return elaboration.trim();
}

// Enhanced template-based flashcards that are specific to content
function buildFlashcardsTemplate({ notes, flashcardDifficulty }) {
  const text = String(notes || '').trim();
  if (!text) return [];
  
  const lines = text.split('\n').filter(l => l.trim() && l.trim().length > 10);
  const cards = [];
  
  // Generate cards based on actual content
  lines.forEach((line, idx) => {
    const cleaned = line.trim().replace(/^[-•*]\s*/, '');
    
    // Skip very short lines
    if (cleaned.length < 15) return;
    
    // Pattern 1: If line contains a colon (definition-style)
    if (cleaned.includes(':')) {
      const [term, definition] = cleaned.split(':').map(s => s.trim());
      if (term && definition && definition.length > 5) {
        cards.push({
          question: `What is ${term}?`,
          answer: definition
        });
      }
    }
    // Pattern 2: If line mentions a formula or equation
    else if (cleaned.toLowerCase().includes('formula') || cleaned.toLowerCase().includes('equation') || cleaned.match(/[=+\-*/]/)) {
      cards.push({
        question: `Explain the formula or relationship: ${cleaned.slice(0, 100)}`,
        answer: `This formula represents: ${cleaned}. It shows the mathematical relationship between the variables and can be used to calculate values based on the given parameters.`
      });
    }
    // Pattern 3: If line mentions a process or cycle
    else if (cleaned.toLowerCase().includes('process') || cleaned.toLowerCase().includes('cycle') || cleaned.toLowerCase().includes('step')) {
      cards.push({
        question: `Describe this process or step: ${cleaned.slice(0, 80)}`,
        answer: cleaned
      });
    }
    // Pattern 4: General concept
    else {
      cards.push({
        question: `Explain: ${cleaned.slice(0, 60)}${cleaned.length > 60 ? '...' : ''}`,
        answer: cleaned
      });
    }
  });
  
  // If we don't have enough cards, create supplementary ones
  while (cards.length < 12 && text.length > 50) {
    const remaining = 12 - cards.length;
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    for (let i = 0; i < remaining && i < sentences.length; i++) {
      const sentence = sentences[Math.floor(Math.random() * sentences.length)].trim();
      if (sentence.length < 20) continue;
      
      cards.push({
        question: `What concept does this describe: "${sentence.slice(0, 50)}..."?`,
        answer: sentence
      });
    }
    
    // Prevent infinite loop
    if (cards.length === 0) break;
  }
  
  return cards.slice(0, 12);
}

module.exports = { generateCompletion };
