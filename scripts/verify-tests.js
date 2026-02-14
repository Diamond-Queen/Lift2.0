#!/usr/bin/env node

/**
 * Testing Environment Verification Script
 * Run this to verify all testing components are in place
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// Files/directories that should exist
const requiredStructure = [
  'tests/unit/lib/proxy-utils.test.ts',
  'tests/integration/proxy-utils.integration.test.ts',
  'tests/utils/mockNextRequest.ts',
  'tests/fixtures/mockData.ts',
  'tests/setup.ts',
  'tests/README.md',
  'jest.config.cjs',
  '.github/workflows/test.yml',
  'scripts/run-tests.sh',
  'scripts/run-tests.bat',
  'TESTING_SETUP.md',
  'TESTING_GUIDE.md',
  'TESTING_ENVIRONMENT_SUMMARY.md',
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

console.log(`\n${colors.blue}🧪 Testing Environment Verification${colors.reset}\n`);

let allChecksPassed = true;
let checkedCount = 0;

requiredStructure.forEach(file => {
  const filePath = path.join(projectRoot, file);
  const exists = fs.existsSync(filePath);
  const status = exists ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
  
  console.log(`${status} ${file}`);
  
  if (!exists) {
    allChecksPassed = false;
  }
  checkedCount++;
});

// Check package.json has test scripts
console.log(`\n${colors.blue}Checking package.json scripts...${colors.reset}\n`);

try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const testScripts = [
    'test',
    'test:unit',
    'test:integration',
    'test:watch',
    'test:coverage',
    'test:debug',
    'test:full',
  ];
  
  testScripts.forEach(script => {
    const exists = packageJson.scripts && packageJson.scripts[script];
    const status = exists ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`${status} npm run ${script}`);
    
    if (!exists) {
      allChecksPassed = false;
    }
  });
} catch (error) {
  console.log(`${colors.red}✗ Error reading package.json${colors.reset}`);
  allChecksPassed = false;
}

// Summary
console.log(`\n${colors.blue}Summary${colors.reset}\n`);

if (allChecksPassed) {
  console.log(`${colors.green}✓ All testing components are in place!${colors.reset}\n`);
  console.log(`${colors.green}You can now run:${colors.reset}`);
  console.log(`  npm test              - Run all tests`);
  console.log(`  npm run test:unit     - Run unit tests`);
  console.log(`  npm run test:watch    - Run tests in watch mode`);
  console.log(`  npm run test:coverage - Generate coverage report\n`);
} else {
  console.log(`${colors.red}✗ Some testing components are missing!${colors.reset}\n`);
  console.log(`Please run the setup process again or check the documentation.\n`);
  process.exit(1);
}

console.log(`${colors.blue}Documentation:${colors.reset}`);
console.log(`  - tests/README.md               - Main testing guide`);
console.log(`  - TESTING_SETUP.md              - Setup overview`);
console.log(`  - TESTING_GUIDE.md              - Testing instructions`);
console.log(`  - TESTING_ENVIRONMENT_SUMMARY.md - Complete summary\n`);
