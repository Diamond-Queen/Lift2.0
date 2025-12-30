const prisma = require('../../../lib/prisma');
const db = require('../../../lib/db');
const argon2 = require('argon2');
const { Prisma } = require('@prisma/client');
const {
  setSecureHeaders,
  trackIpRateLimit,
  validateRequest,
  auditLog,
} = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { extractClientIp } = require('../../../lib/ip');
const { sanitizeEmail, sanitizeName } = require('../../../lib/sanitize');

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    const statusCode = validation.status || 400;
    auditLog('register_request_rejected', null, { reason: validation.reason, ip }, 'warning');
    return res.status(statusCode).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const rl = trackIpRateLimit(ip, '/api/auth/register');
  if (!rl.allowed) {
    auditLog('register_rate_limited', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { name, email, password } = req.body || {};

  // Validate and sanitize inputs
  const sanitizedEmail = sanitizeEmail(email);
  if (!sanitizedEmail) return res.status(400).json({ ok: false, error: 'Valid email is required' });

  const sanitizedName = sanitizeName(name, 120);
  if (!sanitizedName) return res.status(400).json({ ok: false, error: 'Valid name is required' });

  if (!password || typeof password !== 'string' || password.length < 10 || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 10 characters and include a number and special character' });
  }

  try {
    const existing = prisma ? await prisma.user.findUnique({ where: { email: sanitizedEmail } }) : await db.findUserByEmail(sanitizedEmail);
    if (existing) return res.status(409).json({ ok: false, error: 'Email already in use' });

    const hash = await argon2.hash(password, { timeCost: 3, memoryCost: 19456 });
    const user = prisma
      ? await prisma.user.create({ data: { name: sanitizedName, email: sanitizedEmail, password: hash, emailVerified: null } })
      : await db.createUser({ name: sanitizedName, email: sanitizedEmail, password: hash });
    
    const { password: _p, ...safe } = user;
    auditLog('register_success', safe.id, { email: sanitizedEmail });
    return res.status(201).json({ ok: true, data: { user: safe, message: 'Account created successfully' } });
  } catch (err) {
    // Handle unique constraint violations
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return res.status(409).json({ ok: false, error: 'Email already in use' });
      }
      // Log other Prisma errors
      logger.error('register_prisma_error', { code: err.code, message: err.message, email: sanitizedEmail });
    } else {
      logger.error('register_error', { message: err.message, email: sanitizedEmail });
    }
    auditLog('register_error', null, { message: err.message, email: sanitizedEmail }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;