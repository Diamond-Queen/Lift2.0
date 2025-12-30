// lib/ai.js - Resilient AI adapter with OpenAI → Anthropic → Template fallbacks
const logger = require('./logger');

let openaiClient, anthropicClient;

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
  if (anthropicClient) return anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropicClient;
  } catch (e) {
    logger.error('anthropic_init_error', { message: e.message });
    return null;
  }
}

/**
 * Generate completion with tiered fallback:
 * 1. OpenAI gpt-4o-mini (with 10s timeout)
 * 2. Anthropic Claude 3.5 Sonnet (with 10s timeout)
 * 3. Template-based fallback (for career/notes)
 * 
 * PERFORMANCE: Uses aggressive timeouts to fail fast and fallback quickly
 */
async function generateCompletion({ prompt, temperature = 0.5, maxTokens = 1500, type = 'text', context = {} }) {
  // Create a timeout promise that rejects after 10 seconds per provider
  const createTimeout = (ms = 10000) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`AI provider timeout after ${ms}ms`)), ms)
  );
  
  // Try OpenAI first with aggressive 10s timeout
  const openai = getOpenAI();
  if (openai) {
    try {
      const opts = {
        model: resolveOpenAIModel(),
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
      };
      if (type === 'json') opts.response_format = { type: 'json_object' };
      
      // Race between API call and timeout - fail fast
      const resp = await Promise.race([
        openai.chat.completions.create(opts),
        createTimeout(10000)
      ]);
      const content = resp.choices?.[0]?.message?.content?.trim();
      if (content) return { provider: 'openai', content };
    } catch (err) {
      logger.warn('openai_completion_failed', { message: err.message, timeout: err.message.includes('timeout') });
    }
  }

  // Try Anthropic fallback with 10s timeout
  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const resp = await Promise.race([
        anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        }),
        createTimeout(10000)
      ]);
      const content = resp.content?.[0]?.text?.trim();
      if (content) return { provider: 'anthropic', content };
    } catch (err) {
      logger.warn('anthropic_completion_failed', { message: err.message, timeout: err.message.includes('timeout') });
    }
  }

  // Final fallback: template-based generation
  logger.info('ai_fallback_to_template', { type: context.type });
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

  throw new Error('All AI providers failed and no fallback template available.');
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

// Template-based summary
function buildSummaryTemplate({ notes }) {
  const text = String(notes || '').trim();
  if (!text) return 'No content provided.';
  
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const summary = sentences.slice(0, Math.min(5, sentences.length)).join(' ');
  return summary.slice(0, 500) + (summary.length > 500 ? '...' : '');
}

// Template-based flashcards
function buildFlashcardsTemplate({ notes }) {
  const text = String(notes || '').trim();
  if (!text) return [];
  
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const cards = [];
  for (let i = 0; i < Math.min(12, sentences.length); i++) {
    const s = sentences[i].trim();
    if (s.length < 10) continue;
    const mid = Math.floor(s.length / 2);
    cards.push({
      question: `What is stated in the following context: "${s.slice(0, mid).trim()}..."?`,
      answer: s.slice(mid).trim()
    });
  }
  
  while (cards.length < 12) {
    cards.push({
      question: `Review point ${cards.length + 1}`,
      answer: 'Key concept from your notes.'
    });
  }
  
  return cards.slice(0, 12);
}

module.exports = { generateCompletion };
