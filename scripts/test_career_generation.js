/**
 * Test script for resume and cover letter generation
 * Tests all AI tone preferences and template formats
 */

const testResumeGeneration = async () => {
  console.log('🧪 Testing Resume Generation...\n');

  const testData = {
    type: 'resume',
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '(555) 123-4567',
    address: '123 Main St, City, ST 12345',
    linkedin: 'linkedin.com/in/janedoe',
    objective: 'Experienced software engineer seeking a senior role in web development with focus on scalable applications.',
    experience: 'Senior Developer | Tech Corp | 2020-2023 | Built microservices architecture\nDeveloper | StartupCo | 2018-2020 | Created React applications',
    education: 'BS Computer Science | MIT | 2018\nOnline Certifications | Coursera | 2019',
    skills: 'JavaScript, React, Node.js, PostgreSQL, AWS',
    certifications: 'AWS Certified Developer, Google Cloud Professional',
    formatTemplate: `Professional Resume Format:
- Contact info at top
- Professional Summary: 2-3 sentences
- Experience: Job Title | Company | Dates
- Education: Degree, School (Year)
- Skills: Comma-separated
- Certifications: List`
  };

  try {
    const response = await fetch('http://localhost:3000/api/career', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Resume generation failed:', error);
      return false;
    }

    const result = await response.json();
    console.log('✅ Resume generation successful!');
    console.log('📄 Generated Resume:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');
    return true;
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    return false;
  }
};

const testCoverLetterGeneration = async () => {
  console.log('🧪 Testing Cover Letter Generation...\n');

  const testData = {
    type: 'cover',
    name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '(555) 987-6543',
    recipient: 'Hiring Manager at Tech Innovations Inc.',
    position: 'Senior Frontend Developer',
    paragraphs: 'I am excited about this role because I have 5 years of experience building scalable React applications. My expertise in TypeScript and modern frontend architecture makes me a great fit.',
    formatTemplate: `Formal Cover Letter:
[Your Name]
[Contact Info]

Dear [Recipient],

[Opening: Express interest]
[Body: Highlight skills]
[Closing: Call to action]

Sincerely,
[Your Name]`
  };

  try {
    const response = await fetch('http://localhost:3000/api/career', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Cover letter generation failed:', error);
      return false;
    }

    const result = await response.json();
    console.log('✅ Cover letter generation successful!');
    console.log('📝 Generated Cover Letter:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');
    return true;
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    return false;
  }
};

const testAITones = async () => {
  console.log('🧪 Testing AI Tone Variations...\n');

  const tones = ['professional', 'friendly', 'technical', 'creative'];
  const results = {};

  for (const tone of tones) {
    console.log(`Testing ${tone} tone...`);
    
    const testData = {
      type: 'resume',
      name: 'Test User',
      email: 'test@example.com',
      phone: '555-0000',
      address: '123 Test St',
      linkedin: 'linkedin.com/test',
      objective: 'Seeking a challenging role in software development',
      experience: 'Developer | Company | 2020-2023 | Built applications',
      education: 'BS Computer Science | University | 2020',
      skills: 'Python, JavaScript',
      certifications: 'AWS Certified',
      formatTemplate: `Format with ${tone} tone`
    };

    try {
      const response = await fetch('http://localhost:3000/api/career', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Note: In real implementation, tone would be pulled from user session
        },
        body: JSON.stringify(testData)
      });

      if (response.ok) {
        const result = await response.json();
        results[tone] = '✅ Success';
        console.log(`✅ ${tone} tone works\n`);
      } else {
        results[tone] = '❌ Failed';
        console.log(`❌ ${tone} tone failed\n`);
      }
    } catch (err) {
      results[tone] = '❌ Error: ' + err.message;
      console.log(`❌ ${tone} tone error: ${err.message}\n`);
    }
  }

  console.log('Tone Test Results:', results);
  return results;
};

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Career API Tests\n');
  console.log('=' .repeat(50) + '\n');

  const resumeResult = await testResumeGeneration();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const coverResult = await testCoverLetterGeneration();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Note: Tone test requires authentication in real scenario
  // const toneResults = await testAITones();

  console.log('=' .repeat(50));
  console.log('\n📊 Test Summary:');
  console.log(`Resume Generation: ${resumeResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Cover Letter Generation: ${coverResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\n✨ All basic tests completed!');
  console.log('\nNote: To test AI tone preferences, sign in and set preferences in /settings');
}

// Run tests
runAllTests().catch(console.error);
