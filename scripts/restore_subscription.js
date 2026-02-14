/**
 * Manual subscription restoration script
 * Directly creates subscription records for users
 * 
 * Usage:
 *   node scripts/restore_subscription.js <email> <plan> [<stripeSubscriptionId>]
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
const plan = process.argv[3];
const stripeSubId = process.argv[4];

if (!email || !plan) {
  console.error('Usage: node scripts/restore_subscription.js <email> <plan> [<stripeSubscriptionId>]');
  console.error('Example: node scripts/restore_subscription.js user@example.com full "sub_xyz123"');
  process.exit(1);
}

async function restoreSubscription() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    const normalized = String(email).trim().toLowerCase();
    console.log(`\n🔄 Restoring subscription for: ${normalized}`);
    console.log(`   Plan: ${plan}`);
    if (stripeSubId) console.log(`   StripeID: ${stripeSubId}`);

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, preferences: true }
    });

    if (!user) {
      console.error(`❌ User not found: ${normalized}`);
      process.exit(1);
    }

    // Create subscription record
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: plan,
        status: 'active',
        stripeSubscriptionId: stripeSubId || null,
        createdAt: new Date()
      }
    });

    console.log(`\n✅ Subscription created:`);
    console.log(`   ID: ${subscription.id}`);
    console.log(`   Plan: ${subscription.plan}`);
    console.log(`   Status: ${subscription.status}`);

    // Update user preferences to include subscription plan
    const currentPrefs = user.preferences || {};
    if (!currentPrefs.subscriptionPlan) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          preferences: {
            ...currentPrefs,
            subscriptionPlan: plan
          }
        }
      });
      console.log(`\n✅ User preferences updated with subscription plan`);
    }

    console.log(`\n✅ Subscription restored! User can now access ${plan} features.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

restoreSubscription();
