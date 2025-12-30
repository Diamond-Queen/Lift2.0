const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function checkMigrations() {
  try {
    // Check if migrations table exists
    const migrationsTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      );
    `);
    
    console.log('Migrations table exists:', migrationsTable.rows[0].exists);
    
    if (migrationsTable.rows[0].exists) {
      // List all applied migrations
      const migrations = await pool.query(`
        SELECT id, checksum, finished_at FROM "_prisma_migrations" 
        ORDER BY finished_at DESC LIMIT 10;
      `);
      
      console.log('\nLast 10 applied migrations:');
      migrations.rows.forEach(m => {
        console.log(`  - ${m.id} (${m.finished_at ? 'applied' : 'pending'})`);
      });
    }
    
    // Check if BetaTester table exists
    const betaTesterTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'BetaTester'
      );
    `);
    
    console.log('\nBetaTester table exists:', betaTesterTable.rows[0].exists);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkMigrations();
