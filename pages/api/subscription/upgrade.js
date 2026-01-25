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
  const validPlans = ['career', 'notes', 'full'];
  if (!validPlans.includes(newPlan)) {
    return res.status(400).json({ ok: false, error: 'Invalid plan selected' });
  }

  // Hardcoded price IDs from environment for security
  const PLAN_CONFIG = {
    career: { name: 'Career Only', amount: 700 }, // $7.00
    notes: { name: 'Notes Only', amount: 700 }, // $7.00
    full: { name: 'Full Access', amount: 1000 } // $10.00
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

    // Check if user has an existing subscription
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (!existingSub) {
      return res.status(400).json({ ok: false, error: 'No active subscription found. Please create a new subscription.' });
    }

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

    // Retrieve the Stripe customer and subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(existingSub.stripeSubscriptionId);
    
    if (!stripeSubscription) {
      return res.status(400).json({ ok: false, error: 'Stripe subscription not found' });
    }

    // Validate plan config exists
    if (!newPlanConfig) {
      logger.error('missing_plan_config', { plan: newPlan });
      return res.status(500).json({ ok: false, error: `Plan not configured: ${newPlan}` });
    }

    // Create a new Checkout Session for the upgrade
    // This will allow the user to confirm the plan change and handle any proration
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeSubscription.customer,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: newPlanConfig.name,
              description: `${newPlanConfig.name} - $${(newPlanConfig.amount / 100).toFixed(2)}/month`
            },
            unit_amount: newPlanConfig.amount,
            recurring: {
              interval: 'month',
              interval_count: 1
            }
          },
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success&upgraded=true`,
      cancel_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=cancelled`,
      metadata: {
        userId: user.id,
        plan: newPlan,
        upgrade: 'true',
        previousPlan: existingSub.plan
      }
    });

    logger.info('upgrade_checkout_session_created', {
      userId: user.id,
      sessionId: checkoutSession.id,
      currentPlan: existingSub.plan,
      newPlan
    });
    auditLog('upgrade_checkout_session_created', user.id, { 
      currentPlan: existingSub.plan, 
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
    logger.error('upgrade_creation_error', { 
      message: errorMsg,
      type: err?.constructor?.name,
      code: err?.code,
      status: err?.status,
      newPlan,
      hasStripe: !!stripe
    });
    console.error('[upgrade] Error:', errorMsg, err);
    auditLog('upgrade_creation_error', null, { message: errorMsg }, 'error');
    return res.status(500).json({ ok: false, error: errorMsg });
  }
}

module.exports = handler;
