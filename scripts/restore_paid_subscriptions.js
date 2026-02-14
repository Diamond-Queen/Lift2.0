/**
 * Fix script to restore paid subscriptions that have incorrect status
 * 
 * This script finds subscriptions where:
 * - The subscription was paid for (via Stripe)
 * - But status is NOT 'active' or 'trialing'
 * 
 * And fixes them by:
 * - Setting status to 'active'
 * - Ensuring subscriptionPlan is set in user preferences
 * 
 * Usage:
 *   node scripts/restore_paid_subscriptions.js
 */

const prisma = require('../lib/prisma');
const stripe = require('../lib/stripe');
const logger = require('../lib/logger');

async function restorePaidSubscriptions() {
  try {
    if (!prisma) {
      console.error('❌ Prisma client not available');
      process.exit(1);
    }

    console.log(`\n🔧 Restoring paid subscriptions...\n`);

    // Find subscriptions with Stripe IDs that aren't in active/trialing state
    const problematicSubs = await prisma.subscription.findMany({
      where: {
        stripeSubscriptionId: { not: null },
        status: { notIn: ['active', 'trialing'] }
      },
      include: { user: { select: { id: true, email: true, preferences: true } } }
    });

    console.log(`Found ${problematicSubs.length} subscriptions with Stripe IDs in non-active status\n`);

    if (problematicSubs.length === 0) {
      console.log(`✅ No problematic subscriptions found`);
      process.exit(0);
    }

    let fixedCount = 0;

    for (const sub of problematicSubs) {
      try {
        // Check the Stripe subscription status
        const stripeStatus = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        
        console.log(`📋 Subscription: ${sub.plan} (${sub.id})`);
        console.log(`   User: ${sub.user.email}`);
        console.log(`   Current Status: ${sub.status}`);
        console.log(`   Stripe Status: ${stripeStatus.status}`);

        // If Stripe shows active/trialing, update our DB
        if (['active', 'trialing', 'past_due'].includes(stripeStatus.status)) {
          console.log(`   ✅ Fixing: Setting to 'active'`);

          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'active', updatedAt: new Date() }
          });

          // Also ensure user preferences have the subscription plan
          if (sub.user && sub.plan) {
            const currentPrefs = sub.user.preferences || {};
            if (!currentPrefs.subscriptionPlan || currentPrefs.subscriptionPlan !== sub.plan) {
              console.log(`   ✅ Fixing: Setting subscription plan in preferences`);
              
              await prisma.user.update({
                where: { id: sub.user.id },
                data: {
                  preferences: {
                    ...currentPrefs,
                    subscriptionPlan: sub.plan
                  }
                }
              });
            }
          }

          fixedCount++;
          logger.info('subscription_restored', {
            subscriptionId: sub.id,
            userId: sub.user.id,
            plan: sub.plan,
            oldStatus: sub.status,
            stripeStatus: stripeStatus.status
          });
        } else {
          console.log(`   ⚠️  Skipping: Stripe status is '${stripeStatus.status}' (not active/trialing)`);
        }

        console.log('');
      } catch (err) {
        console.log(`   ❌ Error checking Stripe: ${err.message}\n`);
        logger.error('subscription_restore_stripe_error', {
          subscriptionId: sub.id,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          error: err.message
        });
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} subscriptions`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    logger.error('subscription_restore_error', { error: err.message });
    process.exit(1);
  }
}

restorePaidSubscriptions();
