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
const { authOptions } = require('../../../lib/authOptions');

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('beta_payment_intent_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/beta/payment-intent');
  if (!ipLimit.allowed) {
    auditLog('beta_payment_intent_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('beta_payment_intent_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('beta_payment_intent_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const devMode = String(process.env.STRIPE_DEV_MODE).toLowerCase() === 'true' || !stripe;
  const { trialType } = req.body || {};

  if (!trialType) {
    return res.status(400).json({ ok: false, error: 'Trial type parameter is required' });
  }

  if (!['school', 'social'].includes(trialType)) {
    return res.status(400).json({ ok: false, error: 'Invalid trial type. Must be "school" or "social".' });
  }

  // Hardcoded amount for security
  const BETA_AMOUNT = 300; // $3.00 in cents

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true, name: true }
        })
      : null;

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id, '/api/beta/payment-intent');
    if (!userLimit.allowed) {
      auditLog('beta_payment_intent_rate_limited_user', user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Check if user is already a beta tester
    const existingBeta = await prisma.betaTester.findUnique({
      where: { userId: user.id }
    });

    if (existingBeta) {
      return res.status(400).json({ ok: false, error: 'You are already a beta tester' });
    }

    // Dev mode: return mock data
    if (devMode) {
      const mockSecret = `cs_dev_${user.id}_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`;
      logger.info('beta_payment_intent_dev_mode', { userId: user.id, trialType });
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

    // Create Checkout Session for beta (one-time payment via Embedded Checkout)
    const session_obj = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Beta Program Access (${trialType} trial)`,
              description: `${trialType === 'school' ? 14 : 7} days free premium features`
            },
            unit_amount: BETA_AMOUNT
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      ui_mode: 'embedded',
      return_url: `${process.env.NEXTAUTH_URL}/beta/checkout?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        userId: user.id,
        trialType: trialType
      }
    });

    logger.info('beta_checkout_session_created', {
      userId: user.id,
      sessionId: session_obj.id,
      trialType
    });
    auditLog('beta_checkout_session_created', user.id, { sessionId: session_obj.id, trialType, ip });

    return res.json({
      ok: true,
      data: {
        clientSecret: session_obj.client_secret
      }
    });
  } catch (err) {
    logger.error('beta_payment_intent_creation_error', { 
      message: err.message, 
      stack: err.stack,
      code: err.code,
      param: err.param
    });
    auditLog('beta_payment_intent_creation_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: err.message || 'Failed to create checkout session' });
  }
}

module.exports = handler;
