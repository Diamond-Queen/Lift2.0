/**
 * Subscription recovery check - runs on app startup
 * 
 * This runs automatically during app initialization to:
 * 1. Check for users with Stripe customers but no subscription records
 * 2. Recover missing subscription records from Stripe
 * 3. Ensure users with paid subscriptions can see them
 * 
 * This is designed to be non-blocking and run in the background.
 */

const stripe = require('./stripe');
const prisma = require('./prisma');
const logger = require('./logger');

// Track if recovery is already in progress
let recoveryInProgress = false;

async function performSubscriptionRecovery() {
  if (recoveryInProgress || !stripe || !prisma) {
    return; // Skip if already running, Stripe not available, or Prisma not available
  }

  recoveryInProgress = true;

  try {
    // Get all users with incomplete preferences
    const usersWithoutSubs = await prisma.user.findMany({
      where: {
        subscriptions: {
          none: {} // Users with NO subscriptions
        }
      },
      select: {
        id: true,
        email: true,
        _count: {
          select: { subscriptions: true }
        }
      },
      take: 50 // Process max 50 users per check
    });

    if (usersWithoutSubs.length === 0) {
      recoveryInProgress = false;
      return;
    }

    logger.info('subscription_recovery_starting', { userCount: usersWithoutSubs.length });

    let recoveredCount = 0;

    for (const user of usersWithoutSubs) {
      try {
        // Find Stripe customers for this user
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 10
        });

        if (customers.data.length === 0) continue;

        for (const customer of customers.data) {
          // Get their subscriptions from Stripe
          const stripeSubscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            limit: 10,
            status: 'all'
          });

          for (const stripeSub of stripeSubscriptions.data) {
            // Only recover valid paid subscriptions
            if (!['active', 'past_due', 'trialing', 'incomplete'].includes(stripeSub.status)) {
              continue;
            }

            // Create missing subscription record
            const plan = stripeSub.metadata?.plan || 'unknown';
            const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;

            await prisma.subscription.create({
              data: {
                userId: user.id,
                stripeCustomerId: customer.id,
                stripeSubscriptionId: stripeSub.id,
                status: stripeSub.status,
                plan: plan,
                trialEndsAt: trialEnd,
                createdAt: new Date(stripeSub.created * 1000)
              }
            }).catch(() => {}); // Ignore if already exists (race condition)

            // Update user preferences
            if (plan && plan !== 'unknown') {
              const userPrefs = await prisma.user.findUnique({
                where: { id: user.id },
                select: { preferences: true }
              });
              const currentPrefs = userPrefs?.preferences || {};
              if (!currentPrefs.subscriptionPlan) {
                await prisma.user.update({
                  where: { id: user.id },
                  data: {
                    preferences: {
                      ...currentPrefs,
                      subscriptionPlan: plan
                    }
                  }
                }).catch(() => {});
              }
            }

            recoveredCount++;
          }
        }
      } catch (err) {
        logger.warn('subscription_recovery_user_error', {
          userId: user.id,
          email: user.email,
          error: err.message
        });
      }
    }

    if (recoveredCount > 0) {
      logger.info('subscription_recovery_complete', { recoveredCount });
    }
  } catch (err) {
    logger.error('subscription_recovery_error', { message: err.message });
  } finally {
    recoveryInProgress = false;
  }
}

// Run recovery check after a short delay to avoid blocking app startup
// Only run in development or when explicitly needed
if (process.env.NODE_ENV !== 'production') {
  setTimeout(() => {
    performSubscriptionRecovery().catch(err => {
      logger.error('subscription_recovery_timeout_error', { message: err.message });
    });
  }, 5000);
}

module.exports = { performSubscriptionRecovery };
