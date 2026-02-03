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
    auditLog('delete_account_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const ipLimit = trackIpRateLimit(ip, '/api/user/delete');
  if (!ipLimit.allowed) {
    auditLog('delete_account_rate_limited_ip', null, { ip });
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
    logger.error('delete_account_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    logger.warn('delete_account_unauthorized', { hasSession: !!session, hasEmail: !!session?.user?.email });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const user = prisma
      ? await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, email: true }
        })
      : null;

    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const userLimit = trackUserRateLimit(user.id, '/api/user/delete');
    if (!userLimit.allowed) {
      auditLog('delete_account_rate_limited_user', user.id, { ip });
      return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
    }

    // Delete user account and all related data
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        // Delete all related records in order (respecting foreign key constraints)
        await tx.contentItem.deleteMany({ where: { userId: user.id } });
        await tx.class.deleteMany({ where: { userId: user.id } });
        await tx.job.deleteMany({ where: { userId: user.id } });
        await tx.betaTester.deleteMany({ where: { userId: user.id } });
        await tx.subscription.deleteMany({ where: { userId: user.id } });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.account.deleteMany({ where: { userId: user.id } });
        
        // Finally delete the user
        await tx.user.delete({ where: { id: user.id } });
      });

      logger.info('user_account_deleted', { userId: user.id, email: user.email });
      auditLog('user_account_deleted', user.id, { email: user.email, ip }, 'info');
    }

    return res.json({ ok: true, message: 'Account permanently deleted', shouldLogout: true });
  } catch (err) {
    logger.error('delete_account_error', { message: err.message, stack: err.stack });
    auditLog('delete_account_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Failed to delete account' });
  }
}

module.exports = handler;
