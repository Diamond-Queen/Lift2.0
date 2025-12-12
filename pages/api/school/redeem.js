const prisma = require('../../../lib/prisma');
const { getServerSession } = require('next-auth/next');
const { pool, findUserByEmail } = require('../../../lib/db');
const logger = require('../../../lib/logger');
const {
  setSecureHeaders,
  validateRequest,
  trackIpRateLimit,
  trackUserRateLimit,
  auditLog,
} = require('../../../lib/security');
const { extractClientIp } = require('../../../lib/ip');

export default async function handler(req, res) {
  setSecureHeaders(res);
  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('school_redeem_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/school/redeem');
  if (!ipLimit.allowed) {
    auditLog('school_redeem_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userLimit = trackUserRateLimit(session.user.id || session.user.email, '/api/school/redeem');
  if (!userLimit.allowed) {
    auditLog('school_redeem_rate_limited_user', session.user.id || session.user.email, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  try {
    if (prisma) {
      const schoolCode = await prisma.schoolCode.findUnique({ where: { code } });
      if (!schoolCode) return res.status(404).json({ ok: false, error: 'Code not found' });

      const user = await prisma.user.findUnique({ where: { email: session.user.email } });
      if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

      const result = await prisma.$transaction(async (tx) => {
        // Check if this user already redeemed this specific code
        const existingUser = await tx.user.findUnique({ where: { id: user.id } });
        if (existingUser.schoolId === schoolCode.schoolId) {
          return { ok: false, reason: 'already_member' };
        }
        // Multiple students can use the same code - don't mark as redeemed
        await tx.user.update({ where: { id: user.id }, data: { schoolId: schoolCode.schoolId, onboarded: true } });
        const school = await tx.school.findUnique({ where: { id: schoolCode.schoolId } });
        return { ok: true, school };
      });

      if (!result.ok) return res.status(400).json({ ok: false, error: 'You are already a member of this school' });
      return res.json({ ok: true, data: { school: result.school } });
    } else {
      // pg fallback using conditional update inside a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: codeRows } = await client.query('SELECT * FROM "SchoolCode" WHERE code = $1 LIMIT 1', [code]);
        const sc = codeRows[0];
        if (!sc) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, error: 'Code not found' });
        }
        const user = await findUserByEmail(session.user.email);
        if (!user) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, error: 'User not found' });
        }
        // Check if this user already has this school
        if (user.schoolId === sc.schoolId) {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, error: 'You are already a member of this school' });
        }
        // Multiple students can use the same code - just assign school to user
        await client.query('UPDATE "User" SET "schoolId" = $1, onboarded = true WHERE id = $2', [sc.schoolId, user.id]);
        const { rows: schoolRows } = await client.query('SELECT id, name, "createdAt" FROM "School" WHERE id = $1', [sc.schoolId]);
        await client.query('COMMIT');
        return res.json({ ok: true, data: { school: schoolRows[0] } });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch(_){}
        throw e;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    logger.error('redeem_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
