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
    auditLog('payment_intent_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/subscription/payment-intent');
  if (!ipLimit.allowed) {
    auditLog('payment_intent_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('payment_intent_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('payment_intent_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const devMode = String(process.env.STRIPE_DEV_MODE).toLowerCase() === 'true' || !stripe;
  const { plan } = req.body || {};

  if (!plan) {
    return res.status(400).json({ ok: false, error: 'Plan parameter is required' });
  }

  // Validate plan is one of the allowed types
  const validPlans = ['career', 'notes', 'full'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ ok: false, error: 'Invalid plan selected' });
  }

  // Price configuration: prefer Stripe Price IDs from env, fallback to amounts
  const PLAN_CONFIG = {
    career: { name: 'Career Only', price: process.env.STRIPE_PRICE_CAREER, amount: 700 }, // $7.00
    notes: { name: 'Notes Only', price: process.env.STRIPE_PRICE_NOTES, amount: 700 }, // $7.00
    full: { name: 'Full Access', price: process.env.STRIPE_PRICE_FULL, amount: 1000 } // $10.00
  };

  // Normalize amount to cents: if someone provides dollars (e.g. 7), convert to 700
  const toCents = (amt) => {
    if (typeof amt !== 'number') return amt;
    if (amt > 0 && amt < 100) return Math.round(amt * 100);
    return Math.round(amt);
  };

  const planConfig = PLAN_CONFIG[plan];

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true, name: true }
        })
      : null;

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id, '/api/subscription/payment-intent');
    if (!userLimit.allowed) {
      auditLog('payment_intent_rate_limited_user', user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Check if user already has an active subscription
    const existingSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    // If upgrading, delegate to the upgrade endpoint instead
    if (existingSub) {
      return res.status(400).json({ ok: false, error: 'You already have an active subscription. Use the upgrade endpoint to change plans.', code: 'EXISTING_SUBSCRIPTION' });
    }

    // Dev mode: return mock data
    if (devMode) {
      const mockSecret = `pi_dev_${user.id}_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`;
      logger.info('payment_intent_dev_mode', { userId: user.id, plan });
      return res.json({
        ok: true,
        data: {
          clientSecret: mockSecret
        }
      });
    }

    if (!stripe) {
      return res.status(503).json({ ok: false, error: 'Stripe not configured. Contact support.' });
    }

    // Create or retrieve Stripe customer
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });

    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id }
      });
    }

    // Validate plan config exists
    if (!planConfig) {
      logger.error('missing_plan_config', { plan });
      return res.status(500).json({ ok: false, error: `Plan not configured: ${plan}` });
    }

    // Create Checkout Session for subscription
    const unitAmount = toCents(planConfig.amount);
    let lineItem;
    if (planConfig.price) {
      lineItem = { price: planConfig.price, quantity: 1 };
      logger.info('creating_checkout_session_with_priceid', { customerId: customer.id, plan, priceId: planConfig.price });
    } else {
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: planConfig.name,
            description: `${planConfig.name} - $${(unitAmount / 100).toFixed(2)}/month`
          },
          unit_amount: unitAmount,
          recurring: {
            interval: 'month',
            interval_count: 1
          }
        },
        quantity: 1
      };
      logger.info('creating_checkout_session', { customerId: customer.id, plan, amount: unitAmount });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [lineItem],
      mode: 'subscription',
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/subscription/plans?checkout=cancelled`,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    logger.info('checkout_session_created', {
      userId: user.id,
      sessionId: checkoutSession.id,
      plan
    });
    auditLog('checkout_session_created', user.id, { plan, sessionId: checkoutSession.id, ip });

    return res.json({
      ok: true,
      data: {
        redirectUrl: checkoutSession.url
      }
    });
  } catch (err) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    logger.error('payment_intent_creation_error', { 
      message: errorMsg,
      type: err?.constructor?.name,
      code: err?.code,
      status: err?.status,
      plan,
      hasStripe: !!stripe
    });
    console.error('[payment-intent] Error:', errorMsg, err);
    auditLog('payment_intent_creation_error', null, { message: errorMsg }, 'error');
    return res.status(500).json({ ok: false, error: errorMsg });
  }
}

module.exports = handler;
