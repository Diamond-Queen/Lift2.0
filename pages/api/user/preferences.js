const prisma = require('../../../lib/prisma');
const dbFallback = require('../../../lib/db-fallback');
const { getServerSession } = require('next-auth/next');
const { pool } = require('../../../lib/db');
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

  // Check if Prisma client is available, use fallback if not
  const db = prisma || dbFallback;
  if (!db) {
    logger.error('database_unavailable', { error: 'Neither Prisma nor fallback database available' });
    return res.status(500).json({ ok: false, error: 'Database connection error. Please try again.' });
  }

  const ip = extractClientIp(req);
  const validation = validateRequest(req);
  if (!validation.valid) {
    auditLog('preferences_request_blocked', null, { ip, reason: validation.reason }, 'warning');
    return res.status(400).json({ error: 'Request rejected', reason: validation.reason });
  }
  const ipLimit = trackIpRateLimit(ip, '/api/user/preferences');
  if (!ipLimit.allowed) {
    auditLog('preferences_rate_limited_ip', null, { ip });
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  let userId = null;
  
  try {
    let authOptions;
    try {
      const imported = require('../../../lib/authOptions');
      authOptions = imported.authOptions;
    } catch (importErr) {
      logger.error('authOptions_import_error', { message: importErr.message });
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }
    
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    userId = session.user.id;
    const userLimit = trackUserRateLimit(userId, '/api/user/preferences');
    if (!userLimit.allowed) {
      auditLog('preferences_rate_limited_user', userId, { ip });
      return res.status(429).json({ error: 'Too many requests for this user.' });
    }

    if (req.method === 'GET') {
      const user = prisma
        ? await prisma.user.findUnique({ where: { id: userId }, select: { formatTemplate: true, preferences: true } })
        : (await pool.query('SELECT "formatTemplate", preferences FROM "User" WHERE id = $1', [userId])).rows[0];
      return res.json({ data: user });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const { formatTemplate, preferences } = req.body || {};
      const data = {};
      if (typeof formatTemplate === 'string') {
        if (formatTemplate.length > 5000) return res.status(413).json({ ok: false, error: 'Template too large (max 5000 chars)' });
        data.formatTemplate = formatTemplate;
      }
      if (typeof preferences !== 'undefined') {
        // Basic size guard: reject overly large preference payloads
        try {
          const prefString = JSON.stringify(preferences);
            if (prefString.length > 10000) return res.status(413).json({ ok: false, error: 'Preferences too large (max ~10KB)' });
            data.preferences = preferences;
        } catch (e) {
          return res.status(400).json({ ok: false, error: 'Invalid preferences JSON' });
        }
      }
      if (Object.keys(data).length === 0) return res.status(400).json({ ok: false, error: 'No valid fields provided' });
      
      // Merge preferences instead of overwriting to preserve subscriptionPlan
      if ('preferences' in data) {
        const existing = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
        const currentPrefs = existing?.preferences || {};
        data.preferences = { ...currentPrefs, ...data.preferences };
      }
      const updated = await prisma.user.update({ where: { id: userId }, data });
      const { password, ...safe } = updated;
      return res.json({ ok: true, data: safe });
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    logger.error('preferences_error', { message: err.message });
    auditLog('preferences_error', userId, { message: err.message }, 'error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = handler;
