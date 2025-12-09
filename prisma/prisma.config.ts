// Export a simple config object. Some CLI flows parse this directly.
export default {
  // Primary datasource (used by Prisma CLI)
  datasource: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },

  // Legacy plural key as a fallback
  datasources: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
};
