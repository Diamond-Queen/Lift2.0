// CommonJS fallback config for Prisma CLI to read datasource reliably.
// This mirrors the TypeScript config but avoids TS compilation issues.
module.exports = {
  datasource: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
  // keep plural fallback as well
  datasources: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
};
