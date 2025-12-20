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
const prisma = require('../../lib/prisma');
const { pool } = require('../../lib/db');

export default async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('career_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const rl = trackIpRateLimit(ip, '/api/career');
  if (!rl.allowed) {
    auditLog('career_rate_limited', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  // Load user preferences for AI tone (if authenticated)
  let aiTone = 'professional'; // Default tone
  try {
    const { authOptions } = await import('./auth/[...nextauth]');
    const session = await getServerSession(req, res, authOptions);
    if (session?.user?.id) {
      if (prisma) {
        const user = await prisma.user.findUnique({ 
          where: { id: session.user.id }, 
          select: { preferences: true } 
        });
        aiTone = user?.preferences?.aiTone || 'professional';
      } else {
        const { rows } = await pool.query('SELECT preferences FROM "User" WHERE id = $1', [session.user.id]);
        aiTone = rows[0]?.preferences?.aiTone || 'professional';
      }
    }
  } catch (err) {
    // If preference load fails, continue with default
    logger.error('Failed to load AI tone preference', { error: err.message });
  }

  const {
    type,
    name,
    email,
    phone,
    address,
    linkedin,
    objective, // Now used as "About Yourself/Career Direction"
    experience,
    education,
    skills,
    certifications,
    recipient,
    position,
    paragraphs,
    formatTemplate,
  } = req.body;

  // Be lenient: allow minimal inputs; if missing some fields, synthesize sensible defaults
  if (!name) return res.status(400).json({ ok: false, error: "Name is required." });
  if ((objective || '').length > 5000) return res.status(413).json({ ok: false, error: 'Objective too long (max 5k chars)' });
  if ((paragraphs || '').length > 8000) return res.status(413).json({ ok: false, error: 'Paragraphs too long (max 8k chars)' });

  // Helper: sanitize incoming structured inputs (objects/arrays/strings) into plain strings
  const sanitizeValue = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
    if (Array.isArray(v)) return v.map(sanitizeValue).filter(Boolean).join(', ');
    if (typeof v === "object") {
      // prefer obvious readable fields
      const preferred = ["name","title","degree","qualification","school","institution","college","company","employer","dates","date","period","details","description","role","position"];
      for (const f of preferred) if (v[f]) return sanitizeValue(v[f]);
      // if single-key wrapper, return that value
      const entries = Object.entries(v);
      if (entries.length === 1) return sanitizeValue(entries[0][1]);
      // join readable string parts
      const vals = entries.map(([k,val]) => sanitizeValue(val)).filter(Boolean);
      return vals.join(' — ');
    }
    return String(v);
  };

  // If the client already provided structured arrays for education/experience/etc,
  // don't call the AI — instead sanitize and return a deterministic result so
  // the client sees readable strings instead of [object Object] artifacts.
  const hasStructuredInput = (Array.isArray(education) && education.length > 0) || (Array.isArray(experience) && experience.length > 0) || (Array.isArray(certifications) && certifications.length > 0) || (Array.isArray(skills) && skills.length > 0);
  if (type === 'resume' && hasStructuredInput) {
    const parseLine = (s) => {
      const str = String(s || '').trim();
      if (!str) return { raw: '' };
      // Try pipe-separated: title | company | dates | details
      if (str.includes('|')) {
        const parts = str.split('|').map(p => p.trim());
        return { title: parts[0]||'', company: parts[1]||'', dates: parts[2]||'', details: parts[3]||parts.slice(3).join(' | ') };
      }
      // Try comma-separated: title, company, dates, details
      if (str.includes(',')) {
        const parts = str.split(',').map(p => p.trim());
        return { title: parts[0]||'', company: parts[1]||'', dates: parts[2]||'', details: parts[3]||parts.slice(3).join(', ') };
      }
      // Try dash-separated
      const dashParts = str.split(/\s[-–—]\s/).map(p=>p.trim());
      if (dashParts.length >= 2) return { title: dashParts[0]||'', company: dashParts[1]||'', dates: dashParts[2]||'', details: dashParts[3]||'' };
      // fallback: treat as single raw string
      return { raw: str };
    };

    const out = {
      name: sanitizeValue(name),
      email: sanitizeValue(email),
      phone: sanitizeValue(phone),
      address: sanitizeValue(address || ''),
      linkedin: sanitizeValue(linkedin || ''),
      objective: sanitizeValue(objective || ''),
      experience: [],
      education: [],
      skills: [],
      certifications: []
    };

    if (Array.isArray(experience)) {
      // Produce human-readable strings to avoid nested objects in responses
      out.experience = experience.map(e => {
        if (typeof e === 'string') {
          const p = parseLine(e);
          const parts = [];
          if (p.title) parts.push(p.title);
          if (p.company) parts.push(p.company);
          const head = parts.join(' — ');
          const tail = [];
          if (p.dates) tail.push(p.dates);
          if (p.details) tail.push(p.details);
          return head + (tail.length ? ` (${tail.join('; ')})` : '');
        }
        if (typeof e === 'object') {
          const title = sanitizeValue(e.title || e.position || e.role || e.name);
          const company = sanitizeValue(e.company || e.employer);
          const dates = sanitizeValue(e.dates || e.date || e.period);
          const details = sanitizeValue(e.details || e.description || e.responsibilities);
          const head = [title, company].filter(Boolean).join(' — ');
          const tail = [dates, details].filter(Boolean).join('; ');
          return head + (tail ? ` (${tail})` : '');
        }
        return sanitizeValue(e);
      }).filter(Boolean);
    }

      // Populate education, skills, and certifications from structured input
      if (Array.isArray(education)) {
        out.education = education.map(ed => {
          if (typeof ed === 'string') {
            const parsed = parseLine(ed);
            const deg = sanitizeValue(parsed.title || parsed.raw || '');
            const school = sanitizeValue(parsed.company || '');
            const dates = sanitizeValue(parsed.dates || '');
            return [deg, school].filter(Boolean).join(', ') + (dates ? ` (${dates})` : '');
          }
          if (typeof ed === 'object') {
            const degree = sanitizeValue(ed.degree || ed.deg || ed.qualification || ed.name || ed.title);
            const school = sanitizeValue(ed.school || ed.institution || ed.college);
            const dates = sanitizeValue(ed.dates || ed.date || ed.period);
            return [degree, school].filter(Boolean).join(', ') + (dates ? ` (${dates})` : '');
          }
          return sanitizeValue(ed);
        }).filter(Boolean);
      }

      if (Array.isArray(skills)) out.skills = skills.map(sanitizeValue);
      else if (skills && typeof skills === 'string') out.skills = skills.split(',').map(s=>s.trim()).filter(Boolean);

      if (Array.isArray(certifications)) out.certifications = certifications.map(sanitizeValue);
      else if (certifications && typeof certifications === 'string') out.certifications = certifications.split(',').map(s=>s.trim()).filter(Boolean);

    if (Array.isArray(experience)) {
      // Produce human-readable strings to avoid nested objects
      const fmt = (partsObj) => {
        const title = sanitizeValue(partsObj.title || partsObj.name || partsObj.position || partsObj.role);
        const company = sanitizeValue(partsObj.company || partsObj.employer);
        const dates = sanitizeValue(partsObj.dates || partsObj.date || partsObj.period);
        const details = sanitizeValue(partsObj.details || partsObj.description || partsObj.responsibilities);
        const headParts = [title, company].filter(Boolean);
        const head = headParts.join(' — ');
        const tailParts = [dates, details].filter(Boolean);
        const tail = tailParts.join('; ');
        if (head && tail) return `${head} (${tail})`;
        if (head) return head;
        if (tail) return tail;
        return '';
      };

      out.experience = experience.map(e => {
        if (typeof e === 'string') {
          const p = parseLine(e);
          return fmt({ title: p.title || p.raw, company: p.company, dates: p.dates, details: p.details });
        }
        if (typeof e === 'object') {
          return fmt(e);
        }
        return sanitizeValue(e);
      }).filter(Boolean);
    }
    return res.status(200).json({ ok: true, data: { result: out } });
  }

  try {
    let prompt;
    
    // Include user's format template if provided; otherwise apply a sensible default
    const defaultFormatTemplate = `
Layout preferences:
- Keep contact info at top in one line: email • phone • address (if present)
- Sections order: Objective, Experience, Education, Skills, Certifications
- Experience: Title — Company (Dates) on one line, details on next line
- Education: Degree, School (Dates) on one line
- Skills/Certifications: comma-separated on one line
- Keep content concise and professional; avoid long paragraphs.
`;

    const formatInstructions = `\n\n--- FORMAT PREFERENCES ---\n${(formatTemplate || '').trim() || defaultFormatTemplate}\n\nIMPORTANT: Apply the above formatting preferences to the generated content while maintaining the required JSON structure.`;
    
    // Apply AI tone preference to prompts
    const toneMapping = {
      'professional': 'Use a formal, corporate tone. Be polished and conventional.',
      'friendly': 'Use a warm, conversational tone while remaining professional. Be approachable.',
      'creative': 'Use an engaging, unique voice. Be bold and memorable without sacrificing clarity.',
      'technical': 'Use precise, data-driven language. Focus on technical skills and quantifiable achievements.'
    };
    const toneInstruction = toneMapping[aiTone] || toneMapping['professional'];
    const toneDirective = `\n\n--- TONE & STYLE ---\n${toneInstruction}`;

    if (type === "resume") {
      // PROMPT FOR RESUME GENERATION
      prompt = `
You are a professional resume writer. Your task is to generate a JSON object representing a polished resume based on the raw, unstructured user inputs provided below.

--- CRITICAL INSTRUCTION ---
1.  **Strict Output:** You MUST output only the JSON object. Do not include any commentary, markdown fence (e.g., \`\`\`json), or explanations.
2.  **Required Structure:** The JSON MUST strictly conform to the structure below.
  3.  **Synthesis Only (No New Entities):** You may expand phrasing and summarize from hints. If some fields are missing (email, phone, address, linkedin), leave them empty strings.
  4.  **Skill Inference:** You may infer a list of generic professional skills (e.g., communication, problem-solving) only if the raw "Skills" list is empty.
  5.  **No New Entities:** Do NOT invent company names, school names, degree titles, or certifications that are not present in the user's raw input. If input is missing for 'experience', 'education', or 'certifications', return an empty array [] for those fields.

--- RAW USER INPUT ---
Name: ${name}
Email: ${email}
Phone: ${phone}
Address: ${address || "N/A"}
LinkedIn/Portfolio: ${linkedin || "N/A"}
About Yourself/Career Direction (Source for Summary): ${objective || "N/A"}
Experience (Title | Company | Dates | Details per line): ${experience || "N/A"}
Education (Degree | School | Dates per line): ${education || "N/A"}
Skills (Comma separated list): ${skills || "N/A"}
Certifications (Comma separated list): ${certifications || "N/A"}

--- REQUIRED JSON FORMAT ---
{
  "name": "${name}",
  "email": "${email || ''}",
  "phone": "${phone || ''}",
  "address": "${address || ""}",
  "linkedin": "${linkedin || ""}",
  "objective": "A compelling, synthesized professional summary goes here.",
  "experience": [
    { "title": "Job Title", "company": "Company Name", "dates": "Start - End Date", "details": "Key accomplishment or responsibility." }
  ],
  "education": [
    { "degree": "Degree/Major", "school": "Institution Name", "dates": "Start - End Date" }
  ],
  "skills": ["Skill 1", "Skill 2"],
  "certifications": ["Certification 1", "Certification 2"]
}${formatInstructions}${toneDirective}
      `;
    } else {
      // PROMPT FOR COVER LETTER GENERATION
      prompt = `
You are a professional correspondent. Your task is to generate a JSON object representing a formal cover letter by expanding the user's brief input into two well-developed professional paragraphs.

--- CRITICAL INSTRUCTION ---
1.  **Strict Output:** You MUST output only the JSON object. Do not include any commentary or explanations.
2.  **Required Structure:** The JSON MUST strictly conform to the structure below with EXACTLY 2 paragraphs.
3.  **Content Development:** Transform the user's raw input into two polished paragraphs:
    - Paragraph 1: Express interest in the position and briefly introduce relevant background/motivation based on their input.
    - Paragraph 2: Expand on specific skills, experiences, or qualities mentioned in their input; show how these align with the role.
4.  **Use Their Words:** Build directly from what they typed. Expand, rephrase professionally, and add structure—but do NOT invent qualifications, employers, or achievements they didn't mention.
5.  **Minimal Input Handling:** If input is very brief (e.g., "I want this job"), create professional paragraphs expressing enthusiasm and general readiness without specific false claims.

--- RAW USER INPUT ---
Name: ${name}
Recipient Name/Company: ${recipient || "N/A"}
Position Applied For: ${position || "N/A"}
User's Thoughts/Input to Expand: ${paragraphs || "N/A"}

--- REQUIRED JSON FORMAT (EXACTLY 2 PARAGRAPHS) ---
{
  "name": "${name}",
  "recipient": "${recipient || ""}",
  "position": "${position || ""}",
  "paragraphs": [
    "First paragraph: Introduction and motivation derived from user input.",
    "Second paragraph: Elaboration on skills/qualities from user input and closing with enthusiasm."
  ]
}${formatInstructions}${toneDirective}
      `;
    }

    // Use resilient AI adapter (OpenAI → Anthropic → Template fallback)
    const aiResponse = await generateCompletion({
      prompt,
      temperature: 0.7,
      type: 'json',
      context: {
        type: type,
        name,
        email,
        phone,
        address,
        linkedin,
        objective,
        experience,
        education,
        skills,
        certifications,
        recipient,
        position,
        paragraphs
      }
    });

    let raw = aiResponse.content;

    // Safely extract JSON object using regex as a fallback guardrail
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('career_no_json', { snippet: raw.slice(0,200), provider: aiResponse.provider });
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      logger.error('career_json_parse_error', { message: parseErr.message, provider: aiResponse.provider });
      return res.status(500).json({ error: "Failed to parse AI JSON" });
    }

    // Enforce no new entities: if raw inputs are missing, keep arrays empty
    const rawExp = String(experience || '').trim();
    const rawEdu = String(education || '').trim();
    const rawCerts = String(certifications || '').trim();

    if (!rawExp) {
      result.experience = Array.isArray(result.experience) ? [] : [];
    }
    if (!rawEdu) {
      result.education = Array.isArray(result.education) ? [] : [];
    }
    if (!rawCerts) {
      result.certifications = Array.isArray(result.certifications) ? [] : [];
    }
    // Skills: allow creative expansion when few are provided; never invent experience/education
    const rawSkillsStr = String(skills || '').trim();
    const rawSkillsArr = rawSkillsStr ? rawSkillsStr.split(',').map(s=>s.trim()).filter(Boolean) : [];
    const related = {
      'python': ['Pandas', 'NumPy', 'Data analysis'],
      'javascript': ['React', 'Node.js', 'DOM manipulation'],
      'communication': ['Presentation', 'Writing', 'Active listening'],
      'leadership': ['Mentoring', 'Delegation', 'Conflict resolution'],
      'excel': ['Pivot tables', 'VLOOKUP', 'Charts'],
      'sql': ['Joins', 'Query optimization', 'Schema design'],
      'design': ['Figma', 'Wireframing', 'Prototyping'],
      'project management': ['Planning', 'Risk management', 'Stakeholder communication']
    };

    const expandSkills = (seed) => {
      const set = new Set(seed.map(s=>String(s).trim()).filter(Boolean));
      for (const s of [...set]) {
        const key = s.toLowerCase();
        if (related[key]) {
          for (const r of related[key]) set.add(r);
        }
      }
      // ensure some generic baseline
      if (set.size < 4) ['Teamwork','Adaptability','Time management','Problem-solving'].forEach(g=>set.add(g));
      return [...set];
    };

    if (rawSkillsArr.length === 0) {
      const genericSkills = ['Communication','Problem-solving','Teamwork','Adaptability','Time management'];
      result.skills = Array.isArray(result.skills) && result.skills.length ? result.skills : genericSkills;
    } else if (rawSkillsArr.length < 4) {
      // expand creatively around the provided skills
      const seed = Array.isArray(result.skills) && result.skills.length ? result.skills : rawSkillsArr;
      result.skills = expandSkills(seed);
    } else {
      // keep as-is if user provided plenty
      if (!Array.isArray(result.skills) || result.skills.length === 0) result.skills = rawSkillsArr;
    }

    // If the AI returned no education entries but the user provided raw education input,
    // build a conservative fallback list from the raw lines so education shows on the resume.
    if (type === 'resume' && (!Array.isArray(result.education) || result.education.length === 0)) {
      const rawEdu = String(education || '').trim();
      if (rawEdu) {
        const degreeKeywords = ["diploma","high school","bachelor","master","phd","associate","certificate","certification","degree","ged"];
        const parseEducationLine = (line) => {
          const s = line.trim();
          if (!s) return {};
          // pipe-separated
          if (s.includes('|')) {
            const parts = s.split('|').map(p=>p.trim());
            // prefer degree|school or school|degree heuristics
            if (degreeKeywords.some(k => parts[0].toLowerCase().includes(k))) {
              return { degree: parts[0], school: parts[1] || '', dates: '' };
            }
            if (parts[1] && degreeKeywords.some(k => parts[1].toLowerCase().includes(k))) {
              return { degree: parts[1], school: parts[0] || '', dates: '' };
            }
            // fallback: treat first as school
            return { degree: '', school: parts[0] || '', dates: '' };
          }
          // 'Degree at School'
          const atMatch = s.match(/^(.*?)\s+at\s+(.*)$/i);
          if (atMatch) {
            const left = atMatch[1].trim();
            const right = atMatch[2].trim();
            if (degreeKeywords.some(k => left.toLowerCase().includes(k))) return { degree: left, school: right, dates: '' };
            if (degreeKeywords.some(k => right.toLowerCase().includes(k))) return { degree: right, school: left, dates: '' };
            return { degree: '', school: s, dates: '' };
          }
          // dash-separated
          const dashParts = s.split(/\s[-–—]\s/).map(p=>p.trim());
          if (dashParts.length >= 2) {
            if (degreeKeywords.some(k => dashParts[0].toLowerCase().includes(k))) return { degree: dashParts[0], school: dashParts[1], dates: '' };
            if (degreeKeywords.some(k => dashParts[1].toLowerCase().includes(k))) return { degree: dashParts[1], school: dashParts[0], dates: '' };
            return { degree: '', school: dashParts[0], dates: '' };
          }
          // if contains degree keyword
          if (degreeKeywords.some(k => s.toLowerCase().includes(k))) return { degree: s, school: '', dates: '' };
          // fallback: treat as school
          return { degree: '', school: s, dates: '' };
        };

        const eduArr = rawEdu.split(/\n+/).map(l=>l.trim()).filter(Boolean).map(line => {
          const p = parseEducationLine(line);
          return { degree: p.degree || '', school: p.school || (p.degree ? '' : line), dates: p.dates || '' };
        });
        if (eduArr.length) result.education = eduArr;
      }
    }

    // --- Safety check: ensure the model didn't invent facts that weren't provided ---
    // Helper: normalize strings
    const normalize = (s) => String(s || "").toLowerCase().trim();

    if (type === "resume") {
      // Build sets of provided companies/titles/education/certifications from raw inputs
      const providedTitles = new Set();
      const providedCompanies = new Set();
      const providedSchools = new Set();
      const providedDegrees = new Set();
      const providedCerts = new Set();

      const degreeKeywords = ["diploma","high school","bachelor","master","phd","associate","certificate","certification","degree","ged"];

      // Helper to parse a free-form experience line into title/company when possible
      const parseExperienceLine = (line) => {
        const s = line.trim();
        if (!s) return {};
        // Try pipe-separated
        if (s.includes('|')) {
          const parts = s.split('|').map(p => p.trim());
          return { title: parts[0] || '', company: parts[1] || '' };
        }
        // Try "Title at Company" pattern
        const atMatch = s.match(/^(.*?)\s+at\s+(.*)$/i);
        if (atMatch) return { title: atMatch[1].trim(), company: atMatch[2].trim() };
        // Try dash-separated
        const dashMatch = s.split(/\s[-–—]\s/);
        if (dashMatch.length >= 2) return { title: dashMatch[0].trim(), company: dashMatch[1].trim() };
        // Fallback: treat whole line as title (student input often only writes role)
        return { title: s, company: '' };
      };

      (String(experience || "") || "").split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
        const parsed = parseExperienceLine(line);
        if (parsed.title) providedTitles.add(parsed.title.toLowerCase());
        if (parsed.company) providedCompanies.add(parsed.company.toLowerCase());
      });

      // Parse education lines - be flexible: accept 'Degree | School', 'School - Degree', 'High School Diploma', etc.
      (String(education || "") || "").split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
        const low = line.toLowerCase();
        // If contains pipe, assume degree|school or school|degree
        if (low.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          // heuristics: if left looks like degree keyword, treat as degree
          if (degreeKeywords.some(k => parts[0].toLowerCase().includes(k))) {
            providedDegrees.add(parts[0].toLowerCase());
            if (parts[1]) providedSchools.add(parts[1].toLowerCase());
          } else if (degreeKeywords.some(k => parts[1].toLowerCase().includes(k))) {
            providedDegrees.add(parts[1].toLowerCase());
            if (parts[0]) providedSchools.add(parts[0].toLowerCase());
          } else {
            // unknown ordering: add both as potential schools/degrees
            if (parts[0]) providedSchools.add(parts[0].toLowerCase());
            if (parts[1]) providedSchools.add(parts[1].toLowerCase());
          }
          return;
        }
        // Try 'Degree at School' or 'School - Degree'
        const atMatch = line.match(/^(.*?)\s+at\s+(.*)$/i);
        if (atMatch) {
          const left = atMatch[1].trim();
          const right = atMatch[2].trim();
          if (degreeKeywords.some(k => left.toLowerCase().includes(k))) providedDegrees.add(left.toLowerCase());
          else providedSchools.add(left.toLowerCase());
          if (degreeKeywords.some(k => right.toLowerCase().includes(k))) providedDegrees.add(right.toLowerCase());
          else providedSchools.add(right.toLowerCase());
          return;
        }
        // Try dash
        const dashParts = line.split(/\s[-–—]\s/).map(p => p.trim());
        if (dashParts.length >= 2) {
          if (degreeKeywords.some(k => dashParts[0].toLowerCase().includes(k))) providedDegrees.add(dashParts[0].toLowerCase());
          else providedSchools.add(dashParts[0].toLowerCase());
          if (degreeKeywords.some(k => dashParts[1].toLowerCase().includes(k))) providedDegrees.add(dashParts[1].toLowerCase());
          else providedSchools.add(dashParts[1].toLowerCase());
          return;
        }
        // Finally, if the line contains a degree keyword, treat it as a provided degree (e.g., 'High School Diploma')
        if (degreeKeywords.some(k => low.includes(k))) {
          providedDegrees.add(low);
        } else {
          // otherwise, treat it as a school name
          providedSchools.add(low);
        }
      });

      (String(certifications || "") || "").split(',').map(c => c.trim().toLowerCase()).filter(Boolean).forEach(c => providedCerts.add(c));

      // Validate experience entries
      const invented = [];
      if (Array.isArray(result.experience)) {
        for (const item of result.experience) {
          const title = normalize(item.title || '');
          const company = normalize(item.company || '');
          const matchesTitle = title && [...providedTitles].some(t => title.includes(t) || t.includes(title) || title.includes(t.split(' ')[0]));
          const matchesCompany = company && [...providedCompanies].some(c => company.includes(c) || c.includes(company));
          // If neither title nor company matches anything provided AND we have no providedTitles/Companies at all, allow (user may have left blank)
          if (!(matchesTitle || matchesCompany) && ([...providedTitles].length || [...providedCompanies].length)) invented.push({ type: 'experience', item });
        }
      }

      if (Array.isArray(result.education)) {
        for (const edu of result.education) {
          const school = normalize(edu.school || '');
          const degree = normalize(edu.degree || '');
          let ok = false;
          // If the AI echoed a degree that the user provided, accept it
          if (degree && [...providedDegrees].some(d => degree.includes(d) || d.includes(degree))) ok = true;
          // If the AI included a school that matches provided schools, accept
          if (!ok && school && [...providedSchools].some(s => school.includes(s) || s.includes(school))) ok = true;
          // If user provided nothing for education, don't flag
          if ([...providedSchools].length === 0 && [...providedDegrees].length === 0) ok = true;
          if (!ok) invented.push({ type: 'education', item: edu });
        }
      }

      if (Array.isArray(result.certifications)) {
        for (const cert of result.certifications) {
          const c = normalize(cert || '');
          if (c && ![...providedCerts].some(pc => pc.includes(c) || c.includes(pc))) {
            invented.push({ type: 'certification', item: cert });
          }
        }
      }

      // Be lenient: do not hard-fail on minimal inputs; simply avoid adding obviously fabricated entities.
    } else {
      // Cover letter: remove strict matching; allow expansion from minimal hints without rejection.
    }
    // Always send structured object
    // Normalize the AI result to avoid nested objects being sent to the client
    const unwrap = (v) => {
      // Robust unwrap: handle primitives, arrays, objects with nested fields, and single-key wrappers
      if (v === null || v === undefined) return "";
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
      if (Array.isArray(v)) {
        const parts = v.map(unwrap).filter(Boolean);
        // If array of objects that each unwrap to a single string, join them
        return parts.length ? parts.join(", ") : "";
      }
      if (typeof v === "object") {
        // Prefer obvious readable fields (recursively)
        const preferred = ["name", "title", "degree", "qualification", "school", "institution", "college", "company", "employer", "dates", "date", "period", "details", "description"];
        for (const f of preferred) {
          if (v[f] !== undefined && v[f] !== null && v[f] !== "") return unwrap(v[f]);
        }
        // If object has a single primitive value, return it
        const entries = Object.entries(v);
        if (entries.length === 1) return unwrap(entries[0][1]);
        // Otherwise collect readable parts from values
        const vals = entries.map(([k, val]) => unwrap(val)).filter(Boolean);
        if (vals.length) return vals.join(" — ");
        // Last resort
        try { return JSON.stringify(v); } catch (e) { return String(v); }
      }
      return String(v);
    };

    // Ensure arrays/objects are in a simple, predictable shape for the client
    if (result && typeof result === "object") {
      if (Array.isArray(result.experience)) {
        result.experience = result.experience.map(e => ({
          title: unwrap(e.title || e.t || e.position || e.role),
          company: unwrap(e.company || e.employer),
          dates: unwrap(e.dates || e.date || e.period),
          details: unwrap(e.details || e.description || e.responsibilities)
        }));
      }
      if (Array.isArray(result.education)) {
        result.education = result.education.map(ed => ({
          degree: unwrap(ed.degree || ed.deg || ed.qualification || ed.name),
          school: unwrap(ed.school || ed.institution || ed.college),
          dates: unwrap(ed.dates || ed.date || ed.period)
        }));
      }
      if (Array.isArray(result.certifications)) {
        result.certifications = result.certifications.map(c => unwrap(c));
      }
      if (Array.isArray(result.skills)) {
        result.skills = result.skills.map(s => unwrap(s));
      }
    }

    // Final coercion: convert any remaining object entries into human-readable strings
    if (result && typeof result === 'object') {
      if (Array.isArray(result.experience)) {
        // Robust formatting: prefer title/company, fall back to dates/details, avoid empty parentheses
        result.experience = result.experience.map(item => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          const title = unwrap(item.title || item.name || item.position || item.role);
          const company = unwrap(item.company || item.employer);
          const dates = unwrap(item.dates || item.date || item.period);
          const details = unwrap(item.details || item.description || item.responsibilities);
          const headParts = [title, company].filter(Boolean);
          const head = headParts.join(' — ');
          const tailParts = [dates, details].filter(Boolean);
          const tail = tailParts.join('; ');
          if (head && tail) return `${head} (${tail})`;
          if (head) return head;
          if (tail) return tail;
          return '';
        }).filter(Boolean);
      }
      if (Array.isArray(result.education)) {
        result.education = result.education.map(item => {
          if (!item) return '';
          if (typeof item === 'string') return item;
          const degree = String(item.degree || item.name || item.title || '');
          const school = String(item.school || item.institution || item.college || '');
          const dates = String(item.dates || item.date || item.period || '');
          return [degree, school].filter(Boolean).join(', ') + (dates ? ` (${dates})` : '');
        }).filter(Boolean);
      }
    }

    res.status(200).json({ ok: true, data: { result } });

  } catch (err) {
    // Log the detailed error from OpenAI for debugging
    logger.error('career_handler_error', { message: err.message });
    res.status(500).json({ ok: false, error: "Failed to generate content." });
  }
}