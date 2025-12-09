// Ensure the Prisma client uses the binary engine in this environment. Some
// runtime builds require PRISMA_CLIENT_ENGINE_TYPE to be set before loading
// the client. Setting it here guarantees scripts that `require('./lib/prisma')`
// will use the binary engine and avoid the client-constructor adapter error.
process.env.PRISMA_CLIENT_ENGINE_TYPE = process.env.PRISMA_CLIENT_ENGINE_TYPE || 'binary';

const { PrismaClient } = require('@prisma/client');
try { require('dotenv').config(); } catch(_) {}

// Use a global variable to preserve the Prisma Client across module reloads in development
// (prevents exhausting database connections).
let prisma;
try {
  if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
  } else {
    if (!global.__prisma) {
      global.__prisma = new PrismaClient();
    }
    prisma = global.__prisma;
  }
} catch (e) {
  // In dev, Prisma v7 may throw during constructor in certain runtimes.
  // Export null and let callers use a pg fallback.
  console.error('[prisma] failed to construct PrismaClient, falling back:', e && e.message ? e.message : e);
  prisma = null;
}

module.exports = prisma;
