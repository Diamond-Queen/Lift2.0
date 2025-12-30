// lib/cache.js - Simple in-memory cache with TTL for session data and preferences
// Avoids repeated database queries within the same request context

const cache = new Map();

/**
 * Set a cache entry with optional TTL (time-to-live)
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time-to-live in milliseconds (default: 5 minutes)
 */
function set(key, value, ttl = 5 * 60 * 1000) {
  const expiry = Date.now() + ttl;
  cache.set(key, { value, expiry });
  
  // Auto-delete after TTL
  setTimeout(() => cache.delete(key), ttl);
}

/**
 * Get a cached value if it exists and hasn't expired
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if not found/expired
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (entry.expiry < Date.now()) {
    cache.delete(key);
    return null;
  }
  
  return entry.value;
}

/**
 * Clear a specific cache entry
 * @param {string} key - Cache key
 */
function clear(key) {
  cache.delete(key);
}

/**
 * Clear all cache entries
 */
function clearAll() {
  cache.clear();
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
function getStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
}

module.exports = { get, set, clear, clearAll, getStats };
