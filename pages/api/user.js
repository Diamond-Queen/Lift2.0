const prisma = require('../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { findUserByEmail } = require('../../lib/db');
const logger = require('../../lib/logger');

export default async function handler(req, res) {
  const { authOptions } = await import('./auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const user = prisma
      ? await prisma.user.findUnique({ 
          where: { email: session.user.email }, 
          include: { school: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } 
        })
      : await findUserByEmail(session.user.email);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    const { password, ...safe } = user;
    return res.json({ ok: true, data: { user: safe } });
  } catch (err) {
    logger.error('user_fetch_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
