import { getSession } from 'next-auth/react';
import prisma from '../../../lib/prisma';
import { findUserByEmail } from '../../../lib/db';
import logger from '../../../lib/logger';
import { setSecureHeaders } from '../../../lib/security';

const usePrisma = !!prisma;

export default async function handler(req, res) {
  setSecureHeaders(res);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    
    // If no session, return 401
    if (!session || !session.user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // Get user from database using email from session
    let user;
    if (usePrisma) {
      user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          onboarded: true,
          createdAt: true,
          schoolId: true,
          preferences: true,
          formatTemplate: true,
        },
      });
    } else {
      user = await findUserByEmail(session.user.email);
      if (user) {
        // Select only safe fields
        const { password, ...safe } = user;
        user = safe;
      }
    }

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    return res.status(200).json({
      ok: true,
      data: {
        user,
      },
    });
  } catch (err) {
    logger.error('user_fetch_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
