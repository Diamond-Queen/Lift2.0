const stripe = require('../../../lib/stripe');
const prisma = require('../../../lib/prisma');
const logger = require('../../../lib/logger');
const { buffer } = require('micro');
const { setSecureHeaders, auditLog } = require('../../../lib/security');

// Disable body parsing, need raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!stripe) {
    logger.error('webhook_stripe_not_configured');
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('webhook_secret_missing');
    auditLog('webhook_secret_missing', null, {}, 'critical');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    logger.error('webhook_verification_failed', { message: err.message });
    auditLog('webhook_verification_failed', null, { message: err.message }, 'warning');
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        logger.info('webhook_unhandled_event', { type: event.type });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('webhook_handler_error', { type: event.type, message: err.message, stack: err.stack });
    auditLog('webhook_handler_error', null, { type: event.type, message: err.message }, 'error');
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

module.exports = handler;
module.exports.config = config;

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId || !plan) {
    logger.warn('checkout_completed_missing_metadata', { sessionId: session.id });
    return;
  }

  // Get subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  // Update user in database
  const userPrefs = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const currentPrefs = (userPrefs?.preferences || {});
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      onboarded: true,
      preferences: {
        ...currentPrefs,
        subscriptionPlan: plan
      }
    }
  });

  // Create or update subscription record
  await prisma.subscription.upsert({
    where: { stripeCustomerId: customerId },
    update: {
      status: subscription.status,
      plan: plan,
      trialEndsAt: trialEnd,
      userId: userId
    },
    create: {
      stripeCustomerId: customerId,
      status: subscription.status,
      plan: plan,
      trialEndsAt: trialEnd,
      userId: userId
    }
  });

  logger.info('checkout_completed', { userId, plan, subscriptionId, trialEnd });
}

async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  const status = subscription.status;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  try {
    await prisma.subscription.update({
      where: { stripeCustomerId: customerId },
      data: {
        status: status,
        trialEndsAt: trialEnd
      }
    });
    logger.info('subscription_updated', { customerId, status, trialEnd });
  } catch (err) {
    // If subscription not found, create it
    if (err.code === 'P2025') {
      logger.warn('subscription_not_found_for_update', { customerId });
    } else {
      throw err;
    }
  }
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      status: 'canceled'
    }
  });

  // Optionally revoke user access
  const sub = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId }
  });

  if (sub) {
    // Remove subscription plan from user preferences
    const user = await prisma.user.findFirst({
      where: {
        subscriptions: {
          some: { stripeCustomerId: customerId }
        }
      }
    });

    if (user) {
      const prefs = user.preferences || {};
      delete prefs.subscriptionPlan;
      await prisma.user.update({
        where: { id: user.id },
        data: { preferences: prefs }
      });
    }
  }

  logger.info('subscription_deleted', { customerId });
}

async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  logger.info('payment_succeeded', { customerId, subscriptionId, amount: invoice.amount_paid });
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Optionally notify user or take action
  logger.warn('payment_failed', { customerId, subscriptionId, attemptCount: invoice.attempt_count });
}
