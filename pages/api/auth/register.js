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

export default async function handler(req, res) {
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
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password are required' });

  if (typeof password !== 'string' || password.length < 10 || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 10 characters and include a number and special character' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = prisma ? await prisma.user.findUnique({ where: { email: normalizedEmail } }) : await db.findUserByEmail(normalizedEmail);
    if (existing) return res.status(400).json({ ok: false, error: 'Email already in use' });

    const hash = await argon2.hash(password, { timeCost: 3, memoryCost: 19456 });
    const user = prisma
      ? await prisma.user.create({ data: { name: name ? String(name).slice(0,120) : null, email: normalizedEmail, password: hash } })
      : await db.createUser({ name: name ? String(name).slice(0,120) : null, email: normalizedEmail, password: hash });
    const { password: _p, ...safe } = user;
    auditLog('register_success', safe.id, { email: normalizedEmail });
    return res.status(201).json({ ok: true, data: { user: safe } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(400).json({ ok: false, error: 'Email already in use' });
    }
    logger.error('register_error', { message: err.message });
    auditLog('register_error', null, { message: err.message, email: normalizedEmail }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

