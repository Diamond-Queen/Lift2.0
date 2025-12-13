/**
 * Lockdown API endpoint
 * Returns 503 Service Unavailable when LOCKDOWN=true
 */

export default function handler(req, res) {
  res.status(503).json({
    ok: false,
    error: 'Service temporarily locked down',
    x_lockdown: '1'
  });
}
