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

async function handler(req, res) {
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

  const { authOptions } = require('../../../lib/authOptions');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userLimit = trackUserRateLimit(session.user.id || session.user.email, '/api/school/redeem');
  if (!userLimit.allowed) {
    auditLog('school_redeem_rate_limited_user', session.user.id || session.user.email, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  const { code } = req.body || {};
  if (!code) {
    auditLog('school_redeem_missing_code', null, { ip }, 'warning');
    return res.status(400).json({ ok: false, error: 'Missing code' });
  }

  const userEmail = session.user.email;
  auditLog('school_redeem_attempt', null, { ip, email: userEmail, code }, 'info');

  try {
    if (prisma) {
      logger.info(`[school_redeem] Looking up code: ${code}`);
      const schoolCode = await prisma.schoolCode.findUnique({ where: { code } });
      if (!schoolCode) {
        logger.warn(`[school_redeem] Code not found: ${code}`);
        auditLog('school_redeem_code_not_found', null, { code }, 'warning');
        return res.status(404).json({ ok: false, error: 'Code not found' });
      }
      logger.info(`[school_redeem] Code found: ${code}, schoolId: ${schoolCode.schoolId}`);

      logger.info(`[school_redeem] Looking up user: ${userEmail}`);
      const user = await prisma.user.findUnique({ where: { email: userEmail } });
      if (!user) {
        logger.warn(`[school_redeem] User not found: ${userEmail}`);
        auditLog('school_redeem_user_not_found', null, { email: userEmail }, 'warning');
        return res.status(404).json({ ok: false, error: 'User not found' });
      }
      logger.info(`[school_redeem] User found: ${user.id}`);

      const result = await prisma.$transaction(async (tx) => {
        // Check if this user already redeemed this specific code
        const existingUser = await tx.user.findUnique({ where: { id: user.id } });
        if (existingUser.schoolId === schoolCode.schoolId) {
          logger.warn(`[school_redeem] User already a member of school ${schoolCode.schoolId}`);
          return { ok: false, reason: 'already_member' };
        }
        // Multiple students can use the same code - don't mark as redeemed
        logger.info(`[school_redeem] Assigning schoolId ${schoolCode.schoolId} to user ${user.id}`);
        await tx.user.update({ where: { id: user.id }, data: { schoolId: schoolCode.schoolId, onboarded: true } });
        const school = await tx.school.findUnique({ where: { id: schoolCode.schoolId } });
        logger.info(`[school_redeem] Success! School: ${school?.name || school?.id}`);
        return { ok: true, school };
      });

      if (!result.ok) {
        auditLog('school_redeem_failed_already_member', user.id, { code, schoolId: schoolCode.schoolId }, 'warning');
        return res.status(400).json({ ok: false, error: 'You are already a member of this school' });
      }
      
      // Verify the update actually persisted by reading it back from the database
      // This ensures the transaction is fully committed before responding
      let verifyCount = 0;
      let userUpdated = false;
      while (verifyCount < 5) {
        const updatedUser = await prisma.user.findUnique({ 
          where: { id: user.id },
          select: { schoolId: true }
        });
        if (updatedUser?.schoolId === schoolCode.schoolId) {
          userUpdated = true;
          break;
        }
        verifyCount++;
        if (verifyCount < 5) await new Promise(r => setTimeout(r, 50));
      }
      
      if (!userUpdated) {
        logger.error('[school_redeem] Update verification failed', { userId: user.id, schoolId: schoolCode.schoolId });
      }
      
      auditLog('school_redeem_success', user.id, { code, schoolId: schoolCode.schoolId, schoolName: result.school?.name }, 'info');
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
    logger.error('school_redeem_error', { message: err.message, stack: err.stack });
    auditLog('school_redeem_error', null, { code, email: userEmail, message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
