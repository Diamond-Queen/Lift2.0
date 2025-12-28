const prisma = require('../../../lib/prisma');
const { getSession } = require('next-auth/react');
const { setSecureHeaders } = require('../../../lib/security');

async function handler(req, res) {
  setSecureHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const session = await getSession({ req });
  if (!session || !session.user) {
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
    console.error('Error fetching beta status:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
