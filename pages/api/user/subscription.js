const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
} = require('../../../lib/security');

async function handler(req, res) {
  setSecureHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const validation = validateRequest(req);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: 'Request rejected' });
  }

  let authOptions;
  try {
    const imported = await import('../../../lib/authOptions');
    authOptions = imported.authOptions;
  } catch (e) {
    logger.error('failed_to_import_auth_options', { error: e.message });
    return res.status(500).json({ ok: false, error: 'Server configuration error' });
  }

  let session;
  try {
    session = await getServerSession(req, res, authOptions);
  } catch (e) {
    logger.error('subscription_fetch_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error. Please try again.' });
  }

  if (!session || !session.user?.email) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    if (!prisma) {
      return res.status(503).json({ ok: false, error: 'Database unavailable' });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (!subscription) {
      return res.json({ ok: true, data: null });
    }

    return res.json({
      ok: true,
      data: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        createdAt: subscription.createdAt
      }
    });
  } catch (err) {
    logger.error('subscription_fetch_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Failed to fetch subscription' });
  }
}

module.exports = handler;
