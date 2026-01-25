const { buildResumeTemplate } = require('./lib/ai.js');

console.log('\n=== TEST 1: Software Engineer + Coding Skills ===');
const result1 = buildResumeTemplate({
  name: 'John Doe',
  email: '',
  phone: '',
  address: '',
  linkedin: '',
  objective: 'Software Engineer',
  experience: [],
  education: [],
  skills: 'Coding Skills',
  certifications: []
});

console.log('\nOriginal objective: "Software Engineer"');
console.log('Expanded objective:', result1.objective || 'NOT SET');
console.log('\nOriginal skills: "Coding Skills"');
console.log('Expanded skills:', result1.skills);
console.log('Skills count:', result1.skills ? result1.skills.length : 0);

console.log('\n=== TEST 2: Just "Developer" ===');
const result2 = buildResumeTemplate({
  name: 'Jane Smith',
  email: 'jane@example.com',
  phone: '555-1234',
  address: '',
  linkedin: '',
  objective: 'Developer',
  experience: [],
  education: [],
  skills: '',
  certifications: []
});

console.log('\nOriginal objective: "Developer"');
console.log('Expanded objective:', result2.objective || 'NOT SET');
console.log('\nResult object keys:', Object.keys(result2));
console.log('Has email?', 'email' in result2);
console.log('Email value:', result2.email);
console.log('Has skills?', 'skills' in result2);

console.log('\n=== TEST 3: Minimal input "I like coding" ===');
const result3 = buildResumeTemplate({
  name: 'Bob Jones',
  email: '',
  phone: '',
  address: '',
  linkedin: '',
  objective: 'I like coding',
  experience: [],
  education: [],
  skills: 'coding',
  certifications: []
});

console.log('\nOriginal objective: "I like coding"');
console.log('Expanded objective:', result3.objective || 'NOT SET');
console.log('\nOriginal skills: "coding"');
console.log('Expanded skills:', result3.skills);
console.log('Skills count:', result3.skills ? result3.skills.length : 0);

console.log('\n=== TEST 4: Empty objective (should be null) ===');
const result4 = buildResumeTemplate({
  name: 'Alice Wonder',
  email: '',
  phone: '',
  address: '',
  linkedin: '',
  objective: '',
  experience: [],
  education: [],
  skills: 'Communication',
  certifications: []
});

console.log('\nObjective (empty input):', result4.objective || 'NOT SET/NULL');
console.log('Result has objective key?', 'objective' in result4);
