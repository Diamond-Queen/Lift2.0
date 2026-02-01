const prisma = require('../../../lib/prisma');
const { setSecureHeaders, trackIpRateLimit, validateRequest, auditLog } = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');
const argon2 = require('argon2');
const { Prisma } = require('@prisma/client');

module.exports = async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) return res.status(400).json({ ok: false, error: 'Request rejected' });

  const rl = trackIpRateLimit(ip, '/api/auth/reset-password');
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const { email, token, password } = req.body || {};
  if (!email || !token || !password) return res.status(400).json({ ok: false, error: 'Missing parameters' });

  if (typeof password !== 'string' || password.length < 10 || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 10 characters and include a number and special character' });
  }

  try {
    const identifier = `password-reset:${email}`;
    const record = await prisma.verificationToken.findFirst({ where: { identifier, token } });
    if (!record || new Date(record.expires) < new Date()) {
      auditLog('password_reset_token_invalid', null, { email, ip });
      return res.status(400).json({ ok: false, error: 'Invalid or expired token' });
    }

    const hash = await argon2.hash(password, { timeCost: 3, memoryCost: 19456 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ ok: false, error: 'Invalid token' });

    await prisma.user.update({ where: { email }, data: { password: hash } });

    // remove any tokens for this identifier
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    auditLog('password_reset_success', user.id, { email, ip });
    return res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      auditLog('password_reset_prisma_error', null, { message: err.message }, 'error');
    } else {
      auditLog('password_reset_error', null, { message: err.message }, 'error');
    }
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
