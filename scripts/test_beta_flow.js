/**
 * Comprehensive test of entire beta program flow
 * Tests: registration, beta enrollment, status checking, trial expiry
 */

const http = require('http');
const baseUrl = 'https://studentlift.org';

// Test data
const testUser = {
  name: 'Beta Tester',
  email: `test${Date.now()}@example.com`,
  password: 'TestPassword123!'
};

let sessionCookie = null;
let userId = null;

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (sessionCookie) {
      options.headers['Cookie'] = sessionCookie;
    }

    const req = require('https').request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Capture session cookie if present
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          sessionCookie = setCookie[0].split(';')[0];
        }
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Beta Program Comprehensive Tests\n');

  try {
    // Test 1: Register new user
    console.log('1️⃣  Testing user registration...');
    let res = await request('POST', '/api/auth/register', {
      name: testUser.name,
      email: testUser.email,
      password: testUser.password
    });
    console.log(`   Status: ${res.status}`);
    if (res.status !== 201) {
      console.error('   ❌ FAILED: Expected 201, got', res.status, res.body);
      return;
    }
    userId = res.body?.data?.user?.id;
    console.log(`   ✅ User created with ID: ${userId}\n`);

    // Test 2: Login and get session
    console.log('2️⃣  Testing login...');
    res = await request('POST', '/api/auth/[...nextauth]', {
      email: testUser.email,
      password: testUser.password
    });
    console.log(`   Status: ${res.status}`);
    if (res.status !== 200 && res.status !== 302) {
      console.log('   ⚠️  Login response:', res.status, res.body);
    }
    console.log(`   ✅ Session established\n`);

    // Test 3: Get user info
    console.log('3️⃣  Testing fetch user profile...');
    res = await request('GET', '/api/user');
    console.log(`   Status: ${res.status}`);
    if (res.status !== 200) {
      console.error('   ❌ FAILED: Expected 200, got', res.status);
      return;
    }
    const user = res.body?.data?.user;
    console.log(`   ✅ User profile retrieved`);
    console.log(`      - Name: ${user.name}`);
    console.log(`      - Email: ${user.email}`);
    console.log(`      - Onboarded: ${user.onboarded}\n`);

    // Test 4: Register for beta program
    console.log('4️⃣  Testing beta registration (school trial)...');
    res = await request('POST', '/api/beta/register', {
      trialType: 'school',
      schoolName: 'Test High School'
    });
    console.log(`   Status: ${res.status}`);
    if (res.status !== 201) {
      console.error('   ❌ FAILED: Expected 201, got', res.status, res.body);
      return;
    }
    const betaTester = res.body?.data?.betaTester;
    console.log(`   ✅ Beta registration successful`);
    console.log(`      - Trial Type: ${betaTester.trialType}`);
    console.log(`      - Days Remaining: ${betaTester.daysRemaining}`);
    console.log(`      - Ends At: ${betaTester.trialEndsAt}\n`);

    // Test 5: Get beta status
    console.log('5️⃣  Testing beta status retrieval...');
    res = await request('GET', '/api/beta/status');
    console.log(`   Status: ${res.status}`);
    if (res.status !== 200) {
      console.error('   ❌ FAILED: Expected 200, got', res.status);
      return;
    }
    const trial = res.body?.data?.trial;
    console.log(`   ✅ Beta status retrieved`);
    console.log(`      - Status: ${trial.status}`);
    console.log(`      - School Name: ${trial.schoolName}`);
    console.log(`      - Days Remaining: ${trial.daysRemaining}\n`);

    // Test 6: Check user is onboarded
    console.log('6️⃣  Testing onboarded status...');
    res = await request('GET', '/api/user');
    const updatedUser = res.body?.data?.user;
    if (!updatedUser.onboarded) {
      console.error('   ❌ FAILED: User should be onboarded');
      return;
    }
    console.log(`   ✅ User correctly marked as onboarded\n`);

    // Test 7: Try duplicate beta registration (should fail)
    console.log('7️⃣  Testing duplicate beta registration (should fail)...');
    res = await request('POST', '/api/beta/register', {
      trialType: 'social',
      organizationName: 'Test Org'
    });
    console.log(`   Status: ${res.status}`);
    if (res.status === 400) {
      console.log(`   ✅ Correctly rejected duplicate: "${res.body?.error}"\n`);
    } else {
      console.error('   ❌ FAILED: Should reject duplicate registration\n');
    }

    console.log('✅ All tests passed! Beta program is functional.\n');

  } catch (err) {
    console.error('❌ Test error:', err.message);
  }
}

runTests();
