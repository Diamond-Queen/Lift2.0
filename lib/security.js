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
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://www.soundhelix.com",
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

/**
 * FIREWALL & RATE LIMITING SYSTEM
 * Prevents illegal activity, abuse, and malicious requests
 */

// IP-based rate limiter
const ipLimiters = new Map();
const userLimiters = new Map();
const failedAttempts = new Map();
const blockedIps = new Map();
// Suspicion counters for transient detections
const suspiciousCounts = new Map();

// Paths that should never trigger blocking or rate-limit blocks (comma-separated env)
const NON_BLOCK_PATHS = (process.env.NON_BLOCK_PATHS || '/api/notes,/api/career,/api/user,/api/user/preferences').split(',').map(s => s.trim()).filter(Boolean);

// Paths that should be softly throttled (high volume endpoints like generation APIs)
// NOTE: intentionally using a fixed list (no environment variable) to avoid accidental misconfiguration.
const SOFT_THROTTLE_PATHS = ['/api/generate', '/api/ai', '/api/generations', '/api/beta'];

// Runtime-managed trusted IPs (in-memory). Use the admin endpoint to add/remove/list.
const trustedIpsSet = new Set();

function isTrustedIp(ip) {
  if (!ip) return false;
  const n = normalizeIp(ip);
  return trustedIpsSet.has(n);
}

function addTrustedIp(ip) {
  if (!ip) return false;
  const n = normalizeIp(ip);
  trustedIpsSet.add(n);
  auditLog('trusted_ip_added', null, { ip: n }, 'info');
  return true;
}

function removeTrustedIp(ip) {
  if (!ip) return false;
  const n = normalizeIp(ip);
  const existed = trustedIpsSet.delete(n);
  if (existed) auditLog('trusted_ip_removed', null, { ip: n }, 'info');
  return existed;
}

function listTrustedIps() {
  return Array.from(trustedIpsSet.values());
}

function normalizeIp(ip) {
  if (!ip) return ip;
  // strip IPv6 mapped IPv4 prefix
  return ip.replace(/^::ffff:/, '');
}

function isPathNonBlocking(endpoint) {
  if (!endpoint) return false;
  return NON_BLOCK_PATHS.some(p => p && endpoint.startsWith(p));
}

function blockIp(ip, reason = 'blocked', durationMs = 60 * 60 * 1000) {
  const n = normalizeIp(ip);
  const until = Date.now() + durationMs;
  blockedIps.set(n, { until, reason });
  auditLog('ip_blocked', null, { ip, reason, until }, 'warning');
}

function unblockIp(ip) {
  const n = normalizeIp(ip);
  if (blockedIps.has(n)) {
    blockedIps.delete(n);
    auditLog('ip_unblocked', null, { ip: n }, 'info');
    return true;
  }
  return false;
}

function incrementSuspicion(ip, reason) {
  const key = `${ip}:${reason}`;
  const count = (suspiciousCounts.get(key) || 0) + 1;
  suspiciousCounts.set(key, count);
  // expire suspicion after 30 minutes
  setTimeout(() => suspiciousCounts.delete(key), 30 * 60 * 1000);
  return count;
}

function isIpBlocked(ip) {
  const n = normalizeIp(ip);
  const entry = blockedIps.get(n);
  if (!entry) return null;
  if (Date.now() > entry.until) {
    blockedIps.delete(n);
    return null;
  }
  return entry;
}

/**
 * Track IP-based rate limits
 */
function trackIpRateLimit(ip, endpoint = 'global') {
  const n = normalizeIp(ip);
  // Trusted IPs bypass all blocking/throttling
  if (isTrustedIp(n)) return { allowed: true, count: 0, limit: Infinity, trusted: true };
  const blocked = isIpBlocked(n);
  if (blocked) {
    return { allowed: false, count: 0, limit: 0, reason: 'ip_blocked', blockUntil: blocked.until };
  }
  // Exempt configured non-blocking endpoints from IP rate-limit enforcement
  if (isPathNonBlocking(endpoint)) {
    return { allowed: true, count: 0, limit: Infinity };
  }
  // If endpoint is in soft-throttle list, treat it with higher limits and non-blocking cooldowns
  const isSoft = SOFT_THROTTLE_PATHS.some(p => p && endpoint.startsWith(p));
  const key = `${n}:${endpoint}`;
  
  if (!ipLimiters.has(key)) {
    ipLimiters.set(key, {
      count: 0,
      resetTime: Date.now() + 60000, // 1 minute window
      blocked: false,
      blockEndTime: null,
      cooldownUntil: null
    });
  }
  
  const limiter = ipLimiters.get(key);
  
  // Check if still blocked from previous violation
  if (limiter.blocked && limiter.blockEndTime && Date.now() < limiter.blockEndTime) {
    return { allowed: false, count: limiter.count, limit: 0, reason: 'temporarily_blocked' };
  }
  if (limiter.cooldownUntil && Date.now() < limiter.cooldownUntil) {
    // Soft endpoints return a throttle hint instead of hard block
    return { allowed: false, count: limiter.count, limit: 0, reason: 'throttled', retryAfter: Math.ceil((limiter.cooldownUntil - Date.now()) / 1000) };
  }
  
  // Reset if time window expired
  if (Date.now() > limiter.resetTime) {
    limiter.count = 0;
    limiter.resetTime = Date.now() + 60000;
    limiter.blocked = false;
    limiter.blockEndTime = null;
  }
  
  limiter.count++;
  
  // Define rate limits by endpoint
  const limits = {
    'global': 100,
    '/api/auth/[...nextauth]': 5,
    '/api/auth/register': 5,
    '/api/auth/reset-password': 5,
    '/api/content/classes': 50,
    '/api/content/items': 50,
    '/api/career': 30,
    '/api/notes': 30,
    '/api/subscription': 10,
    'default': 30
  };
  
  // Determine effective limit (increase for soft endpoints)
  const baseLimit = limits[endpoint] || limits['default'];
  const effectiveLimit = isSoft ? Math.max(baseLimit * 5, 200) : baseLimit;

  if (limiter.count > effectiveLimit) {
    if (isSoft) {
      // For soft endpoints, impose a short cooldown instead of a block
      limiter.cooldownUntil = Date.now() + 30 * 1000; // 30s cooldown
      console.warn(`[SECURITY-FIREWALL] Soft throttle for IP ${n} on ${endpoint} — cooldown 30s`);
      auditLog('soft_throttle', null, { ip: n, endpoint, count: limiter.count, limit: effectiveLimit }, 'warning');
      return { allowed: false, count: limiter.count, limit: effectiveLimit, reason: 'throttled', retryAfter: 30 };
    }
    limiter.blocked = true;
    limiter.blockEndTime = Date.now() + 300000; // Block for 5 minutes
    console.error(`[SECURITY-FIREWALL] Rate limit exceeded for IP ${n} on ${endpoint}`);
    auditLog('rate_limit_exceeded', null, { ip: n, endpoint, count: limiter.count, limit: baseLimit }, 'warning');
    return { allowed: false, count: limiter.count, limit: baseLimit, reason: 'rate_limit_exceeded' };
  }
  
  const returnLimit = effectiveLimit;
  return { allowed: true, count: limiter.count, limit: returnLimit };
}

/**
 * Track user-based rate limits (authenticated)
 */
function trackUserRateLimit(userId, endpoint = 'global') {
  // Exempt configured non-blocking endpoints from user rate-limit enforcement
  if (isPathNonBlocking(endpoint)) {
    return { allowed: true, count: 0, limit: Infinity };
  }
  const key = `${userId}:${endpoint}`;
  
  if (!userLimiters.has(key)) {
    userLimiters.set(key, {
      count: 0,
      resetTime: Date.now() + 60000,
      blocked: false
    });
  }
  
  const limiter = userLimiters.get(key);
  
  if (Date.now() > limiter.resetTime) {
    limiter.count = 0;
    limiter.resetTime = Date.now() + 60000;
    limiter.blocked = false;
  }
  
  limiter.count++;
  
  const limits = {
    'global': 200,
    '/api/content': 100,
    '/api/career': 50,
    '/api/notes': 50,
    '/api/subscription': 20,
    'default': 100
  };
  
  const limit = limits[endpoint] || limits['default'];
  
  if (limiter.count > limit) {
    limiter.blocked = true;
    console.error(`[SECURITY-FIREWALL] User rate limit exceeded for user ${userId} on ${endpoint}`);
    return { allowed: false, count: limiter.count, limit: limit };
  }
  
  return { allowed: true, count: limiter.count, limit: limit };
}

/**
 * Track failed login attempts and enforce lockout
 */
function trackFailedLogin(email, ip) {
  const key = `login_attempt:${email}`;
  
  if (!failedAttempts.has(key)) {
    failedAttempts.set(key, {
      count: 0,
      firstAttempt: Date.now(),
      ips: [],
      locked: false,
      lockUntil: null
    });
  }
  
  const attempt = failedAttempts.get(key);
  
  // Check if currently locked out
  if (attempt.locked && attempt.lockUntil && Date.now() < attempt.lockUntil) {
    console.warn(`[SECURITY-FIREWALL] Account locked for ${email} - ${Math.round((attempt.lockUntil - Date.now()) / 1000)}s remaining`);
    return { allowed: false, reason: 'account_locked', lockUntil: attempt.lockUntil };
  }
  
  // Reset lockout if time expired
  if (attempt.lockUntil && Date.now() > attempt.lockUntil) {
    attempt.locked = false;
    attempt.lockUntil = null;
    attempt.count = 0;
    attempt.ips = [];
  }
  
  // Reset after 30 minutes of inactivity
  if (Date.now() - attempt.firstAttempt > 30 * 60 * 1000) {
    failedAttempts.set(key, {
      count: 1,
      firstAttempt: Date.now(),
      ips: [ip],
      locked: false,
      lockUntil: null
    });
    return { allowed: true };
  }
  
  attempt.count++;
  if (!attempt.ips.includes(ip)) attempt.ips.push(ip);
  
  // Lock account after 5 failed attempts
  if (attempt.count >= 5) {
    attempt.locked = true;
    attempt.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minute lockout
    console.error(`[SECURITY-FIREWALL] Account lockout triggered for ${email} after ${attempt.count} failed attempts from IPs: ${attempt.ips.join(', ')}`);
    return { allowed: false, reason: 'account_locked', lockUntil: attempt.lockUntil };
  }
  
  return { allowed: true, attempts: attempt.count, remaining: 5 - attempt.count };
}

/**
 * Reset failed login attempts on successful login
 */
function resetFailedLogin(email) {
  const key = `login_attempt:${email}`;
  failedAttempts.delete(key);
}

/**
 * Validate request for SQL injection, XSS, and other attacks
 */
function validateRequest(req) {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  const requestPath = (req.url || req.originalUrl || req.headers['x-original-url'] || '').toString();
  const isNonBlockingPath = NON_BLOCK_PATHS.some(p => p && requestPath.startsWith(p));
  const nIp = normalizeIp(clientIp);
  // Trusted IPs bypass validation entirely
  if (isTrustedIp(nIp)) return { valid: true, trusted: true };

  // If the path is configured as non-blocking (generation/account endpoints),
  // skip aggressive checks entirely to avoid false positives blocking legitimate traffic.
  if (isNonBlockingPath) {
    return { valid: true };
  }

  // Check global lockdown
  if (process.env.LOCKDOWN === 'true') {
    auditLog('service_locked_down', null, {}, 'warning');
    return { valid: false, reason: 'service_locked_down', status: 503 };
  }
  const blocked = isIpBlocked(clientIp);
  if (blocked) {
    return { valid: false, reason: 'ip_blocked', blockUntil: blocked.until };
  }
  
  // Check for malicious user agents
  const userAgent = req.headers['user-agent'] || '';
  const maliciousAgents = [
    /sqlmap/i, /nikto/i, /acunetix/i, /nmap/i, /masscan/i,
    /nessus/i, /metasploit/i, /burp/i, /zap/i
  ];
  
  if (maliciousAgents.some(pattern => pattern.test(userAgent))) {
    console.error(`[SECURITY-FIREWALL] Malicious user agent detected from ${clientIp}: ${userAgent}`);
    auditLog('malicious_user_agent', null, { ip: clientIp, userAgent }, 'warning');
    if (!isNonBlockingPath) {
      blockIp(nIp, 'malicious_user_agent');
      return { valid: false, reason: 'malicious_user_agent' };
    }
    return { valid: false, reason: 'suspicious_input' };
  }
  
  // Check for SQL injection patterns
  const bodyString = JSON.stringify(req.body || {}) + JSON.stringify(req.query || {});
  const sqlInjectionPatterns = [
    /('.*?'.*?(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|EXEC|SCRIPT))/gi,
    /(-{2}|\/\*|\*\/)/,
    /(;\s*(DROP|DELETE|UPDATE|INSERT|EXEC))/gi,
    /(\bor\b\s*'?1'?\s*=\s*'?1'?)/gi,
    /(SLEEP|BENCHMARK|WAITFOR)\s*\(/gi
  ];
  
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(bodyString)) {
      console.error(`[SECURITY-FIREWALL] SQL injection pattern detected from ${clientIp}`);
      auditLog('suspicious_sql_pattern', null, { ip: clientIp, pattern: pattern.toString() }, 'warning');
      if (!isNonBlockingPath) {
        const count = incrementSuspicion(nIp, 'sql_injection_detected');
        auditLog('suspicious_sql_pattern', null, { ip: nIp, pattern: pattern.toString(), count }, 'warning');
        if (count >= 3) {
          blockIp(nIp, 'sql_injection_detected');
          return { valid: false, reason: 'sql_injection_detected' };
        }
      }
      return { valid: false, reason: 'suspicious_input' };
    }
  }
  
  // Check for XSS patterns
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<object[^>]*>/gi
  ];
  
  for (const pattern of xssPatterns) {
    if (pattern.test(bodyString)) {
      console.error(`[SECURITY-FIREWALL] XSS pattern detected from ${clientIp}`);
      auditLog('suspicious_xss_pattern', null, { ip: clientIp, pattern: pattern.toString() }, 'warning');
      if (!isNonBlockingPath) {
        const count = incrementSuspicion(nIp, 'xss_detected');
        auditLog('suspicious_xss_pattern', null, { ip: nIp, pattern: pattern.toString(), count }, 'warning');
        if (count >= 3) {
          blockIp(nIp, 'xss_detected');
          return { valid: false, reason: 'xss_detected' };
        }
      }
      return { valid: false, reason: 'suspicious_input' };
    }
  }
  
  // Check request body size
  const maxBodySize = 10 * 1024 * 1024; // 10MB
  const bodySize = Buffer.byteLength(JSON.stringify(req.body || {}));
  if (bodySize > maxBodySize) {
    console.error(`[SECURITY-FIREWALL] Oversized request from ${nIp}: ${bodySize} bytes`);
    auditLog('oversized_request', null, { ip: nIp, bodySize }, 'warning');
    return { valid: false, reason: 'request_too_large' };
  }
  
  return { valid: true };
}

/**
 * Audit log for security events
 */
function auditLog(action, userId, details = {}, severity = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    action,
    userId: userId || 'anonymous',
    details,
    severity
  };
  
  if (severity === 'critical' || severity === 'error') {
    console.error(`[AUDIT-${severity.toUpperCase()}] ${action}`, logEntry);
  } else if (severity === 'warning') {
    console.warn(`[AUDIT-WARNING] ${action}`, logEntry);
  } else {
    console.log(`[AUDIT] ${action}`, logEntry);
  }

  // Optional: push critical/warning events to an external webhook for alerting.
  // Non-blocking: fire-and-forget to avoid slowing requests.
  deliverSecurityAlert(logEntry).catch(() => {});
}

// Best-effort alert delivery. Set SECURITY_ALERT_WEBHOOK to a POST endpoint that accepts JSON.
async function deliverSecurityAlert(logEntry) {
  const webhook = process.env.SECURITY_ALERT_WEBHOOK;
  if (!webhook) return;
  try {
    // Format as Slack-friendly message blocks
    const severityEmoji = {
      'critical': '🚨',
      'error': '❌',
      'warning': '⚠️',
      'info': 'ℹ️'
    }[logEntry.severity] || '📋';

    const message = {
      text: `${severityEmoji} Lift Security Alert - ${logEntry.action}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} Lift Security Alert`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Action:*\n${logEntry.action}`
            },
            {
              type: 'mrkdwn',
              text: `*Severity:*\n${logEntry.severity}`
            },
            {
              type: 'mrkdwn',
              text: `*Timestamp:*\n${logEntry.timestamp}`
            },
            {
              type: 'mrkdwn',
              text: `*User:*\n${logEntry.userId || 'anonymous'}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Details:*\n\`\`\`${JSON.stringify(logEntry.details, null, 2)}\`\`\``
          }
        }
      ]
    };

    // Best-effort delivery with retries and timeout
    const maxAttempts = 3;
    const timeoutMs = 5000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        const res = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
          signal: controller ? controller.signal : undefined
        });
        if (timeout) clearTimeout(timeout);
        if (!res.ok) {
          const bodyText = await res.text().catch(() => '<no-body>');
          console.error('[AUDIT-WEBHOOK-ERROR] Non-2xx response', { webhook, status: res.status, body: bodyText, attempt });
          // Retry on server errors (5xx); otherwise break
          if (res.status >= 500 && attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
        }
        // success or non-retriable status; stop retrying
        break;
      } catch (err) {
        const isAbort = err && err.name === 'AbortError';
        console.error('[AUDIT-WEBHOOK-ERROR] fetch attempt failed', { webhook, attempt, message: err.message, isAbort });
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
        else throw err;
      }
    }
  } catch (err) {
    console.error('[AUDIT-WEBHOOK-ERROR]', err.message);
  }
}

module.exports = { 
  setSecureHeaders,
  trackIpRateLimit,
  trackUserRateLimit,
  trackFailedLogin,
  resetFailedLogin,
  validateRequest,
  auditLog,
  blockIp,
  unblockIp,
  isIpBlocked
  ,
  // trusted IP management
  isTrustedIp,
  addTrustedIp,
  removeTrustedIp,
  listTrustedIps
};
