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
      let content = resp.choices?.[0]?.message?.content?.trim();
      if (content) {
        // If JSON type, validate it's actually valid JSON before returning
        if (type === 'json') {
          try {
            // Extract JSON from response (might have extra text)
            const jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
            const jsonStr = jsonMatch ? jsonMatch[0] : content;
            JSON.parse(jsonStr); // Will throw if invalid
          } catch (jsonErr) {
            // Invalid JSON from Groq - fall through to template
            logger.warn('groq_invalid_json', { message: jsonErr.message, preview: content.slice(0, 100) });
            throw jsonErr;
          }
        }
        
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
  // Helper to parse string inputs into arrays
  const parseStringArray = (input) => {
    if (Array.isArray(input)) return input;
    if (!input || typeof input !== 'string') return [];
    // Split by newlines or semicolons
    return input.split(/[\n;]/).map(line => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      // Try to parse as pipe-separated: title|company|dates|details
      if (trimmed.includes('|')) {
        const [title, company, dates, ...rest] = trimmed.split('|').map(s => s.trim());
        return { title: title || '', company: company || '', dates: dates || '', details: rest.join('|') };
      }
      // Default: treat as title
      return { title: trimmed, company: '', dates: '', details: '' };
    }).filter(Boolean);
  };

  const parseEducationArray = (input) => {
    if (Array.isArray(input)) return input;
    if (!input || typeof input !== 'string') return [];
    return input.split(/[\n;]/).map(line => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (trimmed.includes('|')) {
        const [degree, school, dates] = trimmed.split('|').map(s => s.trim());
        return { degree: degree || '', school: school || '', dates: dates || '' };
      }
      return { degree: trimmed, school: '', dates: '' };
    }).filter(Boolean);
  };

  const parseSkillsArray = (input) => {
    if (Array.isArray(input)) return input.map(s => String(s).trim()).filter(Boolean);
    if (!input || typeof input !== 'string') return ['Communication', 'Teamwork', 'Problem-solving', 'Adaptability'];
    return input.split(',').map(s => s.trim()).filter(Boolean);
  };

  // Expand and professionalize objective/summary
  const expandObjective = (obj) => {
    if (!obj || typeof obj !== 'string') return 'Motivated professional seeking to leverage skills and experience to drive results.';
    const text = obj.trim();
    if (text.length === 0) return 'Motivated professional seeking to leverage skills and experience to drive results.';
    
    // If already substantial, just professionalize
    if (text.length > 80) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    
    // If short, expand it
    const expanded = `${text}. Seeking an opportunity to contribute expertise and drive meaningful impact within a collaborative team environment while supporting organizational goals and professional growth.`;
    return expanded.charAt(0).toUpperCase() + expanded.slice(1);
  };

  // Expand and professionalize skills
  const expandSkills = (skillsList) => {
    const baseSkills = parseSkillsArray(skillsList);
    const set = new Set(baseSkills.map(s => s.trim()).filter(Boolean));
    
    // Map of skills to related/professional expansions
    const skillExpansions = {
      'python': ['Python', 'Data Analysis', 'Libraries & Frameworks'],
      'javascript': ['JavaScript', 'Web Development', 'Frontend Development'],
      'communication': ['Verbal Communication', 'Written Communication', 'Presentation Skills'],
      'leadership': ['Team Leadership', 'Strategic Planning', 'Mentoring'],
      'excel': ['Excel', 'Data Analysis', 'Spreadsheet Management'],
      'sql': ['SQL', 'Database Management', 'Query Optimization'],
      'design': ['UI/UX Design', 'Visual Design', 'Prototyping'],
      'project management': ['Project Planning', 'Stakeholder Communication', 'Risk Management'],
      'problem-solving': ['Problem-Solving', 'Critical Thinking', 'Solution Design'],
      'teamwork': ['Team Collaboration', 'Cross-functional Communication', 'Cooperation'],
      'adaptability': ['Adaptability', 'Flexibility', 'Quick Learning'],
      'microsoft office': ['Microsoft Office', 'Word', 'PowerPoint', 'Excel'],
      'c++': ['C++', 'Object-Oriented Programming', 'Systems Development'],
      'java': ['Java', 'Enterprise Development', 'Software Architecture'],
      'marketing': ['Marketing Strategy', 'Digital Marketing', 'Brand Development'],
      'sales': ['Sales Strategy', 'Customer Relations', 'Revenue Growth'],
      'customer service': ['Customer Support', 'Client Relations', 'Problem Resolution'],
      'financial': ['Financial Analysis', 'Budgeting', 'Cost Management'],
      'research': ['Research', 'Data Collection', 'Analysis & Reporting'],
      'writing': ['Technical Writing', 'Content Creation', 'Documentation'],
    };

    // Expand based on known skills
    for (const skill of [...set]) {
      const key = skill.toLowerCase();
      if (skillExpansions[key]) {
        skillExpansions[key].forEach(s => set.add(s));
      }
    }

    // Ensure minimum set of professional soft skills
    const softSkills = ['Communication', 'Problem-Solving', 'Teamwork', 'Adaptability', 'Time Management'];
    if (set.size < 5) {
      softSkills.forEach(s => set.add(s));
    }

    return Array.from(set).slice(0, 12); // Return up to 12 skills
  };

  const experience_arr = parseStringArray(experience);
  const education_arr = parseEducationArray(education);
  const expanded_skills = expandSkills(skills);
  const certs_arr = parseSkillsArray(certifications);

  return {
    name: name || '',
    email: email || '',
    phone: phone || '',
    address: address || '',
    linkedin: linkedin || '',
    objective: expandObjective(objective),
    experience: experience_arr.length ? experience_arr : [],
    education: education_arr.length ? education_arr : [],
    skills: expanded_skills.length ? expanded_skills : ['Communication', 'Teamwork', 'Problem-solving', 'Adaptability'],
    certifications: certs_arr.length ? certs_arr : []
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
  
  const cards = [];
  
  // Strategy: Split by sentences and create cards from each
  const sentences = text.match(/[^.!?]+[.!?]+/g) || text.split('\n').filter(l => l.trim());
  
  // Create one card per sentence
  sentences.forEach((sentence, idx) => {
    const cleaned = sentence.trim().replace(/^[-•*]\s*/, '').replace(/[.!?]+$/, '');
    if (cleaned.length < 10) return; // Skip very short
    
    // Decide question style based on content
    let question, answer;
    
    if (cleaned.includes(':')) {
      // Definition format
      const [term, def] = cleaned.split(':').map(s => s.trim());
      question = `What is ${term}?`;
      answer = def || term;
    } else if (cleaned.toLowerCase().match(/^(why|how|what|when|where)/i)) {
      // Already a question
      question = cleaned;
      answer = `This refers to the concept explained in the material about ${cleaned.slice(0, 30)}.`;
    } else {
      // Make it a question
      question = `Explain: ${cleaned.slice(0, 70)}${cleaned.length > 70 ? '...' : ''}`;
      answer = cleaned;
    }
    
    cards.push({ question, answer });
  });
  
  // If we have less than 12, duplicate and rephrase some
  while (cards.length < 12) {
    const existingCard = cards[Math.floor(Math.random() * cards.length)];
    if (!existingCard) break;
    
    const newQuestion = `Based on the material, ${existingCard.question}`;
    cards.push({
      question: newQuestion,
      answer: existingCard.answer
    });
  }
  
  return cards.slice(0, 12);
}

module.exports = { generateCompletion, buildFlashcardsTemplate, buildResumeTemplate, buildCoverTemplate };
