const prisma = require('../../../lib/prisma');
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

    const userId = session.user.id;
    const userLimit = trackUserRateLimit(userId, '/api/user/preferences');
    if (!userLimit.allowed) {
      auditLog('preferences_rate_limited_user', userId, { ip });
      return res.status(429).json({ error: 'Too many requests for this user.' });
    }

    if (req.method === 'GET') {
      if (prisma) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { formatTemplate: true, preferences: true } });
        return res.json({ data: user });
      } else {
        const { rows } = await pool.query('SELECT "formatTemplate", preferences FROM "User" WHERE id = $1', [userId]);
        return res.json({ data: rows[0] || {} });
      }
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
      
      if (prisma) {
        // Merge preferences instead of overwriting to preserve subscriptionPlan
        if ('preferences' in data) {
          const existing = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
          const currentPrefs = existing?.preferences || {};
          data.preferences = { ...currentPrefs, ...data.preferences };
        }
        const updated = await prisma.user.update({ where: { id: userId }, data });
        const { password, ...safe } = updated;
        return res.json({ ok: true, data: safe });
      } else {
        const fields = [];
        const values = [];
        let i = 1;
        if ('formatTemplate' in data) {
          fields.push(`"formatTemplate" = $${i++}`);
          values.push(data.formatTemplate);
        }
        if ('preferences' in data) {
          // Merge JSONB in Postgres: preferences = COALESCE(preferences,'{}'::jsonb) || $jsonb
          fields.push(`preferences = COALESCE(preferences,'{}'::jsonb) || $${i}::jsonb`);
          values.push(JSON.stringify(data.preferences));
          i++;
        }
        values.push(userId);
        const { rows } = await pool.query(
          `UPDATE "User" SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
          values
        );
        const { password, ...safe } = rows[0];
        return res.json({ ok: true, data: safe });
      }
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
