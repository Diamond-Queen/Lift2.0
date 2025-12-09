const { Pool } = require('pg');
try { require('dotenv').config(); } catch(_) {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
