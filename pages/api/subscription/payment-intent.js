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

  let authOptions;
  try {
    const imported = await import('../../../lib/authOptions');
    authOptions = imported.authOptions;
  } catch (e) {
    logger.error('failed_to_import_auth_options', { error: e.message });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
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

  const validPlans = {
    career: { price: process.env.STRIPE_PRICE_CAREER, amount: 700, name: 'Career Only' },
    notes: { price: process.env.STRIPE_PRICE_NOTES, amount: 700, name: 'Notes Only' },
    full: { price: process.env.STRIPE_PRICE_FULL, amount: 1000, name: 'Full Access' }
  };

  if (!validPlans[plan]) {
    return res.status(400).json({ ok: false, error: 'Invalid plan selected' });
  }

  const planConfig = validPlans[plan];

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

    if (existingSub) {
      return res.status(400).json({ ok: false, error: 'You already have an active subscription' });
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

    // Create Checkout Session for subscription (Embedded Checkout)
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [
        {
          price: planConfig.price,
          quantity: 1
        }
      ],
      mode: 'subscription',
      ui_mode: 'embedded',
      return_url: `${process.env.NEXTAUTH_URL}/subscription/checkout?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    logger.info('checkout_session_created', {
      userId: user.id,
      sessionId: session.id,
      plan
    });
    auditLog('checkout_session_created', user.id, { plan, sessionId: session.id, ip });

    return res.json({
      ok: true,
      data: {
        clientSecret: session.client_secret
      }
    });
  } catch (err) {
    logger.error('payment_intent_creation_error', { message: err.message, stack: err.stack });
    auditLog('payment_intent_creation_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to create payment intent' });
  }
}

module.exports = handler;
