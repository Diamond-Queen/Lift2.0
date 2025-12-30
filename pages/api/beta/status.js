const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { setSecureHeaders, auditLog } = require('../../../lib/security');
const logger = require('../../../lib/logger');
const { authOptions } = require('../../../lib/authOptions');

async function handler(req, res) {
  setSecureHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const betaTester = await prisma.betaTester.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        userId: true,
        trialType: true,
        schoolName: true,
        organizationName: true,
        trialEndsAt: true,
        status: true,
        createdAt: true,
      }
    });

    if (!betaTester) {
      return res.status(200).json({
        ok: true,
        data: { trial: null },
      });
    }

    // Ensure dates are Date objects
    const trialEndsAt = new Date(betaTester.trialEndsAt);
    const createdAt = new Date(betaTester.createdAt);
    const now = new Date();

    // Calculate days remaining
    const msRemaining = trialEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    // Determine trial status
    let status = betaTester.status; // Could be 'active', 'converted', or 'expired'

    // If status is not explicitly 'converted' or 'expired', check if expired
    if (status !== 'converted' && status !== 'expired') {
      if (now > trialEndsAt) {
        status = 'expired';
        // Async update status in database
        prisma.betaTester.update({
          where: { id: betaTester.id },
          data: { status: 'expired' }
        }).catch(e => {
          logger.warn('failed_to_mark_beta_expired', { betaTesterId: betaTester.id, error: e.message });
        });
      } else {
        status = 'active';
      }
    }

    return res.status(200).json({
      ok: true,
      data: {
        trial: {
          id: betaTester.id,
          trialType: betaTester.trialType,
          schoolName: betaTester.schoolName,
          organizationName: betaTester.organizationName,
          trialEndsAt: trialEndsAt.toISOString(),
          createdAt: createdAt.toISOString(),
          daysRemaining: Math.max(0, daysRemaining),
          status,
        },
      },
    });
  } catch (err) {
    logger.error('beta_status_error', {
      message: err.message,
      code: err.code,
      userId: session.user.id,
      stack: err.stack
    });

    auditLog('beta_status_error', session.user.id, {
      message: err.message,
      code: err.code,
    }, 'error');

    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
