/**
 * Input sanitization utilities to prevent XSS and injection attacks
 */

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate and sanitize email
 */
function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  // Basic email validation (RFC 5322 simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate and sanitize school/organization name
 */
function sanitizeName(name, maxLength = 200) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength).trim();
  return trimmed;
}

/**
 * Validate hex color code
 */
function validateColor(color) {
  if (typeof color !== 'string') return false;
  return /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

/**
 * Sanitize URL to prevent javascript: protocol
 */
function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (e) {
    return null;
  }
}

module.exports = {
  escapeHtml,
  sanitizeEmail,
  sanitizeName,
  validateColor,
  sanitizeUrl
};
