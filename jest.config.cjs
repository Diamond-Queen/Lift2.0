const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to the Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  verbose: true,
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
