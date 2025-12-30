const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'BetaTester\'')
  .then(result => {
    if (result.rows.length === 0) {
      console.log('❌ BetaTester table does not exist');
      process.exit(1);
    }
    console.log('✅ BetaTester table exists with columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
