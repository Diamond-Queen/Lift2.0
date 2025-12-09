function extractClientIp(req){
  try {
    const raw = req.headers['x-forwarded-for'];
    if (typeof raw === 'string' && raw.length) {
      const first = raw.split(',')[0].trim();
      if (first) return first;
    }
    return req.socket?.remoteAddress || 'unknown';
  } catch { return 'unknown'; }
}
module.exports = { extractClientIp };
