# Testing Environment

This directory contains comprehensive tests for the Lift2.0 application.

## Directory Structure

```
tests/
├── unit/           # Unit tests for individual functions
│   └── lib/        # Tests for lib/ directory modules
├── integration/    # Integration tests
├── fixtures/       # Test data and fixtures
├── utils/          # Shared test utilities and mocks
└── README.md       # This file
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm test -- --watch
```

### Run tests with coverage
```bash
npm test -- --coverage
```

### Run specific test file
```bash
npm test proxy-utils
```

### Run tests matching a pattern
```bash
npm test -- --testNamePattern="isBot"
```

## Test Structure

Each test file follows this pattern:
- Located in `tests/` directory with the same structure as `lib/`
- Named as `{module}.test.ts`
- Uses Jest as the test runner
- Includes setup/teardown with `beforeEach`/`afterEach` as needed

## Creating New Tests

1. Create a test file in the appropriate directory:
   ```bash
   tests/unit/lib/your-module.test.ts
   ```

2. Import the module and test utilities:
   ```typescript
   import { yourFunction } from '../../../lib/your-module';
   import { createMockNextRequest } from '../../utils/mockNextRequest';
   ```

3. Write your tests using Jest syntax:
   ```typescript
   describe('yourFunction()', () => {
     it('should do something specific', () => {
       // Arrange
       const input = ...
       // Act
       const result = yourFunction(input);
       // Assert
       expect(result).toBe(...);
     });
   });
   ```

## Test Utilities

### `createMockNextRequest(options)`
Creates a mock NextRequest object for testing middleware functions.

```typescript
const req = createMockNextRequest({
  method: 'GET',
  url: 'http://localhost:3000/api/test',
  headers: { 'user-agent': 'curl/7.68.0' },
  body: null,
});
```

### `createMockNextResponse(options)`
Creates a mock NextResponse object for testing response handlers.

```typescript
const res = createMockNextResponse({
  status: 200,
  headers: { 'content-type': 'application/json' },
});
```

### `getResponseHeaders(response)`
Extracts headers from a NextResponse for assertions.

```typescript
const headers = getResponseHeaders(response);
expect(headers['x-frame-options']).toBe('SAMEORIGIN');
```

## Coverage Goals

- Unit tests: 80%+ coverage
- Critical paths: 100% coverage
- Integration tests: Key user flows

## CI/CD Integration

Tests are automatically run on:
- Pre-commit (via husky if configured)
- Pull requests
- Before deployment

## Debugging Tests

### Run single test with debugging
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome.

### Verbose output
```bash
npm test -- --verbose
```

### Show which tests are running
```bash
npm test -- --listTests
```

## Common Issues

### "Cannot find module" errors
- Ensure paths in imports are correct relative to test file
- Check that TypeScript paths are configured in tsconfig.json

### NextRequest/NextResponse errors
- Use `createMockNextRequest` and `createMockNextResponse` utilities
- Don't try to instantiate these directly in tests

### Tests failing due to environment variables
- Create a `.env.test` file with test-specific variables
- Or mock environment variables in test setup

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [Next.js Testing Documentation](https://nextjs.org/docs/testing)
