const prisma = require('../../../lib/prisma');
const stripe = require('../../../lib/stripe');
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
    auditLog('beta_cancel_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/beta/cancel');
  if (!ipLimit.allowed) {
    auditLog('beta_cancel_rate_limited_ip', null, { ip });
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
    logger.error('beta_cancel_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('beta_cancel_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true, betaTester: true }
        })
      : null;

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id, '/api/beta/cancel');
    if (!userLimit.allowed) {
      auditLog('beta_cancel_rate_limited_user', user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    if (!user.betaTester) {
      return res.status(400).json({ ok: false, error: 'User is not in beta program' });
    }

    // Cancel beta trial by removing the BetaTester record.
    // The BetaTester -> User relation is required, so attempting to
    // `disconnect` violates the relation. Delete the BetaTester instead.
    if (prisma) {
      try {
        await prisma.betaTester.delete({ where: { id: user.betaTester.id } });
      } catch (e) {
        await prisma.betaTester.update({ where: { id: user.betaTester.id }, data: { status: 'expired' } }).catch(() => {});
      }

      // Also cancel any active subscriptions for this user (Stripe + DB).
      try {
        const subs = await prisma.subscription.findMany({ where: { userId: user.id } });
        for (const s of subs || []) {
          // Try to cancel on Stripe if possible
          if (s?.stripeSubscriptionId && stripe) {
            try {
              await stripe.subscriptions.del(s.stripeSubscriptionId);
            } catch (stripeErr) {
              logger.warn('stripe_cancel_failed', { userId: user.id, subscriptionId: s.stripeSubscriptionId, message: stripeErr.message });
            }
          }

          // Mark subscription canceled in our DB
          try {
            await prisma.subscription.update({ where: { id: s.id }, data: { status: 'canceled' } });
          } catch (dbErr) {
            logger.warn('db_mark_subscription_canceled_failed', { userId: user.id, subscriptionId: s.id, message: dbErr.message });
          }
        }

        // Remove subscription plan from user preferences if present
        try {
          const u = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
          const prefs = u?.preferences || {};
          if (prefs && prefs.subscriptionPlan) {
            delete prefs.subscriptionPlan;
            delete prefs.subscriptionPrice;
            await prisma.user.update({ where: { id: user.id }, data: { preferences: prefs } });
          }
        } catch (prefErr) {
          logger.warn('failed_to_remove_subscription_pref', { userId: user.id, message: prefErr.message });
        }
      } catch (e) {
        logger.warn('beta_cancel_subscription_cleanup_failed', { userId: user.id, message: e.message });
      }
    }

    logger.info('beta_trial_canceled', { userId: user.id });
    auditLog('beta_trial_canceled', user.id, { ip });

    return res.json({ ok: true, message: 'Beta trial canceled', shouldLogout: false });
  } catch (err) {
    logger.error('beta_cancel_error', { message: err.message, stack: err.stack });
    auditLog('beta_cancel_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to cancel beta trial' });
  }
}

module.exports = handler;
