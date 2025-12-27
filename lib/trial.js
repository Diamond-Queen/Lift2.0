/**
 * Trial and subscription check utilities
 * Handles checking trial expiration and subscription status
 */

const prisma = require('./prisma');

/**
 * Get trial and subscription status for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Trial and subscription details
 */
async function getTrialAndSubscriptionStatus(userId) {
  if (!userId || !prisma) {
    return {
      isTrialActive: false,
      hasActiveSubscription: false,
      trialInfo: null,
      subscriptionInfo: null,
      status: 'no-access', // no-access, trial-expired, requires-payment, active
    };
  }

  try {
    const betaTester = await prisma.betaTester.findUnique({
      where: { userId },
    });

    const subscription = await prisma.subscription.findFirst({
      where: { userId },
    });

    const now = new Date();

    // Check if user has active trial
    const isTrialActive = betaTester?.status === 'active' && betaTester?.trialEndsAt > now;
    
    // Check if user has active paid subscription
    const hasActiveSubscription = subscription?.status === 'active' || subscription?.stripeCustomerId;

    let status = 'no-access';
    if (hasActiveSubscription) {
      status = 'active';
    } else if (isTrialActive) {
      status = 'trial-active';
    } else if (betaTester?.status === 'active' && betaTester?.trialEndsAt <= now) {
      status = 'trial-expired';
    }

    const daysRemaining = isTrialActive
      ? Math.ceil((betaTester.trialEndsAt - now) / (24 * 60 * 60 * 1000))
      : 0;

    return {
      isTrialActive,
      hasActiveSubscription,
      status,
      trialInfo: betaTester
        ? {
            id: betaTester.id,
            trialType: betaTester.trialType,
            schoolName: betaTester.schoolName,
            organizationName: betaTester.organizationName,
            trialEndsAt: betaTester.trialEndsAt,
            daysRemaining,
            createdAt: betaTester.createdAt,
          }
        : null,
      subscriptionInfo: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            stripeCustomerId: subscription.stripeCustomerId,
            trialEndsAt: subscription.trialEndsAt,
          }
        : null,
    };
  } catch (err) {
    console.error('Error checking trial/subscription status:', err);
    return {
      isTrialActive: false,
      hasActiveSubscription: false,
      trialInfo: null,
      subscriptionInfo: null,
      status: 'error',
      error: err.message,
    };
  }
}

/**
 * Check if user has access to the platform (either trial or subscription)
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user has access
 */
async function userHasAccess(userId) {
  const status = await getTrialAndSubscriptionStatus(userId);
  return status.status === 'trial-active' || status.status === 'active';
}

/**
 * Mark a trial as converted to paid subscription
 * @param {string} userId - The user ID
 * @param {string} subscriptionId - The subscription ID
 * @returns {Promise<Object>} Updated beta tester record
 */
async function convertTrialToSubscription(userId, subscriptionId) {
  if (!prisma) return null;

  try {
    const betaTester = await prisma.betaTester.update({
      where: { userId },
      data: {
        status: 'converted',
        convertedToSub: subscriptionId,
      },
    });
    return betaTester;
  } catch (err) {
    console.error('Error converting trial to subscription:', err);
    throw err;
  }
}

/**
 * Expire a trial
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Updated beta tester record
 */
async function expireTrial(userId) {
  if (!prisma) return null;

  try {
    const betaTester = await prisma.betaTester.update({
      where: { userId },
      data: {
        status: 'expired',
      },
    });
    return betaTester;
  } catch (err) {
    console.error('Error expiring trial:', err);
    throw err;
  }
}

module.exports = {
  getTrialAndSubscriptionStatus,
  userHasAccess,
  convertTrialToSubscription,
  expireTrial,
};
