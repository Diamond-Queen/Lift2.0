const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const logger = require('../../../lib/logger');
const { setSecureHeaders } = require('../../../lib/security');

async function handler(req, res) {
  setSecureHeaders(res);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
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
    logger.error('demo_watched_session_error', { message: e.message });
    return res.status(500).json({ ok: false, error: 'Session error' });
  }

  if (!session?.user?.email) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { demoWatched: true },
      select: { id: true, email: true, demoWatched: true }
    });

    logger.info('demo_watched_marked', { userId: user.id });

    return res.status(200).json({
      ok: true,
      data: {
        demoWatched: user.demoWatched
      }
    });
  } catch (error) {
    logger.error('demo_watched_error', { error: error.message });
    return res.status(500).json({ ok: false, error: 'Failed to update demo status' });
  }
}

export default handler;
