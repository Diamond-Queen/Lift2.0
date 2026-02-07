const prisma = require('../../../lib/prisma');
const { pool, findUserByEmail } = require('../../../lib/db');
const { getServerSession } = require('next-auth/next');
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
    auditLog('classes_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/content/classes');
  if (!ipLimit.allowed) {
    auditLog('classes_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = require('../../../lib/authOptions');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const user = prisma
    ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : await findUserByEmail(session.user.email);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  const userId = user.id;
  const userLimit = trackUserRateLimit(userId, '/api/content/classes');
  if (!userLimit.allowed) {
    auditLog('classes_rate_limited_user', userId, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  try {
    if (req.method === 'GET') {
      // List all classes for user - filter by type if specified in query
      const classType = req.query.type || 'class'; // Default to 'class' unless specified as 'job'
      const classes = prisma
        ? await prisma.class.findMany({
            where: { userId, type: classType },
            orderBy: { createdAt: 'desc' }
          })
        : (await pool.query(
            'SELECT id, name, color, type, "createdAt", "updatedAt" FROM "Class" WHERE "userId" = $1 AND type = $2 ORDER BY "createdAt" DESC',
            [userId, classType]
          )).rows;

      return res.json({ ok: true, data: classes });
    }

    if (req.method === 'POST') {
      // Create a new class or job
      const { name, color, type } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Name is required' });
      }

      const classType = type || 'class'; // Default to 'class' unless specified as 'job'

      // Check subscription plan and class/job limit
      try {
        const userWithSub = await prisma.user.findUnique({
          where: { id: userId },
          select: { schoolId: true, subscriptions: { where: { status: { in: ['active', 'trialing'] } } } }
        });
        
        // School members get full access
        const hasSchoolAccess = !!userWithSub?.schoolId;
        if (!hasSchoolAccess) {
          const activeSub = userWithSub?.subscriptions?.[0];
          const plan = activeSub?.plan;
          
          // Career Only plan cannot create classes (notes feature)
          if (plan === 'career' && classType === 'class') {
            return res.status(403).json({ 
              ok: false, 
              error: 'Notes feature is not included in your Career Only plan. Upgrade to Full Access to organize notes by class.' 
            });
          }
          
          // Notes Only plan cannot create jobs (career feature)
          if (plan === 'notes' && classType === 'job') {
            return res.status(403).json({ 
              ok: false, 
              error: 'Career tools are not included in your Notes Only plan. Upgrade to Full Access to manage jobs.' 
            });
          }
          
          // Notes Only plan has a 4-class limit; Full Access and beta are unlimited
          if (plan === 'notes' && classType === 'class') {
            const classCount = await prisma.class.count({ where: { userId, type: 'class' } });
            if (classCount >= 4) {
              return res.status(403).json({ 
                ok: false, 
                error: 'You have reached the 4 class limit on your current plan. Upgrade to Full Access for unlimited classes.' 
              });
            }
          }
          
          // Career Only plan has a 4-job limit; Full Access and beta are unlimited
          if (plan === 'career' && classType === 'job') {
            const jobCount = await prisma.class.count({ where: { userId, type: 'job' } });
            if (jobCount >= 4) {
              return res.status(403).json({ 
                ok: false, 
                error: 'You have reached the 4 job limit on your current plan. Upgrade to Full Access for unlimited jobs.' 
              });
            }
          }
        }
      } catch (err) {
        logger.error('Failed to check subscription limit', { error: err.message });
        // Continue - let request proceed if check fails
      }

      const trimmedName = name.trim();
      
      // Check if class/job with this name already exists for this user
      try {
        if (prisma) {
          const existingClass = await prisma.class.findFirst({
            where: { userId, name: trimmedName, type: classType }
          });
          
          if (existingClass) {
            return res.status(409).json({ 
              ok: false, 
              error: 'A ' + classType + ' with this name already exists',
              data: existingClass 
            });
          }
        }
      } catch (checkErr) {
        logger.error('existence_check_failed', { error: checkErr.message });
        // Continue to attempt creation
      }
      
      try {
        const newClass = prisma
          ? await prisma.class.create({
              data: { userId, name: trimmedName, color: color || '#d4af37', type: classType }
            })
          : (await pool.query(
              'INSERT INTO "Class" (id, "userId", name, color, type, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()) RETURNING *',
              [userId, trimmedName, color || '#d4af37', classType]
            )).rows[0];

        logger.info('class_created', { userId, name: trimmedName, type: classType });
        return res.json({ ok: true, data: newClass });
      } catch (e) {
        if (e && (e.code === 'P2002' || e.code === '23505')) {
          // P2002 is Prisma unique constraint, 23505 is PostgreSQL unique constraint
          return res.status(409).json({ 
            ok: false, 
            error: 'A ' + classType + ' with this name already exists' 
          });
        }
        logger.error('class_creation_failed', { error: e?.message, code: e?.code });
        // Return a 500 instead of re-throwing to avoid unhandled server errors
        return res.status(500).json({ ok: false, error: 'Server error' });
      }
    }

    if (req.method === 'PUT') {
      // Rename a class and update color
      const { classId, name, color } = req.body || {};
      if (!classId) return res.status(400).json({ ok: false, error: 'classId required' });
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Class name is required' });
      }

      const trimmedName = name.trim();
      const updateData = { name: trimmedName };
      if (color && typeof color === 'string') {
        updateData.color = color;
      }

      try {
        if (prisma) {
          const cls = await prisma.class.findUnique({ where: { id: classId }, select: { userId: true } });
          if (!cls || cls.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

          const updatedClass = await prisma.class.update({
            where: { id: classId },
            data: updateData
          });
          logger.info('class_renamed', { userId, classId, newName: trimmedName, color });
          return res.json({ ok: true, data: updatedClass });
        } else {
          const { rows: classRows } = await pool.query('SELECT "userId" FROM "Class" WHERE id = $1', [classId]);
          if (!classRows[0] || classRows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

          const colorClause = color ? ', color = $2' : '';
          const params = color ? [trimmedName, color, classId] : [trimmedName, classId];
          const updated = await pool.query(
            `UPDATE "Class" SET name = $1${colorClause}, "updatedAt" = NOW() WHERE id = $${colorClause ? '3' : '2'} RETURNING *`,
            params
          );
          logger.info('class_renamed', { userId, classId, newName: trimmedName, color });
          return res.json({ ok: true, data: updated.rows[0] });
        }
      } catch (e) {
        if (e.code === 'P2002') {
          return res.status(409).json({ ok: false, error: 'Class name already exists' });
        }
        throw e;
      }
    }

    if (req.method === 'DELETE') {
      // Delete a class
      const { classId } = req.body || {};
      if (!classId) return res.status(400).json({ ok: false, error: 'classId required' });

      if (prisma) {
        const cls = await prisma.class.findUnique({ where: { id: classId }, select: { userId: true } });
        if (!cls || cls.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

        await prisma.class.delete({ where: { id: classId } });
      } else {
        const { rows } = await pool.query('SELECT "userId" FROM "Class" WHERE id = $1', [classId]);
        if (!rows[0] || rows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });
        await pool.query('DELETE FROM "Class" WHERE id = $1', [classId]);
      }

      logger.info('class_deleted', { userId, classId });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    logger.error('classes_handler_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
