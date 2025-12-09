#!/usr/bin/env node
/**
 * Generate a test school code for development testing
 * Usage: node scripts/generate_test_school_code.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function generateTestSchoolCode() {
  const client = await pool.connect();
  try {
    // Check if test school exists, create if not
    const { rows: schools } = await client.query('SELECT * FROM "School" WHERE name = $1 LIMIT 1', ['Test High School']);
    let school = schools[0];
    
    if (!school) {
      console.log('Creating Test High School...');
      const { rows } = await client.query(
        'INSERT INTO "School" (id, name, plan, "createdAt") VALUES (gen_random_uuid(), $1, $2, NOW()) RETURNING *',
        ['Test High School', 'free']
      );
      school = rows[0];
      console.log('✓ Test school created:', school.name);
    } else {
      console.log('✓ Test school already exists:', school.name);
    }

    // Generate a simple test code
    const testCode = 'TEST' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await client.query(
      'INSERT INTO "SchoolCode" (id, code, "schoolId", redeemed, "createdAt") VALUES (gen_random_uuid(), $1, $2, false, NOW())',
      [testCode, school.id]
    );

    console.log('\n✓ Test school code generated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('School:', school.name);
    console.log('Code:', testCode);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nUse this code in the onboarding flow to test school code redemption.');
    
  } catch (err) {
    console.error('Error generating test school code:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

generateTestSchoolCode();
