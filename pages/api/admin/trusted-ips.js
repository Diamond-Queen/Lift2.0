const { addTrustedIp, removeTrustedIp, listTrustedIps } = require('../../../lib/security');
const { auditLog } = require('../../../lib/security');

module.exports = async function handler(req, res) {
  const adminSecretHeader = req.headers['x-admin-secret'] || req.body?.secret;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET || adminSecretHeader !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return res.json({ ok: true, data: { trustedIps: listTrustedIps() } });
  }

  if (req.method === 'POST') {
    const { ip } = req.body || {};
    if (!ip) return res.status(400).json({ ok: false, error: 'Missing ip' });
    addTrustedIp(ip);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { ip } = req.body || {};
    if (!ip) return res.status(400).json({ ok: false, error: 'Missing ip' });
    const removed = removeTrustedIp(ip);
    return res.json({ ok: true, removed });
  }

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
