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
  if (!session || !session.user?.id) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const betaTester = await prisma.betaTester.findUnique({
      where: { userId: session.user.id },
    });

    if (!betaTester) {
      return res.status(200).json({
        ok: true,
        data: {
          trial: null,
        },
      });
    }

    const now = new Date();
    const daysRemaining = Math.ceil(
      (betaTester.trialEndsAt - now) / (24 * 60 * 60 * 1000)
    );

    let status = 'active';
    if (betaTester.status === 'converted' || betaTester.status === 'expired') {
      status = betaTester.status;
    } else if (betaTester.trialEndsAt <= now) {
      status = 'trial-expired';
      // Auto-mark as expired if trial ended
      try {
        await prisma.betaTester.update({
          where: { id: betaTester.id },
          data: { status: 'expired' }
        });
      } catch (e) {
        logger.warn('failed_to_mark_beta_expired', { betaTester: betaTester.id });
      }
    } else {
      status = 'trial-active';
    }

    return res.status(200).json({
      ok: true,
      data: {
        trial: {
          id: betaTester.id,
          trialType: betaTester.trialType,
          schoolName: betaTester.schoolName,
          organizationName: betaTester.organizationName,
          trialEndsAt: betaTester.trialEndsAt,
          daysRemaining: Math.max(0, daysRemaining),
          status,
          createdAt: betaTester.createdAt,
        },
      },
    });
  } catch (err) {
    logger.error('beta_status_error', { message: err.message, userId: session.user.id });
    auditLog('beta_status_error', session.user.id, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
