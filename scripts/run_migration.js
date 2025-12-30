const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

const migrationSQL = `
-- CreateTable
CREATE TABLE "BetaTester" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trialType" TEXT NOT NULL,
    "schoolName" TEXT,
    "organizationName" TEXT,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "convertedToSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaTester_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BetaTester_userId_key" ON "BetaTester"("userId");

-- AddForeignKey
ALTER TABLE "BetaTester" ADD CONSTRAINT "BetaTester_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

pool.query(migrationSQL)
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
