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

/**
 * GET /api/subscription/history
 * 
 * Returns the complete subscription upgrade history for the authenticated user.
 * Shows the chain of subscriptions and upgrades with timestamps.
 */
async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('subscription_history_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/subscription/history');
  if (!ipLimit.allowed) {
    auditLog('subscription_history_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  let authOptions;
  try {
    authOptions = require('../../../lib/authOptions').authOptions;
  } catch (e) {
    logger.error('failed_to_load_auth_options', { error: e.message });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('subscription_history_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.id) {
    logger.warn('subscription_history_unauthorized', { hasSession: !!session, hasUserId: !!session?.user?.id });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const userLimit = trackUserRateLimit(session.user.id, '/api/subscription/history');
    if (!userLimit.allowed) {
      auditLog('subscription_history_rate_limited_user', session.user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Get all subscriptions for this user
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        plan: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        upgradedAt: true,
        upgradedFromId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
      }
    });

    if (!subscriptions || subscriptions.length === 0) {
      return res.json({
        ok: true,
        data: {
          history: [],
          current: null,
          totalCount: 0
        }
      });
    }

    // Build upgrade chain by finding the current subscription and tracing back
    const subscriptionMap = new Map(subscriptions.map(s => [s.id, s]));
    
    // Find the current active subscription (only active status - subscriptions are not trial-based)
    let currentSub = subscriptions.find(s => s.status === 'active');
    
    // If no active subscription, find the most recent one
    if (!currentSub) {
      currentSub = subscriptions.reduce((latest, current) => {
        return new Date(current.updatedAt || current.createdAt) > new Date(latest.updatedAt || latest.createdAt) 
          ? current 
          : latest;
      });
    }

    // Trace back the upgrade chain
    const history = [];
    let currentId = currentSub.id;
    
    while (currentId && subscriptionMap.has(currentId)) {
      const sub = subscriptionMap.get(currentId);
      history.unshift({
        id: sub.id,
        plan: sub.plan,
        status: sub.status,
        createdAt: sub.createdAt,
        upgradedAt: sub.upgradedAt,
        trialEndsAt: sub.trialEndsAt,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        isCurrentPlan: sub.id === currentSub.id,
        wasUpgradedFrom: sub.upgradedFromId ? 'yes' : 'no'
      });
      
      currentId = sub.upgradedFromId; // Move to previous subscription
    }

    logger.info('subscription_history_retrieved', {
      userId: session.user.id,
      historyLength: history.length,
      currentPlan: currentSub.plan
    });

    return res.json({
      ok: true,
      data: {
        history: history,
        current: {
          id: currentSub.id,
          plan: currentSub.plan,
          status: currentSub.status,
          createdAt: currentSub.createdAt,
          updatedAt: currentSub.updatedAt,
          trialEndsAt: currentSub.trialEndsAt
        },
        totalCount: subscriptions.length
      }
    });
  } catch (err) {
    const errorMsg = err?.message || String(err) || 'Unknown error';
    logger.error('subscription_history_error', {
      userId: session.user.id,
      message: errorMsg,
      type: err?.constructor?.name
    });
    auditLog('subscription_history_error', session.user.id, { message: errorMsg }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to retrieve subscription history' });
  }
}

module.exports = handler;
