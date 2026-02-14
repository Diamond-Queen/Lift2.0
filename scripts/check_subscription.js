/**
 * Debug script to check subscription status for a user
 * 
 * Usage:
 *   node scripts/check_subscription.js <email>
 */

const prisma = require('../lib/prisma');

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/check_subscription.js <email>');
  process.exit(1);
}

async function checkSubscription() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    const normalized = String(email).trim().toLowerCase();
    console.log(`\n🔍 Checking subscription status for: ${normalized}\n`);

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

    console.log(`📋 User Found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Onboarded: ${user.onboarded}`);

    if (user.subscriptions.length === 0) {
      console.log(`\n❌ No subscriptions found for this user`);
      process.exit(0);
    }

    console.log(`\n📊 Subscriptions (${user.subscriptions.length} total):\n`);
    user.subscriptions.forEach((sub, index) => {
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      const status = isActive ? '✅' : '⚠️ ';
      
      console.log(`${status} Subscription ${index + 1}:`);
      console.log(`   ID: ${sub.id}`);
      console.log(`   Plan: ${sub.plan || 'N/A'}`);
      console.log(`   Status: ${sub.status || 'NULL'}`);
      console.log(`   Created: ${sub.createdAt.toISOString()}`);
      console.log(`   Updated: ${sub.updatedAt?.toISOString() || 'N/A'}`);
      console.log(`   StripeID: ${sub.stripeSubscriptionId || 'N/A'}`);
      console.log(`   Trial Ends: ${sub.trialEndsAt?.toISOString() || 'N/A'}`);
      if (sub.upgradedFromId) {
        console.log(`   Upgraded From: ${sub.upgradedFromId}`);
      }
      if (sub.upgradedAt) {
        console.log(`   Upgraded At: ${sub.upgradedAt.toISOString()}`);
      }
      console.log('');
    });

    const activeCount = user.subscriptions.filter(s => s.status === 'active' || s.status === 'trialing').length;
    console.log(`\n📈 Summary: ${activeCount} active subscription(s), ${user.subscriptions.length - activeCount} inactive`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkSubscription();
