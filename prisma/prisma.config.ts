import { defineConfig } from '@prisma/internals';

export default defineConfig({
  // Primary datasource (used by Prisma 7+)
  datasource: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL!,
    },
  },

  // Keep plural form as a fallback for any CLI expectations
  datasources: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL!,
    },
  },
});