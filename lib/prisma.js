// Ensure the Prisma client uses the binary engine in this environment. Some
// runtime builds require PRISMA_CLIENT_ENGINE_TYPE to be set before loading
// the client. Setting it here guarantees scripts that `require('./lib/prisma')`
// will use the binary engine and avoid the client-constructor adapter error.
process.env.PRISMA_CLIENT_ENGINE_TYPE = process.env.PRISMA_CLIENT_ENGINE_TYPE || 'binary';

const { PrismaClient } = require('@prisma/client');
try { require('dotenv').config(); } catch(_) {}

// Use a global variable to preserve the Prisma Client across module reloads in development
// (prevents exhausting database connections).
// Cache client in globalThis to avoid constructor issues across reloads (Prisma v7)
const globalForPrisma = globalThis;

let prisma;
try {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
  } else {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = new PrismaClient();
    }
    prisma = globalForPrisma.prisma;
  }
} catch (e) {
  // In dev, Prisma v7 may throw during constructor in certain runtimes.
  // Export null and let callers use a pg fallback.
  const errorMessage = e && e.message ? e.message : String(e);
  const errorCode = e && e.code ? e.code : 'UNKNOWN';
  const stack = e && e.stack ? e.stack : 'no stack available';
  
  console.error('[prisma] failed to construct PrismaClient');
  console.error('[prisma] error code:', errorCode);
  console.error('[prisma] error message:', errorMessage);
  console.error('[prisma] stack:', stack);
  console.error('[prisma] DATABASE_URL set:', !!process.env.DATABASE_URL);
  console.error('[prisma] NODE_ENV:', process.env.NODE_ENV);
  console.error('[prisma] PRISMA_CLIENT_ENGINE_TYPE:', process.env.PRISMA_CLIENT_ENGINE_TYPE);
  
  prisma = null;
}

module.exports = prisma;
