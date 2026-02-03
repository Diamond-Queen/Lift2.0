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
  if (context.type === 'quiz') {
    return { provider: 'template', content: JSON.stringify(buildQuizTemplate(context)) };
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

// Basic quiz template generator (used as a fast fallback when no AI provider available)
function buildQuizTemplate({ notes }) {
  const text = String(notes || '').trim();
  if (!text) return [];

  // Extract candidate items from sentences or bullet lines
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const candidates = (lines.length > 4 ? lines : sentences.length > 0 ? sentences : [text]).slice(0, 20);

  const quiz = [];

  // Helper to build distractors: simple variants based on numeric changes or word swaps
  const makeDistractors = (answer) => {
    const distractors = new Set();
    const a = String(answer).trim();
    // If numeric, create +- variants
    const num = parseFloat(a.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(num)) {
      distractors.add(String(num + 1));
      distractors.add(String(num - 1));
      distractors.add(String((num * 2).toFixed(2)));
    }
    // Text fallback: shuffle words or change key verb
    const words = a.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const swapped = words.slice().reverse().join(' ');
      distractors.add(swapped.slice(0, 40));
    }
    // Ensure we have at least 2 distractors
    while (distractors.size < 2) {
      distractors.add(a + ' (not correct)');
    }
    return Array.from(distractors).slice(0, 3);
  };

  for (let i = 0; i < candidates.length && quiz.length < 10; i++) {
    const raw = candidates[i];
    const cleaned = raw.replace(/^[-•*\d\.\)\s]+/, '').replace(/["']/g, '').trim();
    if (!cleaned || cleaned.length < 8) continue;

    // Heuristic: if line contains ':' treat as term:definition
    let question = '';
    let answer = '';
    if (cleaned.includes(':')) {
      const [term, def] = cleaned.split(':').map(s => s.trim());
      question = `What is ${term}?`;
      answer = def || term;
    } else if (/=|\b=\b/.test(cleaned) || /\d/.test(cleaned) && cleaned.length < 60) {
      // Likely a formula or numeric: ask to compute/recall
      question = `According to the notes, ${cleaned}`;
      answer = cleaned;
    } else {
      // Default: ask to explain or identify key fact
      question = `Which statement best summarizes: ${cleaned.slice(0, 80)}${cleaned.length > 80 ? '...' : ''}`;
      answer = cleaned;
    }

    const distractors = makeDistractors(answer);
    // Build options with answer randomly placed
    const options = [...distractors.slice(0, 2), answer].slice(0, 3);
    // Shuffle
    for (let s = options.length - 1; s > 0; s--) {
      const j = Math.floor(Math.random() * (s + 1));
      [options[s], options[j]] = [options[j], options[s]];
    }
    const correctIndex = options.findIndex(o => String(o).trim() === String(answer).trim());
    const correctOption = String.fromCharCode(65 + (correctIndex >= 0 ? correctIndex : 0));

    quiz.push({ question, options, correctOption, solution: null });
  }

  return quiz;
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

  // Generate professional objective/summary - intelligently rewrites user input
  // Similar to cover letter generation: takes user input and crafts professional summary
  const generateObjective = (obj) => {
    if (!obj || typeof obj !== 'string') return null;
    const userInput = obj.trim();
    if (userInput.length === 0) return null;
    
    const lower = userInput.toLowerCase();
    let generatedSummary = '';
    
    // Extract key themes and career focus from input
    // Then craft a professional 1-2 sentence summary that incorporates their direction
    
    // Leadership/Management focus
    if (lower.includes('lead') || lower.includes('manage') || lower.includes('supervise') || 
        lower.includes('direct') || lower.includes('team') || lower.includes('guide')) {
      const focus = lower.includes('strategic') || lower.includes('vision') ? 'strategic leadership and organizational growth' : 'team development and project success';
      generatedSummary = `Results-driven leader dedicated to fostering high-performing teams and driving meaningful business impact through ${focus}. Passionate about mentoring talent and delivering strategic initiatives that advance organizational objectives.`;
    }
    // Technical/Engineering focus
    else if (lower.includes('engineer') || lower.includes('develop') || lower.includes('code') || 
             lower.includes('program') || lower.includes('software') || lower.includes('architect') ||
             lower.includes('system') || lower.includes('technical') || lower.includes('tech')) {
      const specialty = lower.includes('full') || lower.includes('stack') ? 'full-stack solutions' : lower.includes('cloud') ? 'cloud infrastructure' : 'scalable systems';
      generatedSummary = `Skilled software engineer passionate about architecting robust, scalable ${specialty} and solving complex technical challenges. Committed to writing clean code, continuous learning, and delivering high-impact solutions that drive business value.`;
    }
    // Creative/Design focus
    else if (lower.includes('design') || lower.includes('creative') || lower.includes('visual') ||
             lower.includes('artistic') || lower.includes('ux') || lower.includes('ui')) {
      const discipline = lower.includes('ux') || lower.includes('user') ? 'user-centered design' : lower.includes('graphic') ? 'visual design' : 'creative design';
      generatedSummary = `Creative designer focused on delivering exceptional user experiences through thoughtful ${discipline}. Dedicated to balancing aesthetics with functionality while collaborating cross-functionally to bring innovative ideas to life.`;
    }
    // Data/Analysis focus
    else if (lower.includes('data') || lower.includes('analyz') || lower.includes('insight') ||
             lower.includes('research') || lower.includes('metric') || lower.includes('report')) {
      generatedSummary = `Analytical professional skilled at transforming complex data into actionable insights and strategic recommendations. Passionate about uncovering patterns, supporting evidence-based decision-making, and driving measurable business outcomes through rigorous analysis.`;
    }
    // Customer/Service focus
    else if (lower.includes('customer') || lower.includes('client') || lower.includes('service') ||
             lower.includes('support') || lower.includes('relationship')) {
      generatedSummary = `Customer-focused professional committed to delivering exceptional service and building lasting relationships. Skilled at understanding client needs, resolving complex issues, and driving satisfaction through proactive communication and problem-solving.`;
    }
    // Marketing/Sales focus
    else if (lower.includes('market') || lower.includes('sales') || lower.includes('growth') ||
             lower.includes('business') || lower.includes('strategy')) {
      generatedSummary = `Strategic marketing and sales professional driven by sustainable business growth and authentic customer engagement. Experienced in developing compelling campaigns, building brand value, and translating strategy into measurable results that drive revenue impact.`;
    }
    // Financial/Operations focus
    else if (lower.includes('financial') || lower.includes('accounting') || lower.includes('budget') ||
             lower.includes('operations') || lower.includes('process')) {
      generatedSummary = `Detail-oriented finance and operations professional with expertise in process optimization, financial management, and strategic planning. Committed to driving operational efficiency, maintaining accuracy, and supporting data-driven business decisions.`;
    }
    // HR/People focus
    else if (lower.includes('hr') || lower.includes('people') || lower.includes('talent') ||
             lower.includes('recruit') || lower.includes('organization')) {
      generatedSummary = `People-focused HR professional dedicated to building strong organizational cultures, attracting top talent, and supporting employee growth. Skilled at strategic workforce planning, employee relations, and creating positive workplace environments that drive engagement and retention.`;
    }
    // Generic/catch-all: Build professional summary from the user's input
    else {
      // For short inputs, create a complete professional summary
      if (userInput.length < 50) {
        generatedSummary = `Accomplished professional with expertise in key areas including strategic planning, problem-solving, and driving results. Committed to delivering measurable value, continuous improvement, and making meaningful contributions to organizational success through collaboration and excellence.`;
      } else {
        // For longer inputs, create a completely new professional summary focused on core competencies
        const keyWords = userInput.match(/\b(problem|solution|lead|manage|build|create|drive|improve|strategic|innovation|growth|excellence|success|achieve|results)\w*/gi) || [];
        const focus = keyWords.length > 0 ? keyWords.slice(0, 2).join(' and ') : 'professional excellence';
        generatedSummary = `Results-driven professional with proven expertise in ${focus}. Dedicated to driving organizational success, delivering measurable impact, and making meaningful contributions through strategic thinking, proven expertise, and commitment to continuous improvement.`;
      }
    }
    
    return generatedSummary.charAt(0).toUpperCase() + generatedSummary.slice(1);
  };

  // Expand and professionalize skills
  const expandSkills = (skillsList) => {
    const baseSkills = parseSkillsArray(skillsList);
    const set = new Set(baseSkills.map(s => s.trim()).filter(Boolean));
    
    // Map of skills to related/professional expansions
    const skillExpansions = {
      'python': ['Python', 'Data Analysis', 'Machine Learning', 'Libraries & Frameworks', 'Automation'],
      'javascript': ['JavaScript', 'Web Development', 'Frontend Development', 'DOM Manipulation', 'Async Programming'],
      'communication': ['Verbal Communication', 'Written Communication', 'Presentation Skills', 'Stakeholder Engagement', 'Cross-functional Collaboration'],
      'leadership': ['Team Leadership', 'Strategic Planning', 'Mentoring', 'Project Management', 'Decision Making'],
      'excel': ['Excel', 'Data Analysis', 'Spreadsheet Management', 'Financial Modeling', 'Pivot Tables'],
      'sql': ['SQL', 'Database Management', 'Query Optimization', 'Data Extraction', 'Schema Design'],
      'design': ['UI/UX Design', 'Visual Design', 'Prototyping', 'User Research', 'Design Thinking'],
      'project management': ['Project Planning', 'Stakeholder Communication', 'Risk Management', 'Timeline Management', 'Resource Allocation'],
      'problem-solving': ['Problem-Solving', 'Critical Thinking', 'Solution Design', 'Analytical Skills', 'Root Cause Analysis'],
      'teamwork': ['Team Collaboration', 'Cross-functional Communication', 'Cooperation', 'Conflict Resolution', 'Active Listening'],
      'adaptability': ['Adaptability', 'Flexibility', 'Quick Learning', 'Change Management', 'Resilience'],
      'microsoft office': ['Microsoft Office', 'Word', 'PowerPoint', 'Excel', 'Access'],
      'c++': ['C++', 'Object-Oriented Programming', 'Systems Development', 'Performance Optimization', 'Algorithm Design'],
      'java': ['Java', 'Enterprise Development', 'Software Architecture', 'Spring Framework', 'Object-Oriented Design'],
      'react': ['React', 'JavaScript', 'Component Development', 'State Management', 'Web Development'],
      'marketing': ['Marketing Strategy', 'Digital Marketing', 'Brand Development', 'Campaign Management', 'Content Marketing'],
      'sales': ['Sales Strategy', 'Customer Relations', 'Revenue Growth', 'Negotiation', 'Pipeline Management'],
      'customer service': ['Customer Support', 'Client Relations', 'Problem Resolution', 'Service Excellence', 'Conflict Management'],
      'financial': ['Financial Analysis', 'Budgeting', 'Cost Management', 'Forecasting', 'Financial Reporting'],
      'research': ['Research', 'Data Collection', 'Analysis & Reporting', 'Literature Review', 'Methodology Design'],
      'writing': ['Technical Writing', 'Content Creation', 'Documentation', 'Copywriting', 'Editing & Proofreading'],
      'html': ['HTML', 'Web Development', 'Semantic Markup', 'Accessibility', 'Frontend Development'],
      'css': ['CSS', 'Styling', 'Responsive Design', 'Layout Design', 'Animation'],
      'aws': ['AWS', 'Cloud Computing', 'Infrastructure Management', 'DevOps', 'Deployment'],
      'coding': ['Problem-Solving', 'Software Development', 'Algorithm Design', 'Code Quality', 'Debugging', 'Version Control', 'Testing & QA'],
      'coding skills': ['Problem-Solving', 'Software Development', 'Algorithm Design', 'Code Quality', 'Debugging', 'Version Control', 'Testing & QA'],
      'programming': ['Object-Oriented Programming', 'Functional Programming', 'Algorithm Design', 'Data Structures', 'Software Architecture', 'Testing & Debugging'],
      'programming skills': ['Object-Oriented Programming', 'Functional Programming', 'Algorithm Design', 'Data Structures', 'Software Architecture', 'Testing & Debugging'],
      'technical': ['Technical Analysis', 'Problem-Solving', 'System Design', 'Troubleshooting', 'Technical Documentation', 'Technical Mentoring'],
      'soft skills': ['Communication', 'Problem-Solving', 'Teamwork', 'Adaptability', 'Leadership', 'Time Management'],
      'engineer': ['Software Engineering', 'Problem-Solving', 'System Design', 'Technical Leadership', 'Code Quality', 'Debugging'],
      'engineering': ['Software Engineering', 'Problem-Solving', 'System Design', 'Technical Leadership', 'Code Quality', 'Debugging'],
      'software': ['Software Development', 'Problem-Solving', 'System Design', 'Code Quality', 'Testing', 'Documentation'],
      'developer': ['Software Development', 'Problem-Solving', 'Coding', 'System Design', 'Testing & QA'],
      'development': ['Software Development', 'Problem-Solving', 'Coding', 'System Design', 'Testing & QA'],
      'manage': ['Team Leadership', 'Project Management', 'Stakeholder Communication', 'Strategic Planning', 'Decision Making'],
      'manager': ['Team Leadership', 'Project Management', 'Stakeholder Communication', 'Strategic Planning', 'Delegation'],
      'lead': ['Team Leadership', 'Strategic Planning', 'Mentoring', 'Project Management', 'Decision Making'],
      'analyst': ['Data Analysis', 'Problem-Solving', 'Research', 'Reporting', 'Critical Thinking'],
    };

    // Generic skill expansion for ANY unknown skill
    const expandUnknownSkill = (skill) => {
      const expanded = [skill]; // Keep the original
      const lower = skill.toLowerCase();
      
      // Detect skill category and add related skills based on common patterns
      if (lower.includes('soft') || lower.includes('interpersonal') || lower.includes('people')) {
        ['Communication', 'Problem-Solving', 'Teamwork', 'Adaptability', 'Leadership'].forEach(s => expanded.push(s));
      } else if (lower.includes('data') || lower.includes('analyt') || lower.includes('insight')) {
        ['Data Analysis', 'Problem-Solving', 'Research', 'Critical Thinking', 'Reporting'].forEach(s => expanded.push(s));
      } else if (lower.includes('manage') || lower.includes('strateg') || lower.includes('plan')) {
        ['Strategic Planning', 'Project Management', 'Decision Making', 'Problem-Solving', 'Communication'].forEach(s => expanded.push(s));
      } else if (lower.includes('creat') || lower.includes('design') || lower.includes('art')) {
        ['Design Thinking', 'Problem-Solving', 'Communication', 'Adaptability', 'Innovation'].forEach(s => expanded.push(s));
      } else if (lower.includes('tech') || lower.includes('system') || lower.includes('architect')) {
        ['System Design', 'Problem-Solving', 'Technical Leadership', 'Code Quality', 'Documentation'].forEach(s => expanded.push(s));
      } else if (lower.includes('customer') || lower.includes('client') || lower.includes('service')) {
        ['Communication', 'Problem-Solving', 'Adaptability', 'Empathy', 'Conflict Resolution'].forEach(s => expanded.push(s));
      } else {
        // Universal complement for any skill: add essential professional skills
        ['Problem-Solving', 'Communication', 'Teamwork', 'Adaptability'].forEach(s => expanded.push(s));
      }
      
      return expanded;
    };

    // Expand based on known skills - AGGRESSIVE matching
    for (const skill of [...set]) {
      const key = skill.toLowerCase();
      let expanded = false;
      
      if (skillExpansions[key]) {
        // Direct match found
        skillExpansions[key].forEach(s => set.add(s));
        expanded = true;
      } else {
        // Try partial matching for compound skills (e.g., "advanced coding" matches "coding")
        for (const mapKey of Object.keys(skillExpansions)) {
          if (key.includes(mapKey) || mapKey.includes(key)) {
            skillExpansions[mapKey].forEach(s => set.add(s));
            expanded = true;
            break; // Only match the first partial match
          }
        }
      }
      
      // If no predefined expansion found, use generic expansion
      if (!expanded) {
        expandUnknownSkill(skill).forEach(s => set.add(s));
      }
    }

    // If user provided minimal/no skills, add relevant universal skills
    if (set.size === 0) {
      // Add universal professional skills baseline
      ['Communication', 'Problem-Solving', 'Teamwork', 'Adaptability', 'Time Management'].forEach(s => set.add(s));
    } else if (set.size < 8) {
      // If user provided some but few skills, supplement with universal ones
      ['Problem-Solving', 'Teamwork', 'Communication'].forEach(s => set.add(s));
    }

    const result = Array.from(set).slice(0, 25);
    return result.length > 0 ? result : [];
  };

  const experience_arr = parseStringArray(experience);
  const education_arr = parseEducationArray(education);
  const expanded_skills = expandSkills(skills);
  const certs_arr = parseSkillsArray(certifications);
  const generated_objective = generateObjective(objective);

  // DEBUG: Log generations to verify they're happening
  if (objective) {
    logger.info('resume_template_generation', { 
      original_objective: objective.slice(0, 50), 
      generated_objective: generated_objective ? generated_objective.slice(0, 100) : 'null'
    });
  }
  if (skills) {
    logger.info('resume_skills_expansion', {
      original_skills: String(skills).slice(0, 50),
      expanded_count: expanded_skills ? expanded_skills.length : 0,
      expanded_sample: expanded_skills ? expanded_skills.slice(0, 3) : []
    });
  }

  // Build resume object, omitting empty fields
  const resumeObj = {
    name: name || ''
  };
  
  // Only add contact fields if they have actual values
  if (email && email.trim()) resumeObj.email = email;
  if (phone && phone.trim()) resumeObj.phone = phone;
  if (address && address.trim()) resumeObj.address = address;
  if (linkedin && linkedin.trim()) resumeObj.linkedin = linkedin;
  
  // Always include objective if generated
  if (generated_objective) resumeObj.objective = generated_objective;
  
  // Only add arrays if they have content
  if (experience_arr.length > 0) resumeObj.experience = experience_arr;
  if (education_arr.length > 0) resumeObj.education = education_arr;
  if (expanded_skills.length > 0) resumeObj.skills = expanded_skills;
  if (certs_arr.length > 0) resumeObj.certifications = certs_arr;

  return resumeObj;
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
  
  // Target 10-14 cards, minimum 8, maximum 16
  const targetMin = 8;
  const targetMax = 16;
  const targetOptimal = 12;
  
  // If we have less than minimum, duplicate and rephrase some
  while (cards.length < targetMin) {
    if (cards.length === 0) break;
    const existingCard = cards[Math.floor(Math.random() * cards.length)];
    const newQuestion = `Based on the material, ${existingCard.question}`;
    cards.push({
      question: newQuestion,
      answer: existingCard.answer
    });
  }
  
  // If we have between min and optimal, try to add more up to optimal
  while (cards.length < targetOptimal && cards.length > 0) {
    const existingCard = cards[Math.floor(Math.random() * cards.length)];
    const variations = [
      `How does ${existingCard.question.slice(0, 40)}...relate to other concepts?`,
      `What is the significance of ${existingCard.question.slice(0, 40)}...?`,
      `Describe: ${existingCard.answer.slice(0, 60)}${existingCard.answer.length > 60 ? '...' : ''}`
    ];
    cards.push({
      question: variations[Math.floor(Math.random() * variations.length)],
      answer: existingCard.answer
    });
  }
  
  return cards.slice(0, targetMax);
}

module.exports = { generateCompletion, buildFlashcardsTemplate, buildResumeTemplate, buildCoverTemplate };
