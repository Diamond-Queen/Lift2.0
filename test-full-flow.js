const { generateCompletion, buildResumeTemplate } = require('./lib/ai.js');

async function testResume() {
  console.log('=== Testing Resume Generation Flow ===\n');
  
  // Simulate what career.js does
  const name = 'John Doe';
  const objective = 'Software Engineer';
  const skills = 'Coding Skills';
  const experience = '';
  const education = '';
  const certifications = '';
  
  const type = 'resume';
  
  // Build the prompt like career.js does
  const prompt = `
You are a professional resume writer. Your task is to generate a JSON object representing a polished resume.

--- RAW USER INPUT ---
Name: ${name}
Email: 
Phone: 
Address: 
LinkedIn/Portfolio: 
About Yourself/Career Direction: ${objective}
Experience: N/A
Education: N/A
Skills: ${skills}
Certifications: N/A

--- REQUIRED JSON FORMAT ---
{
  "name": "${name}",
  "objective": "A compelling, expanded 2-3 sentence professional summary.",
  "skills": ["Skill 1", "Skill 2"]
}
`;

  console.log('1. Calling generateCompletion (AI API)...\n');
  const aiResponse = await generateCompletion({
    prompt,
    temperature: 0.7,
    type: 'json',
    context: { type: 'resume', name, objective, skills }
  });
  
  console.log('AI Provider:', aiResponse.provider);
  console.log('AI Response (first 200 chars):', aiResponse.content.slice(0, 200));
  
  // Parse the JSON response
  let result;
  try {
    const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch[0]);
    console.log('\nParsed result:');
    console.log('  Objective:', result.objective ? result.objective.slice(0, 80) : 'N/A');
    console.log('  Skills:', Array.isArray(result.skills) ? result.skills.slice(0, 3) : result.skills);
  } catch (e) {
    console.log('Failed to parse JSON:', e.message);
    result = { name, objective, skills: [] };
  }
  
  // Now apply buildResumeTemplate expansion like career.js does
  console.log('\n2. Applying buildResumeTemplate expansion...\n');
  const expanded = buildResumeTemplate({
    name: result.name || name || '',
    email: '',
    phone: '',
    address: '',
    linkedin: '',
    objective: result.objective || objective || '',
    experience: result.experience || [],
    education: result.education || [],
    skills: result.skills || skills || [],
    certifications: result.certifications || []
  });
  
  console.log('After expansion:');
  console.log('  Objective:', expanded.objective ? expanded.objective.slice(0, 100) : 'N/A');
  console.log('  Skills:', Array.isArray(expanded.skills) ? expanded.skills.slice(0, 5) : expanded.skills);
  
  // Simulate the final assignment like career.js does
  console.log('\n3. Final result assignment (career.js logic)...\n');
  result.objective = expanded.objective || result.objective;
  result.skills = expanded.skills && expanded.skills.length > 0 ? expanded.skills : (result.skills || []);
  
  console.log('Final result to be sent to client:');
  console.log('  Objective:', result.objective ? result.objective.slice(0, 100) : 'N/A');
  console.log('  Skills:', Array.isArray(result.skills) ? result.skills.slice(0, 5) : result.skills);
  
  console.log('\n=== DONE ===');
  console.log('Check if objective was expanded and skills list was enriched.');
}

testResume().catch(err => console.error('Error:', err.message));
