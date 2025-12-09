const { execSync } = require('child_process');
const crypto = require('crypto');
const argon2 = require('argon2');
require('dotenv').config();

async function main() {
  const email = 'admin@lift.local';
  const name = 'Admin';
  const password = process.env.ADMIN_PASSWORD || 'r@c!234';
  const hash = await argon2.hash(password);
  const id = crypto.randomUUID();

  const sql = `INSERT INTO \"User\" (id, name, email, password, role, \"createdAt\") VALUES ('${id}', '${name.replace(/'/g, "''")}', '${email}', '${hash.replace(/'/g, "''")}', 'admin', NOW()) ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL missing in environment');
    process.exit(1);
  }

  const tmp = require('path').join(process.cwd(), 'prisma', 'admin_insert.sql');
  require('fs').writeFileSync(tmp, sql, 'utf8');
  try {
    execSync(`psql "${dbUrl}" -f "${tmp}"`, { stdio: 'inherit' });
    console.log('Admin user created/updated:', email, 'password:', password);
  } catch (e) {
    console.error('Failed to create admin user', e.message || e);
    process.exit(1);
  } finally {
    try { require('fs').unlinkSync(tmp); } catch (e) {}
  }
}

main();
