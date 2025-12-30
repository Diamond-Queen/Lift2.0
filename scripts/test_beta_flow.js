/**
 * Beta Program API Test Suite
 * Tests basic registration and validation
 */

const https = require('https');
const baseUrl = 'https://studentlift.org';

// Test data
const testUser = {
  name: 'Beta Tester',
  email: `test${Date.now()}@example.com`,
  password: 'TestPassword123!'
};

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
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
  console.log('🧪 Starting Beta Program API Tests\n');

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
      console.error('   ❌ FAILED: Expected 201, got', res.status);
      console.error('   Response:', res.body);
      return;
    }
    console.log(`   ✅ User registered successfully\n`);

    // Test 2: Try duplicate registration (should fail with 409)
    console.log('2️⃣  Testing duplicate user registration...');
    res = await request('POST', '/api/auth/register', {
      name: testUser.name,
      email: testUser.email,
      password: testUser.password
    });
    console.log(`   Status: ${res.status}`);
    if (res.status === 409) {
      console.log(`   ✅ Correctly rejected duplicate\n`);
    } else {
      console.log(`   ⚠️  Expected 409, got ${res.status}\n`);
    }

    // Test 3: Test invalid email
    console.log('3️⃣  Testing invalid email validation...');
    res = await request('POST', '/api/auth/register', {
      name: 'Invalid User',
      email: 'not-an-email',
      password: 'TestPassword123!'
    });
    console.log(`   Status: ${res.status}`);
    if (res.status >= 400) {
      console.log(`   ✅ Correctly rejected invalid email\n`);
    } else {
      console.log(`   ⚠️  Should reject invalid email\n`);
    }

    // Test 4: Test empty password
    console.log('4️⃣  Testing empty password validation...');
    res = await request('POST', '/api/auth/register', {
      name: 'Empty Pass User',
      email: `test${Date.now()}2@example.com`,
      password: ''
    });
    console.log(`   Status: ${res.status}`);
    if (res.status >= 400) {
      console.log(`   ✅ Correctly rejected empty password\n`);
    } else {
      console.log(`   ⚠️  Should reject empty password\n`);
    }

    console.log('✅ Test suite completed!\n');
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    console.error(error);
  }
}

runTests();
