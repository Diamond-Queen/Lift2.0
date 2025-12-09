const prisma = require('../../../lib/prisma');
const db = require('../../../lib/db');
const argon2 = require('argon2');
const { Prisma } = require('@prisma/client');
const { setSecureHeaders } = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { extractClientIp } = require('../../../lib/ip');

// Simple in-memory rate limiter per IP (not perfect for distributed systems,
// but useful for local dev). For production, use Redis or an external store.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // max requests per IP per window
const rateMap = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return { allowed: entry.count <= RATE_LIMIT_MAX, remaining: Math.max(0, RATE_LIMIT_MAX - entry.count), reset: entry.reset };
}

export default async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = extractClientIp(req);
  const rl = rateLimit(ip);
  if (!rl.allowed) return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });

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
    return res.status(201).json({ ok: true, data: { user: safe } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(400).json({ ok: false, error: 'Email already in use' });
    }
    logger.error('register_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

