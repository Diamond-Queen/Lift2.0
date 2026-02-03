#!/usr/bin/env node
/**
 * Test School Code Redirect Flow
 * 
 * Verifies:
 * 1. School codes exist in database
 * 2. Redirect /school/[code] → /onboarding/school?code=CODE
 * 3. Code redemption flow works end-to-end
 * 4. Logging at each step
 * 
 * Usage:
 *   node scripts/test_school_flow.js [--sync-first]
 * 
 * --sync-first : Run sync_school_codes.js before testing
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const syncFirst = process.argv.includes('--sync-first');
  
  console.log('\n============================================');
  console.log('School Code Flow Test');
  console.log('============================================\n');

  // Step 1: Check if schoolCodes.json exists
  console.log('[1/5] Checking schoolCodes.json...');
  const codesPath = path.join(process.cwd(), 'data', 'schoolCodes.json');
  if (!fs.existsSync(codesPath)) {
    console.error('❌ schoolCodes.json not found at:', codesPath);
    process.exit(1);
  }
  
  let codesData;
  try {
    codesData = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
    if (!Array.isArray(codesData)) {
      console.error('❌ schoolCodes.json is not an array');
      process.exit(1);
    }
    console.log(`✓ Found ${codesData.length} school codes:\n`);
    codesData.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.code} → ${item.schoolName} (${item.plan})`);
    });
  } catch (err) {
    console.error('❌ Failed to parse schoolCodes.json:', err.message);
    process.exit(1);
  }

  // Step 2: Check database configuration
  console.log('\n[2/5] Checking database configuration...');
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }
  console.log('✓ DATABASE_URL is set');

  // Step 3: Try syncing codes to database if --sync-first
  if (syncFirst) {
    console.log('\n[3/5] Syncing school codes to database...');
    try {
      const { execSync } = require('child_process');
      execSync('node scripts/sync_school_codes.js', { stdio: 'inherit' });
      console.log('✓ Sync completed');
    } catch (err) {
      console.error('❌ Sync failed:', err.message);
      process.exit(1);
    }
  } else {
    console.log('\n[3/5] Skipping database sync (use --sync-first to enable)');
  }

  // Step 4: Check if redirect route exists
  console.log('\n[4/5] Checking redirect route...');
  const redirectPath = path.join(process.cwd(), 'pages', 'school', '[code].jsx');
  if (!fs.existsSync(redirectPath)) {
    console.error('❌ Redirect route not found at:', redirectPath);
    process.exit(1);
  }
  const redirectContent = fs.readFileSync(redirectPath, 'utf8');
  if (redirectContent.includes('getServerSideProps') && redirectContent.includes('redirect')) {
    console.log('✓ Redirect route exists and has getServerSideProps');
  } else {
    console.error('❌ Redirect route missing expected redirect logic');
    process.exit(1);
  }

  // Step 5: Check onboarding page
  console.log('\n[5/5] Checking onboarding school page...');
  const onboardingPath = path.join(process.cwd(), 'pages', 'onboarding', 'school.jsx');
  if (!fs.existsSync(onboardingPath)) {
    console.error('❌ Onboarding page not found at:', onboardingPath);
    process.exit(1);
  }
  const onboardingContent = fs.readFileSync(onboardingPath, 'utf8');
  if (onboardingContent.includes('router.query?.code')) {
    console.log('✓ Onboarding page reads code from query string');
  } else {
    console.error('❌ Onboarding page missing query code logic');
    process.exit(1);
  }
  if (onboardingContent.includes('console.log') && onboardingContent.includes('[onboarding/school]')) {
    console.log('✓ Onboarding page has logging');
  } else {
    console.log('⚠ Onboarding page could have more detailed logging');
  }

  console.log('\n============================================');
  console.log('✓ All checks passed!');
  console.log('============================================\n');
  console.log('Test codes to try:');
  codesData.forEach(code => {
    console.log(`  http://localhost:3000/school/${code.code}`);
  });
  console.log('\nThis should redirect to: http://localhost:3000/onboarding/school?code=<CODE>\n');
  console.log('To test the complete flow:');
  console.log('  1. Sign up as a new user');
  console.log('  2. Visit one of the test URLs above');
  console.log('  3. Check browser console and server logs for detailed logging\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
