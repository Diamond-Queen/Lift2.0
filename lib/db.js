const { Pool } = require('pg');

// Note: Next.js automatically loads .env files, so we don't need to require dotenv

// Optimized connection pool configuration
// max: concurrent connections, idleTimeoutMillis: connection idle timeout, connectionTimeoutMillis: new connection timeout
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20,                          // Max concurrent connections
  idleTimeoutMillis: 30000,         // Close idle connections after 30s
  connectionTimeoutMillis: 10000,   // Fail fast on connection timeout
  allowExitOnIdle: false            // Keep pool alive for Lambda/serverless
});

// Handle pool errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Clean up pool on process exit
process.on('exit', async () => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (err) {
    console.error('Error closing pool:', err);
  }
});

// Handle graceful shutdown signals
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, async () => {
    try {
      await pool.end();
      console.log('Database pool closed on signal:', signal);
      process.exit(0);
    } catch (err) {
      console.error('Error closing pool on signal:', err);
      process.exit(1);
    }
  });
});

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT u.*, 
      json_build_object('id', s.id, 'name', s.name, 'createdAt', s."createdAt") as school
     FROM "User" u
     LEFT JOIN "School" s ON u."schoolId" = s.id
     WHERE u.email = $1
     LIMIT 1`,
    [email]
  );
  if (!rows[0]) return null;
  // Parse school JSON if present
  const user = rows[0];
  if (user.school && user.school.id === null) user.school = null;
  return user;
}

async function createUser({ name, email, password }) {
  const { rows } = await pool.query(
    'INSERT INTO "User" (id, name, email, password) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING *',
    [name || null, email, password]
  );
  return rows[0];
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  values.push(id);
  await pool.query(`UPDATE "User" SET ${fields.join(', ')} WHERE id = $${i}`,[...values]);
}

module.exports = { pool, findUserByEmail, createUser, updateUser };
