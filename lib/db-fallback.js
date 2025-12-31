/**
 * Database fallback adapter using raw PostgreSQL pool
 * Used when Prisma client fails to initialize
 */

const { pool } = require('./db');

const fallback = {
  /**
   * Check if a user exists by ID
   */
  async findUserById(userId) {
    try {
      const result = await pool.query(
        `SELECT id, email, name, onboarded FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[db-fallback] findUserById error:', err.message);
      throw err;
    }
  },

  /**
   * Check if user is already a beta tester
   */
  async findBetaTesterByUserId(userId) {
    try {
      const result = await pool.query(
        `SELECT id, userId, trialType, trialEndsAt, status FROM "BetaTester" WHERE "userId" = $1 LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[db-fallback] findBetaTesterByUserId error:', err.message);
      throw err;
    }
  },

  /**
   * Create a new beta tester record
   */
  async createBetaTester(data) {
    try {
      const result = await pool.query(
        `INSERT INTO "BetaTester" ("userId", "trialType", "schoolName", "organizationName", "trialEndsAt", "status")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, "trialType", "trialEndsAt"`,
        [
          data.userId,
          data.trialType,
          data.schoolName || null,
          data.organizationName || null,
          data.trialEndsAt,
          data.status || 'active'
        ]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[db-fallback] createBetaTester error:', err.message);
      throw err;
    }
  },

  /**
   * Update user onboarded status
   */
  async updateUserOnboarded(userId) {
    try {
      const result = await pool.query(
        `UPDATE "User" SET "onboarded" = true WHERE id = $1 RETURNING id, email, onboarded`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (err) {
      console.error('[db-fallback] updateUserOnboarded error:', err.message);
      throw err;
    }
  },

  /**
   * Get user preferences
   */
  async getUserPreferences(userId) {
    try {
      const result = await pool.query(
        `SELECT preferences FROM "User" WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const row = result.rows[0];
      return row ? (row.preferences || {}) : null;
    } catch (err) {
      console.error('[db-fallback] getUserPreferences error:', err.message);
      throw err;
    }
  },

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      const result = await pool.query(
        `UPDATE "User" SET preferences = $1 WHERE id = $2 RETURNING preferences`,
        [preferences, userId]
      );
      return result.rows[0] ? (result.rows[0].preferences || {}) : null;
    } catch (err) {
      console.error('[db-fallback] updateUserPreferences error:', err.message);
      throw err;
    }
  },
};

module.exports = fallback;
