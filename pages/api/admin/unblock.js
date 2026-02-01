const { unblockIp } = require('../../../lib/security');

module.exports = async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  const header = req.headers['x-admin-secret'] || req.headers['authorization'];

  if (!adminSecret) return res.status(500).json({ ok: false, error: 'ADMIN_SECRET not configured' });
  if (!header || header !== adminSecret) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { ip } = req.body || {};
  if (!ip) return res.status(400).json({ ok: false, error: 'Missing ip in request body' });

  const unblocked = unblockIp(ip);
  if (unblocked) return res.json({ ok: true, message: `Unblocked ${ip}` });
  return res.status(404).json({ ok: false, error: 'IP not found or already cleared' });
};
