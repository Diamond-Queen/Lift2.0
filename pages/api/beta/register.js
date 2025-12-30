const prisma = require('../../../lib/prisma');
const {
  setSecureHeaders,
  trackIpRateLimit,
  validateRequest,
  auditLog,
  trackUserRateLimit,
} = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { extractClientIp } = require('../../../lib/ip');
const { getServerSession } = require('next-auth/next');
const { sanitizeName } = require('../../../lib/sanitize');

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

  // Get authOptions dynamically to ensure proper initialization
  const { authOptions } = await import('../auth/[...nextauth]');
  
  // Check session - user must be logged in
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. You must be logged in.' });
  }

  const userId = session.user.id;
  const sessionEmail = session.user.email;
  
  const userLimit = trackUserRateLimit(userId, '/api/beta/register');
  if (!userLimit.allowed) {
    auditLog('beta_register_rate_limited_user', userId, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  const { trialType, schoolName, organizationName } = req.body || {};

  // Validate required fields
  if (!trialType) {
    return res.status(400).json({ ok: false, error: 'Trial type is required.' });
  }

  if (!['school', 'social'].includes(trialType)) {
    return res.status(400).json({ ok: false, error: 'Invalid trial type. Must be "school" or "social".' });
  }

  // Validate school-specific fields
  if (trialType === 'school') {
    const cleanSchoolName = schoolName ? String(schoolName).trim() : '';
    if (!cleanSchoolName) {
      return res.status(400).json({ ok: false, error: 'School name is required for school trials.' });
    }
  }

  try {
    // Fetch complete user data from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, onboarded: true }
    });

    if (!user) {
      logger.warn('beta_register_user_not_found', { userId, sessionEmail });
      return res.status(401).json({ ok: false, error: 'User not found. Please sign in again.' });
    }

    // Check if user already exists as a beta tester
    const existingBeta = await prisma.betaTester.findUnique({
      where: { userId }
    });

    if (existingBeta) {
      return res.status(400).json({ ok: false, error: 'You are already registered as a beta tester.' });
    }

    // Prepare beta tester data with proper null handling
    const cleanSchoolName = trialType === 'school' ? sanitizeName(schoolName, 200) : null;
    const cleanOrgName = trialType === 'social' ? sanitizeName(organizationName, 200) : null;

    // Calculate trial end date
    const now = new Date();
    const daysToAdd = trialType === 'school' ? 14 : 4;
    const trialEndsAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const betaTesterData = {
      userId,
      trialType,
      schoolName: cleanSchoolName,
      organizationName: cleanOrgName,
      trialEndsAt,
      status: 'active',
    };

    // Create beta tester record and mark user as onboarded
    // Do this sequentially to ensure atomicity
    const betaTester = await prisma.betaTester.create({ 
      data: betaTesterData,
      select: { id: true, trialType: true, trialEndsAt: true }
    });

    if (!betaTester) {
      throw new Error('Failed to create beta tester record');
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { onboarded: true },
      select: { id: true, email: true, onboarded: true }
    });

    if (!updatedUser) {
      throw new Error('Failed to update user onboarded status');
    }

    logger.info('beta_register_success', {
      userId,
      betaTesterId: betaTester.id,
      trialType,
      userEmail: user.email
    });

    auditLog('beta_register_success', userId, {
      email: user.email,
      trialType,
      trialEndsAt: trialEndsAt.toISOString(),
      betaTesterId: betaTester.id,
    });

    return res.status(201).json({
      ok: true,
      data: {
        betaTester: {
          id: betaTester.id,
          trialType: betaTester.trialType,
          trialEndsAt: betaTester.trialEndsAt.toISOString(),
          daysRemaining: daysToAdd,
        },
      },
    });
  } catch (err) {
    logger.error('beta_register_error', {
      message: err.message,
      code: err.code,
      userId,
      userEmail: sessionEmail,
      stack: err.stack
    });

    auditLog('beta_register_error', userId, {
      message: err.message,
      code: err.code,
      email: sessionEmail,
    }, 'error');

    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}

module.exports = handler;
