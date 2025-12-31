const prisma = require('../../../lib/prisma');
const dbFallback = require('../../../lib/db-fallback');
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
  
  // Check if Prisma client is available, use fallback if not
  const db = prisma || dbFallback;
  if (!db) {
    logger.error('database_unavailable', { error: 'Neither Prisma nor fallback database available' });
    return res.status(500).json({ ok: false, error: 'Database connection error. Please try again.' });
  }
  
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

  // Get authOptions - try static import first, fall back to dynamic if needed
  let authOptions;
  try {
    const { authOptions: staticAuthOptions } = await import('../../../lib/authOptions');
    authOptions = staticAuthOptions;
  } catch (e) {
    logger.warn('failed_to_import_auth_options_statically', { error: e.message });
    // This shouldn't happen, but provide a fallback
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }
  
  // Check session - user must be logged in
  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. You must be logged in.' });
  }

  const userId = session.user?.id || null;
  const sessionEmail = session.user?.email || null;
  
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Unauthorized. Invalid session.' });
  }
  
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
    let user;
    try {
      if (prisma) {
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, onboarded: true }
        });
      } else {
        user = await dbFallback.findUserById(userId);
      }
    } catch (dbErr) {
      logger.error('user_fetch_error', { userId, message: dbErr.message });
      throw new Error('Failed to fetch user data');
    }

    if (!user) {
      logger.warn('beta_register_user_not_found', { userId, sessionEmail });
      return res.status(401).json({ ok: false, error: 'User not found. Please sign in again.' });
    }

    // Check if user already exists as a beta tester
    let existingBeta;
    try {
      existingBeta = await prisma.betaTester.findUnique({
        where: { userId }
      });
    } catch (prismaErr) {
      logger.error('beta_tester_check_error', { userId, message: prismaErr.message });
      throw new Error('Failed to check beta tester status');
    }

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
    let betaTester;
    try {
      if (prisma) {
        betaTester = await prisma.betaTester.create({ 
          data: betaTesterData,
          select: { id: true, trialType: true, trialEndsAt: true }
        });
      } else {
        betaTester = await dbFallback.createBetaTester(betaTesterData);
      }
    } catch (dbErr) {
      logger.error('beta_tester_create_error', { userId, message: dbErr.message });
      throw new Error('Failed to create beta tester record');
    }

    if (!betaTester || !betaTester.id) {
      throw new Error('Failed to create beta tester record - no ID returned');
    }

    let updatedUser;
    try {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { onboarded: true },
        select: { id: true, email: true, onboarded: true }
      });
    } catch (prismaErr) {
      logger.error('user_update_error', { userId, message: prismaErr.message });
      throw new Error('Failed to update user onboarded status');
    }

    if (!updatedUser || !updatedUser.id) {
      throw new Error('Failed to update user - invalid response');
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
    const errorMessage = err?.message || 'Unknown error';
    const errorCode = err?.code || undefined;
    const errorEmail = sessionEmail || 'unknown';
    
    logger.error('beta_register_error', {
      message: errorMessage,
      code: errorCode,
      userId: userId || 'unknown',
      userEmail: errorEmail,
      stack: err?.stack || 'no stack'
    });

    auditLog('beta_register_error', userId || null, {
      message: errorMessage,
      code: errorCode,
      email: errorEmail,
    }, 'error');

    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}

module.exports = handler;
