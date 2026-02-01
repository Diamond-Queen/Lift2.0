const prisma = require('../../../lib/prisma');
const { setSecureHeaders, trackIpRateLimit, validateRequest, auditLog } = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');
const { sendEmailNotification } = require('../../../lib/notify');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) return res.status(400).json({ ok: false, error: 'Request rejected' });

  const rl = trackIpRateLimit(ip, '/api/auth/reset-password');
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ ok: false, error: 'Email required' });

  try {
    const user = prisma ? await prisma.user.findUnique({ where: { email } }) : null;

    // Always respond with success to avoid user enumeration
    if (!user) {
      auditLog('password_reset_requested_unknown_email', null, { email, ip });
      return res.json({ ok: true, message: 'If an account exists, an email was sent' });
    }

    const identifier = `password-reset:${email}`;

    // remove old tokens for this identifier
    await prisma.verificationToken.deleteMany({ where: { identifier } });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.verificationToken.create({ data: { identifier, token, expires } });

    const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${base.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    const html = `<p>You requested a password reset for your Lift account. Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">Reset your password</a></p>`;

    try {
      await sendEmailNotification({ to: email, subject: 'Reset your Lift password', html });
      auditLog('password_reset_email_sent', user.id, { email, ip });
    } catch (e) {
      auditLog('password_reset_email_failed', user.id, { email, ip, error: e.message }, 'warning');
    }

    return res.json({ ok: true, message: 'If an account exists, an email was sent' });
  } catch (err) {
    auditLog('password_reset_error', null, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
