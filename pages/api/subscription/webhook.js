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

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        await handlePaymentIntentFailed(paymentIntent);
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

export { config };
export default handler;

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  const trialType = session.metadata?.trialType; // for beta payments
  const isUpgrade = session.metadata?.upgrade === 'true';
  const previousPlan = session.metadata?.previousPlan;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId) {
    logger.warn('checkout_completed_missing_metadata', { sessionId: session.id });
    return;
  }

  // Handle beta payment (one-time payment)
  if (trialType && !subscriptionId) {
    try {
      // Activate the pending beta tester record
      if (prisma) {
        await prisma.betaTester.updateMany({
          where: { userId, status: 'pending' },
          data: { status: 'active' }
        });
      }
      await prisma.user.update({
        where: { id: userId },
        data: {
          onboarded: true
        }
      });
      logger.info('beta_checkout_completed', { userId, trialType, sessionId: session.id });
      auditLog('beta_checkout_completed', userId, { trialType, sessionId: session.id }, 'info');
      return;
    } catch (err) {
      logger.error('beta_checkout_completed_error', { userId, trialType, error: err.message });
      auditLog('beta_checkout_completed_error', userId, { trialType, error: err.message }, 'error');
      return;
    }
  }

  // Handle subscription checkout (existing logic)
  if (!plan) {
    logger.warn('checkout_completed_missing_plan', { sessionId: session.id });
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
  // For upgrades, update the existing subscription. For new subscriptions, create or upsert.
  if (isUpgrade && previousPlan) {
    // Find the existing subscription and update it
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: userId }
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          stripeSubscriptionId: subscriptionId,
          status: subscription.status,
          plan: plan,
          trialEndsAt: trialEnd,
          stripeCustomerId: customerId
        }
      });
      logger.info('subscription_upgraded', { 
        userId, 
        previousPlan, 
        newPlan: plan, 
        subscriptionId, 
        trialEnd 
      });
    } else {
      // Create new if not found (shouldn't happen in normal flow)
      await prisma.subscription.create({
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          status: subscription.status,
          plan: plan,
          trialEndsAt: trialEnd,
          userId: userId
        }
      });
    }
  } else {
    // New subscription
    await prisma.subscription.upsert({
      where: { stripeCustomerId: customerId },
      update: {
        stripeSubscriptionId: subscriptionId,
        status: subscription.status,
        plan: plan,
        trialEndsAt: trialEnd,
        userId: userId
      },
      create: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: subscription.status,
        plan: plan,
        trialEndsAt: trialEnd,
        userId: userId
      }
    });
    logger.info('checkout_completed', { userId, plan, subscriptionId, trialEnd });
  }
}

async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  // Get the current items to determine plan
  const items = subscription.items?.data || [];
  const lineItem = items[0];
  
  let plan = null;
  if (lineItem?.price?.id === process.env.STRIPE_PRICE_CAREER) {
    plan = 'career';
  } else if (lineItem?.price?.id === process.env.STRIPE_PRICE_NOTES) {
    plan = 'notes';
  } else if (lineItem?.price?.id === process.env.STRIPE_PRICE_FULL) {
    plan = 'full';
  }

  try {
    const existingSub = await prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
      select: { plan: true, status: true }
    });

    if (existingSub) {
      const planChanged = plan && existingSub.plan !== plan;
      if (planChanged) {
        logger.info('subscription_plan_changed', { 
          customerId, 
          subscriptionId, 
          previousPlan: existingSub.plan,
          newPlan: plan,
          status 
        });
      }

      await prisma.subscription.update({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: subscriptionId,
          status: status,
          ...(plan && { plan: plan }),
          trialEndsAt: trialEnd
        }
      });
      logger.info('subscription_updated', { customerId, subscriptionId, status, plan, trialEnd });
    } else {
      logger.warn('subscription_not_found_for_update', { customerId });
    }
  } catch (err) {
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

async function handlePaymentIntentSucceeded(paymentIntent) {
  const customerId = paymentIntent.customer;
  const paymentIntentId = paymentIntent.id;
  const amount = paymentIntent.amount;
  const metadata = paymentIntent.metadata || {};
  const userId = metadata.userId;

  try {
    // Update user in database if this is a one-time payment
    if (userId && metadata.type === 'beta') {
      // For beta one-time payments, activate the beta tester and mark as paid
      if (prisma) {
        await prisma.betaTester.updateMany({
          where: { userId, status: 'pending' },
          data: { status: 'active' }
        });
      }
      await prisma.user.update({
        where: { id: userId },
        data: {
          betaTesterPaymentCompleted: true,
          betaTesterPaymentDate: new Date()
        }
      });
      logger.info('beta_one_time_payment_succeeded', { 
        userId, 
        paymentIntentId, 
        amount,
        customerId 
      });
    } else {
      // Log other one-time payments
      logger.info('payment_intent_succeeded', { 
        customerId, 
        paymentIntentId, 
        amount,
        userId 
      });
    }
  } catch (err) {
    logger.error('payment_intent_success_handler_error', { 
      message: err.message,
      paymentIntentId,
      userId 
    });
  }
}

async function handlePaymentIntentFailed(paymentIntent) {
  const customerId = paymentIntent.customer;
  const paymentIntentId = paymentIntent.id;
  const amount = paymentIntent.amount;
  const lastPaymentError = paymentIntent.last_payment_error;
  const metadata = paymentIntent.metadata || {};
  const userId = metadata.userId;

  try {
    logger.warn('payment_intent_failed', { 
      customerId, 
      paymentIntentId, 
      amount,
      userId,
      error: lastPaymentError?.message,
      errorCode: lastPaymentError?.code 
    });

    // Optionally notify user of payment failure or take action
    // For now, just log it
  } catch (err) {
    logger.error('payment_intent_failure_handler_error', { 
      message: err.message,
      paymentIntentId 
    });
  }
}
