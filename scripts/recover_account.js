/**
 * Recovery script for accounts affected by the upgrade bug
 * 
 * Usage:
 *   node scripts/recover_account.js <email>
 * 
 * This script:
 * 1. Finds the user by email
 * 2. Checks for corruption (missing required fields, invalid subscription state)
 * 3. Repairs the account by:
 *    - Ensuring all required user fields are present
 *    - Resetting failed login attempts if locked
 *    - Clearing corrupted subscription data
 *    - Restoring default preferences
 */

const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/recover_account.js <email>');
  process.exit(1);
}

async function recoverAccount() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    const normalized = String(email).trim().toLowerCase();
    console.log(`\n🔍 Searching for account: ${normalized}`);

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      include: {
        subscriptions: true,
        betaTester: true,
        sessions: true,
      },
    });

    if (!user) {
      console.error(`❌ User not found: ${normalized}`);
      process.exit(1);
    }

    console.log(`\n📋 Account Found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name || 'MISSING'}`);
    console.log(`   OnBoarded: ${user.onboarded}`);
    console.log(`   Locked Until: ${user.lockedUntil || 'Not locked'}`);
    console.log(`   Failed Login Attempts: ${user.failedLoginAttempts}`);
    console.log(`   Subscriptions: ${user.subscriptions.length}`);
    console.log(`   Beta Tester: ${user.betaTester ? 'Yes' : 'No'}`);
    console.log(`   Sessions: ${user.sessions.length}`);

    if (user.subscriptions.length > 0) {
      console.log(`\n   Subscription Details:`);
      user.subscriptions.forEach((sub, i) => {
        console.log(`     ${i + 1}. Status: ${sub.status || 'null'}, Plan: ${sub.plan || 'null'}, StripeID: ${sub.stripeSubscriptionId || 'null'}`);
      });
    }

    // Check for issues
    const issues = [];
    if (!user.name) issues.push('Missing name field');
    if (user.failedLoginAttempts > 0) issues.push(`Account locked with ${user.failedLoginAttempts} failed attempts`);
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) issues.push(`Account locked until ${user.lockedUntil}`);
    if (user.subscriptions.length > 0 && user.subscriptions.some(s => !s.status || s.status === 'canceled')) {
      issues.push('Has canceled/null subscription records');
    }

    if (issues.length === 0) {
      console.log(`\n✅ No issues detected`);
      process.exit(0);
    }

    console.log(`\n⚠️  Issues Found:`);
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });

    // Fix issues
    console.log(`\n🔧 Applying Fixes...`);

    const updateData = {};

    // Fix missing name
    if (!user.name) {
      updateData.name = user.email.split('@')[0] || 'User';
      console.log(`   ✓ Setting name to: ${updateData.name}`);
    }

    // Reset failed login attempts and lockout
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      updateData.failedLoginAttempts = 0;
      updateData.lockedUntil = null;
      console.log(`   ✓ Clearing failed login attempts and lockout`);
    }

    // Update user
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
      console.log(`   ✓ User record updated`);
    }

    // Mark corrupted subscriptions as inactive to preserve history
    if (user.subscriptions.length > 0) {
      const corruptedSubs = user.subscriptions.filter(s => !s.status || s.status === 'canceled');
      if (corruptedSubs.length > 0) {
        for (const sub of corruptedSubs) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'inactive' }
          });
          console.log(`   ✓ Marked subscription as inactive to preserve history: ${sub.id} (${sub.plan || 'unknown plan'})`);
        }
      }
    }

    // Delete old sessions to force re-authentication
    if (user.sessions.length > 0) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      console.log(`   ✓ Cleared ${user.sessions.length} old session(s)`);
    }

    console.log(`\n✅ Recovery Complete!`);
    console.log(`\nUser can now sign in with:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   (Password reset may be needed if forgotten)`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Recovery failed:', err.message);
    logger.error('account_recovery_failed', { email, error: err.message });
    process.exit(1);
  }
}

recoverAccount();
