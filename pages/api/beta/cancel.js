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

    // Mark beta tester as inactive (cancel trial)
    if (prisma) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          betaTester: false,
          betaTrialEndsAt: new Date() // Mark as expired
        }
      });
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
