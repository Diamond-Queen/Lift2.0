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
    auditLog('content_items_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/content/items');
  if (!ipLimit.allowed) {
    auditLog('content_items_rate_limited_ip', null, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });
  }

  const { authOptions } = await import('../auth/[...nextauth]');
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.email) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const user = prisma
    ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : await findUserByEmail(session.user.email);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  const userId = user.id;
  const userLimit = trackUserRateLimit(userId, '/api/content/items');
  if (!userLimit.allowed) {
    auditLog('content_items_rate_limited_user', userId, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  try {
    if (req.method === 'GET') {
      // List all content items for user (optionally filtered by type or classId)
      const { type, classId } = req.query;
      const where = { userId };
      if (type) where.type = type;
      if (classId) where.classId = classId;

      const items = prisma
        ? await prisma.contentItem.findMany({
            where,
            orderBy: { createdAt: 'desc' }
          })
        : (await pool.query(
            `SELECT id, title, type, "classId", "createdAt", "updatedAt" 
             FROM "ContentItem" 
             WHERE "userId" = $1 ${type ? 'AND type = $2' : ''} ${classId ? `AND "classId" = $${type ? 3 : 2}` : ''}
             ORDER BY "createdAt" DESC`,
            [userId, ...(type ? [type] : []), ...(classId ? [classId] : [])]
          )).rows;

      return res.json({ ok: true, data: items });
    }

    if (req.method === 'POST') {
      // Create a new content item
      const { type, title, originalInput, classId, summaries, metadata } = req.body || {};
      if (!type || !['note', 'resume', 'cover_letter'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'Invalid content type' });
      }
      if (!title || typeof title !== 'string') return res.status(400).json({ ok: false, error: 'Title required' });
      if (!originalInput || typeof originalInput !== 'string') {
        return res.status(400).json({ ok: false, error: 'Original input required' });
      }

      try {
        const newItem = prisma
          ? await prisma.contentItem.create({
              data: {
                userId,
                type,
                title: title.trim(),
                originalInput,
                classId: classId || null,
                summaries: summaries || null,
                metadata: metadata || null
              }
            })
          : (await pool.query(
              `INSERT INTO "ContentItem" (id, "userId", type, title, "originalInput", "classId", summaries, metadata, "createdAt", "updatedAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
               RETURNING *`,
              [userId, type, title.trim(), originalInput, classId || null, JSON.stringify(summaries || null), JSON.stringify(metadata || null)]
            )).rows[0];

        logger.info('content_item_created', { userId, type, title: title.trim(), classId: classId || null });
        return res.json({ ok: true, data: newItem });
      } catch (e) {
        logger.error('content_create_error', { message: e.message });
        return res.status(500).json({ ok: false, error: 'Failed to create content item' });
      }
    }

    if (req.method === 'PUT') {
      // Update a content item
      const { itemId, classId, summaries, metadata } = req.body || {};
      if (!itemId) return res.status(400).json({ ok: false, error: 'itemId required' });

      if (prisma) {
        const item = await prisma.contentItem.findUnique({ where: { id: itemId }, select: { userId: true } });
        if (!item || item.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

        const updated = await prisma.contentItem.update({
          where: { id: itemId },
          data: {
            ...(classId !== undefined ? { classId: classId || null } : {}),
            ...(summaries !== undefined ? { summaries } : {}),
            ...(metadata !== undefined ? { metadata } : {})
          }
        });
        return res.json({ ok: true, data: updated });
      } else {
        const { rows } = await pool.query('SELECT "userId" FROM "ContentItem" WHERE id = $1', [itemId]);
        if (!rows[0] || rows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

        const updates = [];
        const values = [];
        let idx = 1;
        if (classId !== undefined) {
          updates.push(`"classId" = $${idx++}`);
          values.push(classId || null);
        }
        if (summaries !== undefined) {
          updates.push(`summaries = $${idx++}`);
          values.push(JSON.stringify(summaries));
        }
        if (metadata !== undefined) {
          updates.push(`metadata = $${idx++}`);
          values.push(JSON.stringify(metadata));
        }
        if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No fields to update' });

        values.push(itemId);
        const { rows: updated } = await pool.query(
          `UPDATE "ContentItem" SET ${updates.join(', ')}, "updatedAt" = NOW() WHERE id = $${idx} RETURNING *`,
          values
        );
        return res.json({ ok: true, data: updated[0] });
      }
    }

    if (req.method === 'DELETE') {
      // Delete a content item
      const { itemId } = req.body || {};
      if (!itemId) return res.status(400).json({ ok: false, error: 'itemId required' });

      if (prisma) {
        const item = await prisma.contentItem.findUnique({ where: { id: itemId }, select: { userId: true } });
        if (!item || item.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });
        await prisma.contentItem.delete({ where: { id: itemId } });
      } else {
        const { rows } = await pool.query('SELECT "userId" FROM "ContentItem" WHERE id = $1', [itemId]);
        if (!rows[0] || rows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });
        await pool.query('DELETE FROM "ContentItem" WHERE id = $1', [itemId]);
      }

      logger.info('content_item_deleted', { userId, itemId });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    logger.error('content_handler_error', { message: err.message });
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
