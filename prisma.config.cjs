// CommonJS Prisma config so the Prisma CLI can locate datasource when using Prisma v7
// Export a top-level `datasource` property as required by `prisma migrate dev`.
// Load environment variables from .env so process.env.DATABASE_URL is available
// when the Prisma CLI requires this config file.
try {
  require('dotenv').config();
} catch (e) {
  // ignore if dotenv is not available; the environment may already be set.
}

module.exports = {
  // Prisma v7 expects the `provider` to live in the schema (prisma/schema.prisma).
  // The config file should provide connection URLs (url, shadowDatabaseUrl).
  datasource: {
    // Use the DATABASE_URL from the environment. Ensure your .env has DATABASE_URL set.
    url: process.env.DATABASE_URL,
    // Optional: use a shadow DB if provided (recommended for migrate in CI)
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || process.env.DATABASE_URL,
  },
  // Explicitly point to the schema file in case Prisma CLI can't autodetect.
  schema: 'prisma/schema.prisma',
};
