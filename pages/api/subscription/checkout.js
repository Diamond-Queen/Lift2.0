const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { pool, findUserByEmail } = require('../../../lib/db');
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

  // Subscriptions temporarily disabled — respond with service unavailable
  return res.status(503).json({ ok: false, error: 'Subscriptions are temporarily unavailable — Coming soon' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('checkout_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/subscription/checkout');
  if (!ipLimit.allowed) {
    auditLog('checkout_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const devMode = String(process.env.STRIPE_DEV_MODE).toLowerCase() === 'true' || !stripe;

  const { plan } = req.body || {};
  
  // Validate plan
  const validPlans = {
    career: { price: process.env.STRIPE_PRICE_CAREER, amount: 500, name: 'Career Only' },
    notes: { price: process.env.STRIPE_PRICE_NOTES, amount: 500, name: 'Notes Only' },
    full: { price: process.env.STRIPE_PRICE_FULL, amount: 1000, name: 'Full Access' }
  };
  
  if (!validPlans[plan]) {
    return res.status(400).json({ ok: false, error: 'Invalid plan' });
  }

  const planConfig = validPlans[plan];

  try {
    const user = prisma
      ? await prisma.user.findUnique({ 
          where: { email: session.user.email },
          select: { id: true, email: true, name: true }
        })
      : await findUserByEmail(session.user.email);

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id || session.user.id || session.user.email, '/api/subscription/checkout');
    if (!userLimit.allowed) {
      auditLog('checkout_rate_limited_user', user.id || session.user.id || session.user.email, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Check if user already has an active subscription
    const existingSub = prisma ? await prisma.subscription.findFirst({
      where: { 
        userId: user.id,
        status: { in: ['active', 'trialing'] }
      }
    }) : null;

    if (existingSub) {
      return res.status(400).json({ ok: false, error: 'You already have an active subscription' });
    }

    // If missing price IDs but in dev, or explicitly in dev: simulate checkout
    if (devMode || !planConfig.price) {
      if (!devMode && !planConfig.price) {
        // Not in dev and no price configured — block
        return res.status(503).json({ ok: false, error: 'Plan price not configured on server' });
      }
      const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      try {
        if (prisma) {
          await prisma.subscription.create({
            data: {
              userId: user.id,
              plan,
              status: 'trialing',
              trialEndsAt: trialEnds
            }
          });
          const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
          const currentPrefs = existing?.preferences || {};
          await prisma.user.update({
            where: { id: user.id },
            data: {
              onboarded: true,
              preferences: { ...currentPrefs, subscriptionPlan: plan }
            }
          });
        } else if (pool) {
          // Fallback SQL if Prisma unavailable
          await pool.query(
            'INSERT INTO "Subscription" (id, "userId", plan, status, "trialEndsAt", "createdAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
            [user.id, plan, 'trialing', trialEnds]
          );
          await pool.query(
            `UPDATE "User" SET onboarded = TRUE, preferences = COALESCE(preferences, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
            [user.id, JSON.stringify({ subscriptionPlan: plan })]
          );
        }
      } catch (e) {
        logger.error('dev_checkout_activation_failed', { message: e.message });
        return res.status(500).json({ ok: false, error: 'Failed to activate trial (dev mode)' });
      }

      const devSessionId = `dev_${Date.now()}`;
      const devUrl = `${process.env.NEXTAUTH_URL}/dashboard?session_id=${devSessionId}`;
      logger.info('checkout_session_dev_mode', { userId: user.id, plan });
      return res.json({ ok: true, data: { sessionId: devSessionId, url: devUrl } });
    }

    // Real Stripe flow below
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

    // Create Checkout Session with 3-day trial
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: planConfig.price,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 3,
        metadata: {
          userId: user.id,
          plan: plan
        }
      },
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/subscription/plans`,
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
        sessionId: checkoutSession.id,
        url: checkoutSession.url
      } 
    });
  } catch (err) {
    logger.error('checkout_creation_error', { message: err.message, stack: err.stack });
    auditLog('checkout_creation_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to create checkout session' });
  }
}

module.exports = handler;
