#!/usr/bin/env node
/**
 * COMPREHENSIVE APP AUDIT
 * 
 * Audits the entire application flow:
 * - Authentication (signup, login, session)
 * - Onboarding (school, beta, subscription)
 * - Core Features (dashboard, notes, career)
 * - Access Control (trial, subscription, school)
 * - API Endpoints (all major APIs)
 * - Database (schema, data, integrity)
 * - Logging (logging at key points)
 * 
 * Usage:
 *   node scripts/comprehensive_app_audit.js
 */

const { pool } = require('../lib/db');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
  passed++;
}

function fail(msg) {
  console.log(`  ❌ ${msg}`);
  failed++;
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
  warnings++;
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${title}`);
  console.log('='.repeat(70));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('COMPREHENSIVE APP AUDIT');
  console.log('='.repeat(70));
  console.log(`\nDate: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log(`CWD: ${process.cwd()}\n`);

  const client = await pool.connect();

  try {
    // ========================================
    // 1. AUTHENTICATION FLOW
    // ========================================
    section('1. AUTHENTICATION FLOW');

    // Check signup page
    const signupPath = path.join(process.cwd(), 'pages', 'signup.jsx');
    if (fs.existsSync(signupPath)) {
      const content = fs.readFileSync(signupPath, 'utf8');
      if (content.includes('/api/auth/register')) {
        pass('Signup page exists with register endpoint');
      } else {
        fail('Signup page missing register call');
      }
      if (content.includes('signIn')) {
        pass('Signup auto-signs in user after registration');
      }
    } else {
      fail('Signup page not found');
    }

    // Check login page
    const loginPath = path.join(process.cwd(), 'pages', 'login.jsx');
    if (fs.existsSync(loginPath)) {
      pass('Login page exists');
    } else {
      fail('Login page not found');
    }

    // Check auth API
    const authPath = path.join(process.cwd(), 'pages', 'api', 'auth');
    if (fs.existsSync(path.join(authPath, 'register.js'))) {
      pass('Register API endpoint exists');
    }
    if (fs.existsSync(path.join(authPath, '[...nextauth].js'))) {
      pass('NextAuth endpoint exists');
    }

    // Check users table
    try {
      const userCount = await client.query('SELECT COUNT(*) FROM "User"');
      pass(`Users table exists (${userCount.rows[0].count} users)`);
    } catch (err) {
      fail(`Users table error: ${err.message}`);
    }

    // ========================================
    // 2. ONBOARDING FLOWS
    // ========================================
    section('2. ONBOARDING FLOWS');

    // Check beta-signup
    const betaPath = path.join(process.cwd(), 'pages', 'beta-signup.jsx');
    if (fs.existsSync(betaPath)) {
      const content = fs.readFileSync(betaPath, 'utf8');
      if (content.includes('BetaTester') || content.includes('trialType')) {
        pass('Beta signup flow implemented');
      }
    } else {
      warn('Beta signup page not found');
    }

    // Check onboarding page
    const onboardingPath = path.join(process.cwd(), 'pages', 'onboarding.jsx');
    if (fs.existsSync(onboardingPath)) {
      const content = fs.readFileSync(onboardingPath, 'utf8');
      if (content.includes('/onboarding/school')) {
        pass('Onboarding has school code option');
      }
      if (content.includes('/onboarding/beta')) {
        pass('Onboarding has beta option');
      }
      if (content.includes('/subscription')) {
        pass('Onboarding has subscription option');
      }
    }

    // Check school onboarding
    const schoolOnboardingPath = path.join(process.cwd(), 'pages', 'onboarding', 'school.jsx');
    if (fs.existsSync(schoolOnboardingPath)) {
      const content = fs.readFileSync(schoolOnboardingPath, 'utf8');
      if (content.includes('/api/school/redeem')) {
        pass('School onboarding calls redeem API');
      }
      if (content.includes('router.query?.code')) {
        pass('School onboarding prefills code from query');
      }
    }

    // Check School table
    try {
      const schoolCount = await client.query('SELECT COUNT(*) FROM "School"');
      pass(`School table exists (${schoolCount.rows[0].count} schools)`);
    } catch (err) {
      fail(`School table error: ${err.message}`);
    }

    // Check SchoolCode table
    try {
      const codeCount = await client.query('SELECT COUNT(*) FROM "SchoolCode"');
      const codes = codeCount.rows[0].count;
      if (codes > 0) {
        pass(`SchoolCode table exists (${codes} codes)`);
      } else {
        warn(`SchoolCode table exists but no codes (0 codes)`);
      }
    } catch (err) {
      fail(`SchoolCode table error: ${err.message}`);
    }

    // ========================================
    // 3. DASHBOARD & CORE FEATURES
    // ========================================
    section('3. DASHBOARD & CORE FEATURES');

    const dashboardPath = path.join(process.cwd(), 'pages', 'dashboard.jsx');
    if (fs.existsSync(dashboardPath)) {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      if (content.includes('onboarded')) {
        pass('Dashboard checks onboarded status');
      }
      if (content.includes('schoolId')) {
        pass('Dashboard checks schoolId for access');
      }
      if (content.includes('/api/user')) {
        pass('Dashboard fetches user data');
      }
      if (content.includes('/api/beta/status')) {
        pass('Dashboard checks beta status');
      }
    } else {
      fail('Dashboard page not found');
    }

    // Check notes page
    const notesPath = path.join(process.cwd(), 'pages', 'notes.jsx');
    if (fs.existsSync(notesPath)) {
      pass('Notes page exists');
    }

    // Check career page
    const careerPath = path.join(process.cwd(), 'pages', 'career.jsx');
    if (fs.existsSync(careerPath)) {
      pass('Career page exists');
    }

    // Check ContentItem table (for notes)
    try {
      const contentCount = await client.query('SELECT COUNT(*) FROM "ContentItem"');
      pass(`ContentItem table exists (${contentCount.rows[0].count} items)`);
    } catch (err) {
      fail(`ContentItem table error: ${err.message}`);
    }

    // ========================================
    // 4. ACCESS CONTROL
    // ========================================
    section('4. ACCESS CONTROL');

    const trialPath = path.join(process.cwd(), 'lib', 'trial.js');
    if (fs.existsSync(trialPath)) {
      const content = fs.readFileSync(trialPath, 'utf8');
      if (content.includes('userHasAccess')) {
        pass('userHasAccess function exists');
      }
      if (content.includes('getTrialAndSubscriptionStatus')) {
        pass('getTrialAndSubscriptionStatus function exists');
      }
      if (content.includes('schoolId')) {
        pass('Access logic checks schoolId');
      }
      if (content.includes('schoolInfo')) {
        pass('Access logic returns schoolInfo');
      }
    } else {
      fail('trial.js not found');
    }

    // Check BetaTester table
    try {
      const betaCount = await client.query('SELECT COUNT(*) FROM "BetaTester"');
      pass(`BetaTester table exists (${betaCount.rows[0].count} beta testers)`);
    } catch (err) {
      fail(`BetaTester table error: ${err.message}`);
    }

    // Check Subscription table
    try {
      const subCount = await client.query('SELECT COUNT(*) FROM "Subscription"');
      pass(`Subscription table exists (${subCount.rows[0].count} subscriptions)`);
    } catch (err) {
      fail(`Subscription table error: ${err.message}`);
    }

    // ========================================
    // 5. API ENDPOINTS
    // ========================================
    section('5. API ENDPOINTS');

    const requiredAPIs = [
      ['pages/api/auth/register.js', 'Register API'],
      ['pages/api/user.js', 'User API'],
      ['pages/api/notes.js', 'Notes API'],
      ['pages/api/career.js', 'Career API'],
      ['pages/api/school/redeem.js', 'School Redeem API'],
      ['pages/api/beta/status.js', 'Beta Status API'],
      ['pages/api/subscription/checkout.js', 'Subscription Checkout API'],
      ['pages/api/subscription/webhook.js', 'Subscription Webhook API'],
      ['pages/api/subscription/cancel.js', 'Subscription Cancel API'],
    ];

    for (const [apiPath, apiName] of requiredAPIs) {
      const fullPath = path.join(process.cwd(), apiPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Check for proper security
        let hasAuth = content.includes('getServerSession') || content.includes('session');
        let hasLogging = content.includes('logger') || content.includes('auditLog') || content.includes('console');
        
        if (hasAuth && hasLogging) {
          pass(`${apiName} - auth + logging`);
        } else if (hasAuth) {
          pass(`${apiName} - auth present`);
        } else if (hasLogging) {
          pass(`${apiName} - logging present`);
        } else if (apiPath.includes('webhook')) {
          pass(`${apiName} - webhook endpoint`);
        } else {
          warn(`${apiName} - minimal security measures`);
        }
      } else {
        fail(`${apiName} not found: ${apiPath}`);
      }
    }

    // ========================================
    // 6. SECURITY & VALIDATION
    // ========================================
    section('6. SECURITY & VALIDATION');

    const securityPath = path.join(process.cwd(), 'lib', 'security.js');
    if (fs.existsSync(securityPath)) {
      const content = fs.readFileSync(securityPath, 'utf8');
      if (content.includes('setSecureHeaders')) {
        pass('Security headers implemented');
      }
      if (content.includes('validateRequest')) {
        pass('Request validation implemented');
      }
      if (content.includes('trackIpRateLimit')) {
        pass('IP rate limiting implemented');
      }
      if (content.includes('trackUserRateLimit')) {
        pass('User rate limiting implemented');
      }
      if (content.includes('auditLog')) {
        pass('Audit logging implemented');
      }
      if (content.includes('deliverSecurityAlert')) {
        pass('Security alerts webhook implemented');
      }
    }

    // ========================================
    // 7. LOGGING
    // ========================================
    section('7. LOGGING');

    const loggerPath = path.join(process.cwd(), 'lib', 'logger.js');
    if (fs.existsSync(loggerPath)) {
      pass('Logger module exists');
    }

    const redeemPath = path.join(process.cwd(), 'pages', 'api', 'school', 'redeem.js');
    if (fs.existsSync(redeemPath)) {
      const content = fs.readFileSync(redeemPath, 'utf8');
      const logCount = (content.match(/logger\.|console\.|auditLog/g) || []).length;
      if (logCount > 5) {
        pass(`Redeem API has comprehensive logging (${logCount} log points)`);
      } else if (logCount > 0) {
        warn(`Redeem API has minimal logging (${logCount} log points)`);
      }
    }

    // ========================================
    // 8. DATABASE SCHEMA
    // ========================================
    section('8. DATABASE SCHEMA');

    const requiredTables = [
      'User',
      'Account',
      'Session',
      'VerificationToken',
      'School',
      'SchoolCode',
      'Subscription',
      'Class',
      'ContentItem',
      'BetaTester',
    ];

    for (const table of requiredTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        pass(`Table "${table}" exists`);
      } catch (err) {
        fail(`Table "${table}" missing`);
      }
    }

    // ========================================
    // 9. TEST DATA
    // ========================================
    section('9. TEST DATA');

    // Check school codes
    try {
      const codes = await client.query('SELECT code, "schoolId" FROM "SchoolCode" LIMIT 5');
      if (codes.rows.length > 0) {
        pass(`School codes present: ${codes.rows.map(r => r.code).join(', ')}`);
      } else {
        warn('No school codes in database');
      }
    } catch (err) {
      warn(`Could not check school codes: ${err.message}`);
    }

    // Check schools
    try {
      const schools = await client.query('SELECT COUNT(*) FROM "School"');
      if (schools.rows[0].count > 0) {
        pass(`Schools in database: ${schools.rows[0].count}`);
      } else {
        warn('No schools in database');
      }
    } catch (err) {
      warn(`Could not check schools: ${err.message}`);
    }

    // ========================================
    // 10. ROUTES & PAGES
    // ========================================
    section('10. ROUTES & PAGES');

    const requiredPages = [
      'pages/index.jsx',
      'pages/signup.jsx',
      'pages/login.jsx',
      'pages/dashboard.jsx',
      'pages/onboarding.jsx',
      'pages/notes.jsx',
      'pages/career.jsx',
      'pages/account.jsx',
      'pages/subscription.jsx',
      'pages/school/[code].jsx',
      'pages/onboarding/school.jsx',
    ];

    for (const pagePath of requiredPages) {
      const fullPath = path.join(process.cwd(), pagePath);
      if (fs.existsSync(fullPath)) {
        pass(`Page exists: ${pagePath}`);
      } else {
        fail(`Page missing: ${pagePath}`);
      }
    }

    // ========================================
    // SUMMARY
    // ========================================
    section('AUDIT SUMMARY');
    console.log(`\n✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`⚠  WARNINGS: ${warnings}`);
    console.log(`\nTOTAL: ${passed + failed + warnings}`);

    if (failed === 0) {
      console.log('\n✅ APP AUDIT COMPLETE - NO CRITICAL ISSUES\n');
    } else {
      console.log('\n⚠️  APP AUDIT COMPLETE - REVIEW FAILURES\n');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ AUDIT ERROR:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
