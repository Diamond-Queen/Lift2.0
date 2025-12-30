const prisma = require('../../../lib/prisma');
const {
  setSecureHeaders,
  trackIpRateLimit,
  validateRequest,
  auditLog,
} = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { extractClientIp } = require('../../../lib/ip');
const { getServerSession } = require('next-auth/next');
const { authOptions } = require('../../../lib/authOptions');

async function handler(req, res) {
  setSecureHeaders(res);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  
  if (!validation.valid) {
    const statusCode = validation.status || 400;
    auditLog('beta_register_request_rejected', null, { reason: validation.reason, ip }, 'warning');
    return res.status(statusCode).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }

  const rl = trackIpRateLimit(ip, '/api/beta/register');
  if (!rl.allowed) {
    auditLog('beta_register_rate_limited', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  // Check session - user must be logged in
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. You must be logged in.' });
  }

  const { email, name, trialType, schoolName, organizationName } = req.body || {};

  // Validate required fields
  if (!email || !name || !trialType) {
    return res.status(400).json({ ok: false, error: 'Email, name, and trial type are required.' });
  }

  if (!['school', 'social'].includes(trialType)) {
    return res.status(400).json({ ok: false, error: 'Invalid trial type.' });
  }

  if (trialType === 'school' && !schoolName) {
    return res.status(400).json({ ok: false, error: 'School name is required for school trials.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    // Check if user already exists as a beta tester
    const existingBeta = await prisma.betaTester.findUnique({
      where: { userId: session.user.id }
    });

    if (existingBeta) {
      return res.status(400).json({ ok: false, error: 'You are already registered as a beta tester.' });
    }

    // Calculate trial end date based on trial type
    const now = new Date();
    let trialEndsAt;

    if (trialType === 'school') {
      // 14 days for schools
      trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else {
      // 3-4 days for social (using 4 days)
      trialEndsAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    }

    // Create beta tester record
    const betaTester = await prisma.betaTester.create({
      data: {
        userId: session.user.id,
        trialType,
        schoolName: trialType === 'school' ? String(schoolName).slice(0, 200) : null,
        organizationName: trialType === 'social' ? String(organizationName || '').slice(0, 200) : null,
        trialEndsAt,
        status: 'active',
      },
    });

    // Mark user as onboarded
    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboarded: true },
    });

    auditLog('beta_register_success', session.user.id, {
      email: normalizedEmail,
      trialType,
      trialEndsAt: trialEndsAt.toISOString(),
    });

    return res.status(201).json({
      ok: true,
      data: {
        betaTester: {
          id: betaTester.id,
          trialType: betaTester.trialType,
          trialEndsAt: betaTester.trialEndsAt,
          daysRemaining: Math.ceil((betaTester.trialEndsAt - now) / (24 * 60 * 60 * 1000)),
        },
      },
    });
  } catch (err) {
    logger.error('beta_register_error', { message: err.message, userId: session.user.id });
    auditLog('beta_register_error', session.user.id, { message: err.message, email: normalizedEmail }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}

module.exports = handler;
