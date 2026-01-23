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
    auditLog('cancel_subscription_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/subscription/cancel');
  if (!ipLimit.allowed) {
    auditLog('cancel_subscription_rate_limited_ip', null, { ip });
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
    logger.error('cancel_subscription_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('cancel_subscription_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true }
        })
      : await findUserByEmail(session.user.email);

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id || session.user.id || session.user.email, '/api/subscription/cancel');
    if (!userLimit.allowed) {
      auditLog('cancel_subscription_rate_limited_user', user.id || session.user.id || session.user.email, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Find the active subscription
    const subscription = prisma ? await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] }
      }
    }) : null;

    if (!subscription) {
      return res.status(400).json({ ok: false, error: 'No active subscription found' });
    }

    // If in dev mode or no Stripe customer ID, just mark as canceled
    if (!subscription.stripeSubscriptionId || !stripe) {
      if (prisma) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'canceled', canceledAt: new Date() }
        });
      }
      logger.info('dev_subscription_canceled', { userId: user.id, subscriptionId: subscription.id });
      return res.json({ ok: true, message: 'Subscription canceled' });
    }

    // Cancel the Stripe subscription
    const canceledSub = await stripe.subscriptions.del(subscription.stripeSubscriptionId);

    // Update subscription status in database
    if (prisma) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'canceled',
          canceledAt: new Date()
        }
      });
    }

    logger.info('subscription_canceled', {
      userId: user.id,
      subscriptionId: subscription.id,
      stripeSubscriptionId: subscription.stripeSubscriptionId
    });
    auditLog('subscription_canceled', user.id, { subscriptionId: subscription.id, ip });

    return res.json({ ok: true, message: 'Subscription canceled successfully' });
  } catch (err) {
    if (err.type === 'StripeInvalidRequestError' && err.statusCode === 404) {
      // Stripe subscription not found, update local record
      if (prisma) {
        const sub = await prisma.subscription.findFirst({
          where: { userId: session.user.id }
        });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'canceled', canceledAt: new Date() }
          });
        }
      }
      return res.json({ ok: true, message: 'Subscription canceled' });
    }

    logger.error('cancel_subscription_error', { message: err.message, stack: err.stack });
    auditLog('cancel_subscription_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to cancel subscription' });
  }
}

module.exports = handler;
