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

export default async function handler(req, res) {
  setSecureHeaders(res);

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('classes_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/content/classes');
  if (!ipLimit.allowed) {
    auditLog('classes_rate_limited_ip', null, { ip });
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ error: 'Unauthorized' });

  const user = prisma
    ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : await findUserByEmail(session.user.email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const userId = user.id;
  const userLimit = trackUserRateLimit(userId, '/api/content/classes');
  if (!userLimit.allowed) {
    auditLog('classes_rate_limited_user', userId, { ip });
    return res.status(429).json({ error: 'Too many requests for this user.' });
  }

  try {
    if (req.method === 'GET') {
      // List all classes for user
      const classes = prisma
        ? await prisma.class.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
          })
        : (await pool.query(
            'SELECT id, name, color, "createdAt", "updatedAt" FROM "Class" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
            [userId]
          )).rows;

      return res.json({ ok: true, data: classes });
    }

    if (req.method === 'POST') {
      // Create a new class
      const { name, color } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Class name is required' });
      }

      const trimmedName = name.trim();
      try {
        const newClass = prisma
          ? await prisma.class.create({
              data: { userId, name: trimmedName, color: color || '#d4af37' }
            })
          : (await pool.query(
              'INSERT INTO "Class" (id, "userId", name, color, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING *',
              [userId, trimmedName, color || '#d4af37']
            )).rows[0];

        logger.info('class_created', { userId, name: trimmedName });
        return res.json({ ok: true, data: newClass });
      } catch (e) {
        if (e.code === 'P2002') {
          return res.status(409).json({ error: 'Class name already exists' });
        }
        throw e;
      }
    }

    if (req.method === 'PUT') {
      // Rename a class and update color
      const { classId, name, color } = req.body || {};
      if (!classId) return res.status(400).json({ error: 'classId required' });
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Class name is required' });
      }

      const trimmedName = name.trim();
      const updateData = { name: trimmedName };
      if (color && typeof color === 'string') {
        updateData.color = color;
      }

      try {
        if (prisma) {
          const cls = await prisma.class.findUnique({ where: { id: classId }, select: { userId: true } });
          if (!cls || cls.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

          const updatedClass = await prisma.class.update({
            where: { id: classId },
            data: updateData
          });
          logger.info('class_renamed', { userId, classId, newName: trimmedName, color });
          return res.json({ ok: true, data: updatedClass });
        } else {
          const { rows: classRows } = await pool.query('SELECT "userId" FROM "Class" WHERE id = $1', [classId]);
          if (!classRows[0] || classRows[0].userId !== userId) return res.status(403).json({ error: 'Not authorized' });

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
          return res.status(409).json({ error: 'Class name already exists' });
        }
        throw e;
      }
    }

    if (req.method === 'DELETE') {
      // Delete a class
      const { classId } = req.body || {};
      if (!classId) return res.status(400).json({ error: 'classId required' });

      if (prisma) {
        const cls = await prisma.class.findUnique({ where: { id: classId }, select: { userId: true } });
        if (!cls || cls.userId !== userId) return res.status(403).json({ error: 'Not authorized' });

        await prisma.class.delete({ where: { id: classId } });
      } else {
        const { rows } = await pool.query('SELECT "userId" FROM "Class" WHERE id = $1', [classId]);
        if (!rows[0] || rows[0].userId !== userId) return res.status(403).json({ error: 'Not authorized' });
        await pool.query('DELETE FROM "Class" WHERE id = $1', [classId]);
      }

      logger.info('class_deleted', { userId, classId });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('classes_handler_error', { message: err.message });
    return res.status(500).json({ error: 'Server error' });
  }
}
