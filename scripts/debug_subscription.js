/**
 * Debug script to check subscription status for a paid test account
 * 
 * Usage:
 *   node scripts/debug_subscription.js <email>
 */

// Load .env file manually for scripts
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !line.startsWith('#')) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  console.warn('Warning: Could not load .env file');
}

const prisma = require('../lib/prisma');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/debug_subscription.js <email>');
  process.exit(1);
}

async function debugSubscription() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    const normalized = String(email).trim().toLowerCase();
    console.log(`\n🔍 Debugging subscription for: ${normalized}\n`);

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user) {
      console.error(`❌ User not found: ${normalized}`);
      process.exit(1);
    }

    console.log(`📋 User:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Onboarded: ${user.onboarded}`);
    console.log(`   Preferences: ${JSON.stringify(user.preferences, null, 2)}`);

    if (user.subscriptions.length === 0) {
      console.log(`\n❌ No subscriptions found`);
      process.exit(0);
    }

    console.log(`\n📊 Subscriptions:\n`);
    user.subscriptions.forEach((sub, index) => {
      const isActive = ['active', 'trialing'].includes(sub.status);
      const icon = isActive ? '✅' : '⚠️ ';
      
      console.log(`${icon} [${index}] ${sub.plan || 'N/A'}`);
      console.log(`   ID: ${sub.id}`);
      console.log(`   Status: "${sub.status}" ${isActive ? '(ACTIVE)' : '(INACTIVE)'}`);
      console.log(`   Created: ${sub.createdAt.toISOString()}`);
      console.log(`   Updated: ${sub.updatedAt?.toISOString() || 'N/A'}`);
      console.log(`   StripeSubID: ${sub.stripeSubscriptionId || 'N/A'}`);
      console.log(`   Trial Ends: ${sub.trialEndsAt?.toISOString() || 'N/A'}`);
      if (sub.upgradedFromId) {
        console.log(`   Upgraded From: ${sub.upgradedFromId}`);
      }
      if (sub.upgradedAt) {
        console.log(`   Upgraded At: ${sub.upgradedAt.toISOString()}`);
      }
      console.log('');
    });

    // Check what the logic would return
    const hasSubscription = Boolean(
      (user.subscriptions && user.subscriptions.length > 0 && ['active', 'trialing'].includes(user.subscriptions[0].status)) ||
      (user.preferences && user.preferences.subscriptionPlan)
    );

    console.log(`\n🧪 Access Check Logic:`);
    console.log(`   Has subscription (first is active/trialing): ${user.subscriptions.length > 0 && ['active', 'trialing'].includes(user.subscriptions[0].status)}`);
    console.log(`   Has preferences.subscriptionPlan: ${!!(user.preferences && user.preferences.subscriptionPlan)}`);
    console.log(`   Final hasSubscription: ${hasSubscription}`);

    if (!hasSubscription) {
      console.log(`\n❌ ISSUE DETECTED: User will NOT have access to notes`);
      console.log(`\nPossible fixes:`);
      console.log(`   1. Update most recent subscription status to 'active'`);
      console.log(`   2. Set preferences.subscriptionPlan to a valid plan`);
    } else {
      console.log(`\n✅ User should have access to notes`);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

debugSubscription();
