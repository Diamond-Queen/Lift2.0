const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const file = path.join(process.cwd(), 'data', 'schoolCodes.json');
if (!fs.existsSync(file)) {
  console.log('No data/schoolCodes.json found — skipping seed.');
  process.exit(0);
}

const raw = fs.readFileSync(file, 'utf8');
const list = JSON.parse(raw || '[]');

function id() {
  // small random id; not a true cuid but sufficient for seeding
  return require('crypto').randomUUID();
}

let sql = '';
for (const s of list) {
  const schoolId = id();
  const codeId = id();
  // create school if missing
  sql += `DO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM \"School\" WHERE \"name\" = ${pgEscape(
    s.name
  )}) THEN\n    INSERT INTO \"School\" (\"id\", \"name\", \"plan\", \"createdAt\") VALUES ('${schoolId}', ${pgEscape(
    s.name
  )}, ${s.plan ? `'${s.plan.replace("'","''")}'` : 'NULL'}, NOW());\n  END IF;\nEND$$;\n\n`;

  // insert code if missing
  sql += `DO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM \"SchoolCode\" WHERE \"code\" = ${pgEscape(
    s.code
  )}) THEN\n    INSERT INTO \"SchoolCode\" (\"id\", \"code\", \"schoolId\", \"redeemed\", \"redeemedBy\", \"createdAt\")\n    VALUES ('${codeId}', ${pgEscape(s.code)}, (SELECT \"id\" FROM \"School\" WHERE \"name\" = ${pgEscape(
    s.name
  )} LIMIT 1), false, NULL, NOW());\n  END IF;\nEND$$;\n\n`;
}

const tmp = path.join(process.cwd(), 'prisma', 'seed.sql');
fs.writeFileSync(tmp, sql, 'utf8');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set. Set it in .env before running this script.');
  process.exit(1);
}

try {
  console.log('Running seed SQL via psql...');
  execSync(`psql "${dbUrl}" -f "${tmp}"`, { stdio: 'inherit' });
  console.log('Seeding complete.');
} catch (e) {
  console.error('Seeding failed:', e.message || e);
  process.exit(1);
}

function pgEscape(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}
