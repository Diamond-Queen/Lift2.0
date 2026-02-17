const { unblockIp, getBlockedIps, auditLog } = require('../../../lib/security');

module.exports = async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  const header = req.headers['x-admin-secret'] || req.headers['authorization'];

  if (!adminSecret) {
    return res.status(500).json({ ok: false, error: 'ADMIN_SECRET not configured' });
  }
  if (!header || header !== adminSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    // List all blocked IPs
    try {
      const blockedIps = getBlockedIps();
      return res.json({
        ok: true,
        blockedIps,
        count: blockedIps.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to retrieve blocked IPs',
        message: error.message,
      });
    }
  }

  if (req.method === 'DELETE') {
    // Unblock an IP
    const { ip } = req.query;
    if (!ip) {
      return res.status(400).json({ ok: false, error: 'Missing ip query parameter' });
    }

    try {
      const unblocked = unblockIp(ip);
      if (unblocked) {
        auditLog('admin_unblock_ip', null, { ip, adminTriggered: true }, 'info');
        return res.json({
          ok: true,
          message: `Unblocked ${ip}`,
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(404).json({
        ok: false,
        error: 'IP not found or already cleared',
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to unblock IP',
        message: error.message,
      });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed. Use GET to list or DELETE to unblock.' });
};
