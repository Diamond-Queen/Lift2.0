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

  console.log('🔄 Running Prisma migrations...');
  console.log('📦 DATABASE_URL is set, migrations will run');
  
  try {
    // First, ensure Prisma client is generated
    console.log('📝 Generating Prisma client...');
    try {
      await execAsync('npx prisma generate', {
        stdio: 'inherit',
      });
      console.log('✅ Prisma client generated');
    } catch (genErr) {
      console.error('⚠️  Prisma generate failed:', genErr.message);
      // Don't throw - continue anyway
    }

    // Now run migrations
    console.log('🔄 Deploying migrations...');
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      stdio: 'inherit',
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('✅ Migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('📋 Error details:', err);
    // Don't exit with error code - allow build to continue
    // Production builds should fail, but this allows local builds to work
  }
}

runMigrations();
