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
    auditLog('beta_payment_intent_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/beta/payment-intent');
  if (!ipLimit.allowed) {
    auditLog('beta_payment_intent_rate_limited_ip', null, { ip });
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
      const mockIntentId = `pi_dev_beta_${user.id}_${Date.now()}`;
      logger.info('beta_payment_intent_dev_mode', { userId: user.id, trialType });
      return res.json({
        ok: true,
        data: {
          clientSecret: `${mockIntentId}_secret_dev`,
          intentId: mockIntentId,
          amount: 300, // $3.00 in cents
          trialType: trialType
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

    // Create Payment Intent for beta purchase (one-time $3 payment)
    const paymentIntent = await stripe.paymentIntents.create({
      customer: customer.id,
      amount: 300, // $3.00 in cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        userId: user.id,
        type: 'beta',
        trialType: trialType
      },
      description: `Beta Program Access (${trialType} trial)`
    });

    logger.info('beta_payment_intent_created', {
      userId: user.id,
      intentId: paymentIntent.id,
      trialType
    });
    auditLog('beta_payment_intent_created', user.id, { intentId: paymentIntent.id, trialType, ip });

    return res.json({
      ok: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        intentId: paymentIntent.id,
        amount: 300,
        trialType: trialType,
        trialDays: trialType === 'school' ? 14 : 7
      }
    });
  } catch (err) {
    logger.error('beta_payment_intent_creation_error', { message: err.message, stack: err.stack });
    auditLog('beta_payment_intent_creation_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to create payment intent' });
  }
}

module.exports = handler;
