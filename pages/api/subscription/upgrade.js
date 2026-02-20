const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  trackUserRateLimit,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');

async function handler(req, res) {
  // Lazy load authOptions to avoid circular dependency issues
  let authOptions;
  try {
    authOptions = require('../../../lib/authOptions').authOptions;
  } catch (e) {
    logger.error('failed_to_load_auth_options', { error: e.message });
    setSecureHeaders(res);
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('upgrade_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/subscription/upgrade');
  if (!ipLimit.allowed) {
    auditLog('upgrade_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('upgrade_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('upgrade_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const devMode = String(process.env.STRIPE_DEV_MODE).toLowerCase() === 'true' || !stripe;
  const { newPlan } = req.body || {};

  if (!newPlan) {
    return res.status(400).json({ ok: false, error: 'New plan parameter is required' });
  }

  // Validate plan is one of the allowed types
  const validPlans = ['career', 'notes', 'full', 'full_yearly'];
  if (!validPlans.includes(newPlan)) {
    return res.status(400).json({ ok: false, error: 'Invalid plan selected' });
  }

  // Price configuration: prefer Stripe Price IDs from env, fallback to amounts
  const PLAN_CONFIG = {
    career: { name: 'Career Only', price: process.env.STRIPE_PRICE_CAREER, amount: 900 },
    notes: { name: 'Notes Only', price: process.env.STRIPE_PRICE_NOTES, amount: 900 },
    full: { name: 'Full Access', price: process.env.STRIPE_PRICE_FULL, amount: 1200 },
    full_yearly: { name: 'Full Access (Yearly)', price: process.env.STRIPE_PRICE_YEARLY, amount: 3500 }
  };

  const toCents = (amt) => {
    if (typeof amt !== 'number') return amt;
    if (amt > 0 && amt < 100) return Math.round(amt * 100);
    return Math.round(amt);
  };

  const newPlanConfig = PLAN_CONFIG[newPlan];

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true, name: true }
        })
      : null;

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id, '/api/subscription/upgrade');
    if (!userLimit.allowed) {
      auditLog('upgrade_rate_limited_user', user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Check if user has an existing subscription (accept multiple statuses)
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due'] }
      }
    });

    // Track if this is a new subscription or an upgrade
    const isNewSubscription = !existingSub;
    let stripeSubscription = null;

    // If no existing subscription, treat this as a new subscription (not an upgrade)
    // This handles beta users and new subscribers
    if (isNewSubscription) {
      logger.info('new_subscription_from_upgrade_endpoint', { userId: user.id, newPlan });
      
      // Check if user is beta tester and convert beta trial if exists
      try {
        const betaTester = await prisma.betaTester.findUnique({
          where: { userId: user.id },
        });
        
        if (betaTester && betaTester.status === 'active') {
          logger.info('converting_beta_trial_to_paid', { userId: user.id, plan: newPlan, trialType: betaTester.trialType });
        }
      } catch (betaErr) {
        logger.warn('failed_to_check_beta_status', { userId: user.id, error: betaErr.message });
      }
    } else {
      // Check if upgrading to the same plan
      if (existingSub.plan === newPlan) {
        return res.status(400).json({ ok: false, error: 'You already have this plan' });
      }

      // Dev mode: return mock data
      if (devMode) {
        logger.info('upgrade_dev_mode', { userId: user.id, currentPlan: existingSub.plan, newPlan });
        return res.json({
          ok: true,
          data: {
            redirectUrl: `${process.env.NEXTAUTH_URL}/dashboard?upgrade=success`
          }
        });
      }

      if (!stripe) {
        return res.status(503).json({ ok: false, error: 'Stripe not configured. Contact support.' });
      }

      if (!existingSub.stripeSubscriptionId || typeof existingSub.stripeSubscriptionId !== 'string') {
        logger.warn('upgrade_missing_stripe_subscription_id', {
          userId: user.id,
          subscriptionId: existingSub.id,
          currentPlan: existingSub.plan,
          status: existingSub.status,
          hasStripeCustomerId: !!existingSub.stripeCustomerId
        });
        auditLog('upgrade_missing_stripe_subscription_id', user.id, {
          subscriptionId: existingSub.id,
          currentPlan: existingSub.plan,
          status: existingSub.status,
          hasStripeCustomerId: !!existingSub.stripeCustomerId
        }, 'error');
        return res.status(400).json({
          ok: false,
          error: 'No Stripe subscription on file. Please contact support or start a new subscription.'
        });
      }

      // Retrieve the Stripe customer and subscription for existing subscription
      stripeSubscription = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
      
      if (!stripeSubscription) {
        return res.status(400).json({ ok: false, error: 'Stripe subscription not found' });
      }
    }

    // Validate plan config exists
    if (!newPlanConfig) {
      logger.error('missing_plan_config', { plan: newPlan });
      return res.status(500).json({ ok: false, error: `Plan not configured: ${newPlan}` });
    }

    // Create a new Checkout Session for the upgrade or new subscription
    // This will allow the user to confirm the plan change and handle any proration (for upgrades)
    const unitAmount = toCents(newPlanConfig.amount);
    let lineItem;
    if (newPlanConfig.price) {
      lineItem = { price: newPlanConfig.price, quantity: 1 };
      const actionMsg = isNewSubscription ? 'new_subscription' : 'upgrade';
      logger.info(`creating_${actionMsg}_checkout_with_priceid`, { userId: user.id, newPlan, priceId: newPlanConfig.price, ...(existingSub && { currentPlan: existingSub.plan }) });
    } else {
      const interval = newPlan === 'full_yearly' ? 'year' : 'month';
      const suffix = interval === 'year' ? '/yr' : '/mo';
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: newPlanConfig.name,
            description: `${newPlanConfig.name} - $${(unitAmount / 100).toFixed(2)}${suffix}`
          },
          unit_amount: unitAmount,
          recurring: {
            interval: interval,
            interval_count: 1
          }
        },
        quantity: 1
      };
    }

    const checkoutSessionParams = {
      line_items: [lineItem],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success&${isNewSubscription ? 'new=true' : 'upgraded=true'}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=cancelled`,
      metadata: {
        userId: user.id,
        plan: newPlan,
        ...(isNewSubscription ? { new: 'true' } : { upgrade: 'true', previousPlan: existingSub.plan })
      }
    };

    // For upgrades, use existing customer; for new subscriptions, may need to create customer
    if (stripeSubscription?.customer) {
      checkoutSessionParams.customer = stripeSubscription.customer;
    } else if (isNewSubscription) {
      // For new subscriptions without a Stripe customer, let Stripe create one from email
      checkoutSessionParams.customer_email = user.email;
    }

    const checkoutSession = await stripe.checkout.sessions.create(checkoutSessionParams);

    logger.info('upgrade_checkout_session_created', {
      userId: user.id,
      sessionId: checkoutSession.id,
      currentPlan: !isNewSubscription ? existingSub.plan : 'N/A',
      newPlan
    });
    auditLog('upgrade_checkout_session_created', user.id, { 
      currentPlan: !isNewSubscription ? existingSub.plan : 'N/A', 
      newPlan, 
      sessionId: checkoutSession.id, 
      ip 
    });

    return res.json({
      ok: true,
      data: {
        redirectUrl: checkoutSession.url
      }
    });
  } catch (err) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    
    // Provide specific error messages based on error type
    let userMessage = 'An error occurred while creating your checkout session.';
    
    if (errorMsg.includes('subscription_exposed_id') || errorMsg.includes('must be a string')) {
      userMessage = 'No Stripe subscription on file. Please contact support or start a new subscription.';
    } else if (errorMsg.includes('api_connection_error')) {
      userMessage = 'Unable to connect to payment processor. Please try again.';
    } else if (errorMsg.includes('customer') && errorMsg.includes('not found')) {
      userMessage = 'Customer not found in payment system. Please contact support.';
    } else if (errorMsg.includes('rate_limited')) {
      userMessage = 'Request throttled. Please wait a moment and try again.';
    } else if (errorMsg.includes('invalid_request_error')) {
      userMessage = 'Invalid request. Please check your information and try again.';
    }

    logger.error('upgrade_creation_error', { 
      message: errorMsg,
      userMessage,
      type: err?.constructor?.name,
      code: err?.code,
      status: err?.status,
      newPlan,
      hasStripe: !!stripe
    });
    console.error('[upgrade] Error:', errorMsg, err);
    auditLog('upgrade_creation_error', null, { message: errorMsg, userMessage }, 'error');
    return res.status(500).json({ ok: false, error: userMessage });
  }
}

module.exports = handler;
