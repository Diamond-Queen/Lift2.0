/*
Sync school codes from data/schoolCodes.json into the database.
- Finds or creates School rows by name
- Upserts SchoolCode entries (code, plan)
- Accepts either `schoolName` or `name` in the JSON items
Usage:
  node scripts/sync_school_codes.js [pathToJson]
Defaults:
  pathToJson = ./data/schoolCodes.json
Env:
  DATABASE_URL must be set
*/

const fs = require('fs');
const path = require('path');
// Load environment variables from .env so DATABASE_URL is available
try { require('dotenv').config({ override: true }); } catch (_) {}
const { Pool } = require('pg');

function createId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).padEnd(24, '0');
}

async function main() {
  const argPath = process.argv[2] || path.join(process.cwd(), 'data', 'schoolCodes.json');
  const resolved = path.resolve(argPath);
  if (!fs.existsSync(resolved)) {
    console.error(`[sync_school_codes] File not found: ${resolved}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error('[sync_school_codes] Invalid JSON:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(items)) {
    console.error('[sync_school_codes] Expected an array of codes objects');
    process.exit(1);
  }

  console.log(`[sync_school_codes] Processing ${items.length} items from ${resolved}`);

  if (!process.env.DATABASE_URL) {
    console.error('[sync_school_codes] DATABASE_URL is not set. Please export a valid Postgres URL.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let created = 0, updated = 0, skipped = 0;

  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.error('[sync_school_codes] Failed to connect. Check DATABASE_URL. ', e.message || e);
    process.exit(1);
  }
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const { code, plan } = item;
      const schoolName = item.schoolName || item.name;
      if (!schoolName || !code) { skipped++; continue; }

      // Find or create school by name
      let schoolId;
      const sres = await client.query('SELECT "id" FROM "School" WHERE "name" = $1 LIMIT 1', [schoolName]);
      if (sres.rowCount === 0) {
        schoolId = createId();
        await client.query('INSERT INTO "School" ("id", "name", "plan") VALUES ($1, $2, $3)', [schoolId, schoolName, plan ?? null]);
      } else {
        schoolId = sres.rows[0].id;
        if (typeof plan !== 'undefined') {
          await client.query('UPDATE "School" SET "plan" = $1 WHERE "id" = $2', [plan, schoolId]);
        }
      }

      // Upsert school code by unique code
      const codeId = createId();
      await client.query(
        'INSERT INTO "SchoolCode" ("id", "code", "schoolId") VALUES ($1, $2, $3) ON CONFLICT ("code") DO UPDATE SET "schoolId" = EXCLUDED."schoolId"',
        [codeId, code, schoolId]
      );
      if (sres.rowCount === 0) {
        created++;
      } else {
        updated++;
      }
    }
    await client.query('COMMIT');
    console.log(`[sync_school_codes] Done. created=${created} updated=${updated} skipped=${skipped}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[sync_school_codes] Error:', e.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
