#!/usr/bin/env node
/**
 * Conditional migration runner
 * Only runs migrations if DATABASE_URL is set
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set, skipping migrations');
    return;
  }

  try {
    console.log('🔄 Running Prisma migrations...');
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      stdio: 'inherit',
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('✅ Migrations completed');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    // Don't exit with error code - allow build to continue
    // Production builds should fail, but this allows local builds to work
  }
}

runMigrations();
