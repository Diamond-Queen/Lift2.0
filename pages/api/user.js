const prisma = require('../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { findUserByEmail } = require('../../lib/db');
const logger = require('../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  trackUserRateLimit,
  auditLog,
} = require('../../lib/security');
const { extractClientIp } = require('../../lib/ip');

async function handler(req, res) {
  setSecureHeaders(res);
  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('user_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/user');
  if (!ipLimit.allowed) {
    auditLog('user_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = await import('./auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userLimit = trackUserRateLimit(session.user.id || session.user.email, '/api/user');
  if (!userLimit.allowed) {
    auditLog('user_rate_limited_user', session.user.id || session.user.email, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  try {
    const user = prisma
      ? await prisma.user.findUnique({ 
          where: { email: session.user.email }, 
          include: { school: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } 
        })
      : await findUserByEmail(session.user.email);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    const { password, ...safe } = user;
    return res.json({ ok: true, data: { user: safe } });
  } catch (err) {
    logger.error('user_fetch_error', { message: err.message });
    auditLog('user_fetch_error', session?.user?.id || session?.user?.email, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
