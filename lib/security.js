// Small helper to attach strict security headers to API responses.
function setSecureHeaders(res) {
  // MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Referrer
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Permissions (feature) policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  // Content Security Policy (basic locked down; adjust as needed)
  // Allow self for everything; images/data blobs; disable inline scripts.
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // allow inline styles from Next/Tailwind
    "img-src 'self' data: blob:",
    "font-src 'self'", 
    "connect-src 'self' https://api.openai.com", 
    "frame-ancestors 'none'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Cross-Origin Embedder & Opener Policies (may be relaxed if using third party embeds)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  // HSTS (only in production over HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

module.exports = { setSecureHeaders };
