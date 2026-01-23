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
    auditLog('jobs_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ ok: false, error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/content/jobs');
  if (!ipLimit.allowed) {
    auditLog('jobs_rate_limited_ip', null, { ip });
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
  const userLimit = trackUserRateLimit(userId, '/api/content/jobs');
  if (!userLimit.allowed) {
    auditLog('jobs_rate_limited_user', userId, { ip });
    return res.status(429).json({ ok: false, error: 'Too many requests for this user.' });
  }

  try {
    if (req.method === 'GET') {
      // List all jobs for user
      const jobs = prisma
        ? await prisma.job.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
          })
        : (await pool.query(
            'SELECT id, title, company, "createdAt", "updatedAt" FROM "Job" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
            [userId]
          )).rows;

      return res.json({ ok: true, data: jobs });
    }

    if (req.method === 'POST') {
      // Create a new job
      const { title, company } = req.body || {};
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Job title is required' });
      }

      // Check subscription plan and job limit
      try {
        const userWithSub = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptions: { where: { status: { in: ['active', 'trialing'] } } } }
        });
        
        const activeSub = userWithSub?.subscriptions?.[0];
        const plan = activeSub?.plan;
        
        // Notes Only plan cannot create jobs
        if (plan === 'notes') {
          return res.status(403).json({ 
            ok: false, 
            error: 'Career tools are not included in your Notes Only plan. Upgrade to Full Access to manage jobs.' 
          });
        }
        
        // Career Only and Notes plan have a 4-job limit; Full Access and beta are unlimited
        if (plan && plan !== 'full' && plan !== 'career') {
          const jobCount = await prisma.job.count({ where: { userId } });
          if (jobCount >= 4) {
            return res.status(403).json({ 
              ok: false, 
              error: 'You have reached the 4 job limit on your current plan. Upgrade to Full Access for unlimited jobs.' 
            });
          }
        } else if (plan === 'career') {
          const jobCount = await prisma.job.count({ where: { userId } });
          if (jobCount >= 4) {
            return res.status(403).json({ 
              ok: false, 
              error: 'You have reached the 4 job limit on your current plan. Upgrade to Full Access for unlimited jobs.' 
            });
          }
        }
      } catch (err) {
        logger.error('Failed to check job subscription limit', { error: err.message });
        // Continue - let request proceed if check fails
      }

      const trimmedTitle = title.trim();
      try {
        const newJob = prisma
          ? await prisma.job.create({
              data: { userId, title: trimmedTitle, company: company || null }
            })
          : (await pool.query(
              'INSERT INTO "Job" (id, "userId", title, company, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING *',
              [userId, trimmedTitle, company || null]
            )).rows[0];

        logger.info('job_created', { userId, title: trimmedTitle });
        return res.json({ ok: true, data: newJob });
      } catch (e) {
        if (e.code === 'P2002') {
          return res.status(409).json({ ok: false, error: 'Job title already exists' });
        }
        throw e;
      }
    }

    if (req.method === 'PUT') {
      // Update a job (title and company)
      const { jobId, title, company } = req.body || {};
      if (!jobId) return res.status(400).json({ ok: false, error: 'jobId required' });
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Job title is required' });
      }

      const trimmedTitle = title.trim();
      const updateData = { title: trimmedTitle };
      if (company && typeof company === 'string') {
        updateData.company = company;
      }

      try {
        if (prisma) {
          const job = await prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
          if (!job || job.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

          const updatedJob = await prisma.job.update({
            where: { id: jobId },
            data: updateData
          });
          logger.info('job_updated', { userId, jobId, title: trimmedTitle, company });
          return res.json({ ok: true, data: updatedJob });
        } else {
          const { rows: jobRows } = await pool.query('SELECT "userId" FROM "Job" WHERE id = $1', [jobId]);
          if (!jobRows[0] || jobRows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

          const companyClause = company ? ', company = $2' : '';
          const params = company ? [trimmedTitle, company, jobId] : [trimmedTitle, jobId];
          const updated = await pool.query(
            `UPDATE "Job" SET title = $1${companyClause}, "updatedAt" = NOW() WHERE id = $${companyClause ? '3' : '2'} RETURNING *`,
            params
          );
          logger.info('job_updated', { userId, jobId, title: trimmedTitle, company });
          return res.json({ ok: true, data: updated.rows[0] });
        }
      } catch (e) {
        if (e.code === 'P2002') {
          return res.status(409).json({ ok: false, error: 'Job title already exists' });
        }
        throw e;
      }
    }

    if (req.method === 'DELETE') {
      // Delete a job
      const { jobId } = req.body || {};
      if (!jobId) return res.status(400).json({ ok: false, error: 'jobId required' });

      if (prisma) {
        const job = await prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
        if (!job || job.userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });

        await prisma.job.delete({ where: { id: jobId } });
      } else {
        const { rows } = await pool.query('SELECT "userId" FROM "Job" WHERE id = $1', [jobId]);
        if (!rows[0] || rows[0].userId !== userId) return res.status(403).json({ ok: false, error: 'Not authorized' });
        await pool.query('DELETE FROM "Job" WHERE id = $1', [jobId]);
      }

      logger.info('job_deleted', { userId, jobId });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    logger.error('jobs_handler_error', { method: req.method, message: err.message });
    auditLog('jobs_handler_error', userId, { method: req.method, message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

module.exports = handler;
