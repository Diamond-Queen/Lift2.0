const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: 'Request rejected' });
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
    logger.error('confirm_payment_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error' });
  }

  if (!session || !session.user?.email) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { intentId, plan } = req.body || {};

  if (!intentId || !plan) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true }
    });

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Dev mode handling
    if (intentId.includes('dev')) {
      const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await prisma.subscription.upsert({
        where: { stripeCustomerId: `dev_cus_${user.id}` },
        update: {
          plan,
          status: 'trialing',
          trialEndsAt: trialEnds,
          userId: user.id
        },
        create: {
          stripeCustomerId: `dev_cus_${user.id}`,
          userId: user.id,
          plan,
          status: 'trialing',
          trialEndsAt: trialEnds
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { onboarded: true }
      });

      logger.info('dev_subscription_confirmed', { userId: user.id, plan });
      return res.json({ ok: true, message: 'Subscription confirmed (dev mode)' });
    }

    // Retrieve payment intent from Stripe
    if (!stripe) {
      return res.status(503).json({ ok: false, error: 'Stripe not configured' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);

    // Check if payment succeeded
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ ok: false, error: 'Payment not completed', status: paymentIntent.status });
    }

    // Check for existing subscription first
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['active', 'trialing'] } }
    });

    if (existingSub) {
      // Already has subscription, just return success
      return res.json({ ok: true, message: 'Subscription already active', subscriptionId: existingSub.id });
    }

    // Get or create customer subscription with trial
    const customer = paymentIntent.customer;
    if (!customer) {
      return res.status(400).json({ ok: false, error: 'Customer not found' });
    }

    // Create subscription with trial
    const subscription = await stripe.subscriptions.create({
      customer: customer,
      items: [
        {
          price: getPriceIdForPlan(plan)
        }
      ],
      trial_period_days: 3,
      metadata: {
        userId: user.id,
        plan: plan
      }
    });

    // Save subscription to database
    const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        stripeCustomerId: customer,
        stripeSubscriptionId: subscription.id,
        userId: user.id,
        plan,
        status: 'trialing',
        trialEndsAt: trialEnds
      }
    });

    // Mark user as onboarded
    await prisma.user.update({
      where: { id: user.id },
      data: { onboarded: true }
    });

    logger.info('subscription_confirmed', { userId: user.id, plan, subscriptionId: subscription.id });
    auditLog('subscription_confirmed', user.id, { plan, subscriptionId: subscription.id, ip });

    return res.json({ ok: true, message: 'Subscription confirmed', subscriptionId: subscription.id });
  } catch (err) {
    logger.error('confirm_payment_error', { message: err.message, stack: err.stack });
    auditLog('confirm_payment_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to confirm payment' });
  }
}

function getPriceIdForPlan(plan) {
  const prices = {
    career: process.env.STRIPE_PRICE_CAREER,
    notes: process.env.STRIPE_PRICE_NOTES,
    full: process.env.STRIPE_PRICE_FULL
  };
  return prices[plan] || null;
}

module.exports = handler;
