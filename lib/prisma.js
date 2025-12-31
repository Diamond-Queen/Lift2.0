// Ensure the Prisma client uses the binary engine in this environment. Some
// runtime builds require PRISMA_CLIENT_ENGINE_TYPE to be set before loading
// the client. Setting it here guarantees scripts that `require('./lib/prisma')`
// will use the binary engine and avoid the client-constructor adapter error.
process.env.PRISMA_CLIENT_ENGINE_TYPE = process.env.PRISMA_CLIENT_ENGINE_TYPE || 'binary';

let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  console.error('[prisma] FATAL: Cannot import @prisma/client');
  console.error('[prisma] Error:', e.message);
  console.error('[prisma] This likely means the Prisma client was not generated during build');
  console.error('[prisma] Try running: npm run build');
  PrismaClient = null;
}

try { require('dotenv').config(); } catch(_) {}

// Use a global variable to preserve the Prisma Client across module reloads in development
// (prevents exhausting database connections).
// Cache client in globalThis to avoid constructor issues across reloads (Prisma v7)
const globalForPrisma = globalThis;

let prisma;

if (!PrismaClient) {
  console.error('[prisma] PrismaClient class not available, Prisma will be unavailable');
  prisma = null;
} else {
  try {
    if (process.env.NODE_ENV === 'production') {
      prisma = new PrismaClient({
        errorFormat: 'pretty',
        log: [
          { level: 'error', emit: 'stdout' },
          { level: 'warn', emit: 'stdout' },
        ],
      });
    } else {
      if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = new PrismaClient({
          errorFormat: 'pretty',
        });
      }
      prisma = globalForPrisma.prisma;
    }
  } catch (e) {
    // In dev, Prisma v7 may throw during constructor in certain runtimes.
    // Export null and let callers use a pg fallback.
    const errorMessage = e && e.message ? e.message : String(e);
    const errorCode = e && e.code ? e.code : 'UNKNOWN';
    
    console.error('[prisma] FATAL: failed to construct PrismaClient');
    console.error('[prisma] error code:', errorCode);
    console.error('[prisma] error message:', errorMessage);
    console.error('[prisma] full error:', e);
    console.error('[prisma] DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.error('[prisma] NODE_ENV:', process.env.NODE_ENV);
    console.error('[prisma] PRISMA_CLIENT_ENGINE_TYPE:', process.env.PRISMA_CLIENT_ENGINE_TYPE);
    console.error('[prisma] PRISMA_SCHEMA_OPTIONAL_PREVIEW_FEATURES:', process.env.PRISMA_SCHEMA_OPTIONAL_PREVIEW_FEATURES);
    
    // Try to get more info about the error
    if (e.cause) {
      console.error('[prisma] cause:', e.cause);
    }
    if (e.stack) {
      console.error('[prisma] stack:', e.stack);
    }
    
    prisma = null;
  }
}

module.exports = prisma;
