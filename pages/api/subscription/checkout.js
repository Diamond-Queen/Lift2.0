const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { pool } = require('../../../lib/db');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const devMode = String(process.env.STRIPE_DEV_MODE).toLowerCase() === 'true' || !stripe;

  const { plan } = req.body || {};
  
  // Validate plan
  const validPlans = {
    career: { price: process.env.STRIPE_PRICE_CAREER, amount: 900, name: 'Career Only' },
    full: { price: process.env.STRIPE_PRICE_FULL, amount: 1000, name: 'Full Access' }
  };
  
  if (!validPlans[plan]) {
    return res.status(400).json({ ok: false, error: 'Invalid plan' });
  }

  const planConfig = validPlans[plan];

  try {
    const user = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      select: { id: true, email: true, name: true }
    });

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

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

    // Development mode: simulate checkout and activate trial immediately
    if (devMode) {
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
            'UPDATE "User" SET onboarded = TRUE, preferences = COALESCE(preferences, '{}'::jsonb) || $2::jsonb WHERE id = $1',
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

    return res.json({ 
      ok: true, 
      data: { 
        sessionId: checkoutSession.id,
        url: checkoutSession.url
      } 
    });
  } catch (err) {
    logger.error('checkout_creation_error', { message: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, error: 'Failed to create checkout session' });
  }
}
