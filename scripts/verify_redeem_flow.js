#!/usr/bin/env node
// Verify redeem flow without NextAuth: given a code and user email,
// perform the same transactional logic as /api/school/redeem using pg.
// Usage: node scripts/verify_redeem_flow.js <CODE> <EMAIL>

try { require('dotenv').config({ override: true }); } catch(_) {}
const { Pool } = require('pg');

function createId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).padEnd(24, '0');
}

async function main() {
  const [,, code, email] = process.argv;
  if (!code || !email) {
    console.error('Usage: node scripts/verify_redeem_flow.js <CODE> <EMAIL>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure code exists
    const codeRes = await client.query('SELECT "id", "schoolId", "redeemed" FROM "SchoolCode" WHERE "code" = $1 LIMIT 1', [code]);
    if (codeRes.rowCount === 0) {
      console.error('Code not found:', code);
      await client.query('ROLLBACK');
      process.exit(1);
    }
    const row = codeRes.rows[0];
    const codeId = row.id;
    const schoolIdValue = row.schoolid ?? row.schoolId;

    // Find or create user by email
    let userId;
    const u1 = await client.query('SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1', [email]);
    if (u1.rowCount === 0) {
      userId = createId();
      await client.query('INSERT INTO "User" ("id", "email") VALUES ($1, $2)', [userId, email]);
      console.log('Created user:', email);
    } else {
      userId = u1.rows[0].id;
    }

    // Attempt to redeem atomically
    const upd = await client.query('UPDATE "SchoolCode" SET "redeemed" = TRUE, "redeemedBy" = $1 WHERE "id" = $2 AND "redeemed" = FALSE', [userId, codeId]);
    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      console.error('Redeem failed: already_redeemed');
      process.exit(2);
    }

    // Assign user to school
    await client.query('UPDATE "User" SET "schoolId" = $1 WHERE "id" = $2', [schoolIdValue, userId]);
    const schoolRes = await client.query('SELECT "name" FROM "School" WHERE "id" = $1', [schoolIdValue]);

    await client.query('COMMIT');
    console.log('Redeem succeeded. School:', schoolRes.rows[0]?.name || schoolIdValue);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch(_) {}
    console.error('Error:', e?.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
