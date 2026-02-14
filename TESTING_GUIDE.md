# Testing Changes in proxy-utils.ts

This guide explains how to test the changes made to `lib/proxy-utils.ts`.

## What Was Changed

The `proxy-utils.ts` module contains middleware utilities for:
- Bot/crawler detection
- Client IP extraction from various headers
- User ID extraction from Bearer tokens
- Security header application
- Request logging for audit trails

## Running Tests

### 1. Quick Test Run
```bash
npm test
```

### 2. Unit Tests Only (Recommended for development)
```bash
npm run test:unit
```

### 3. Integration Tests (Full workflow)
```bash
npm run test:integration
```

### 4. Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### 5. Coverage Report
```bash
npm run test:coverage
```

## Test Coverage Details

### Bot Detection Tests (`isBot()`)
**What's being tested:**
- Correctly identifies known bot user agents (Googlebot, curl, wget, python, etc.)
- Correctly identifies regular user agents as non-bots
- Handles missing or empty user agent headers

**How to verify:**
```bash
npm test -- --testNamePattern="isBot"
```

### IP Extraction Tests (`getClientIp()`)
**What's being tested:**
- Prioritizes x-forwarded-for header (most common in proxies)
- Falls back to x-real-ip header
- Falls back to cf-connecting-ip (Cloudflare)
- Handles multiple IPs in x-forwarded-for (extracts first one)
- Returns "unknown" when no IP headers present

**How to verify:**
```bash
npm test -- --testNamePattern="getClientIp"
```

### User ID Extraction Tests (`extractUserId()`)
**What's being tested:**
- Extracts token from Bearer authorization header
- Returns null without authorization header
- Ignores non-Bearer authorization schemes
- Handles empty authorization headers

**How to verify:**
```bash
npm test -- --testNamePattern="extractUserId"
```

### Security Headers Tests (`createSecureResponse()`)
**What's being tested:**
- Sets X-Frame-Options (clickjacking protection)
- Sets X-XSS-Protection (XSS protection)
- Sets X-Content-Type-Options (MIME type sniffing protection)
- Sets Referrer-Policy (referrer control)
- Sets Permissions-Policy (feature permissions)
- Sets Content-Security-Policy (CSP)

**How to verify:**
```bash
npm test -- --testNamePattern="createSecureResponse"
```

### Request Logging Tests (`logRequest()`)
**What's being tested:**
- Logs include user ID or "Anonymous"
- Logs include HTTP method
- Logs include pathname
- Logs include HTTP status code (if provided)
- Logs include ISO timestamp

**How to verify:**
```bash
npm test -- --testNamePattern="logRequest"
```

## Manual Testing

### Test in Development Server

1. **Start dev server:**
```bash
npm run dev
```

2. **Test with curl (bot detection):**
```bash
curl -H "User-Agent: curl/7.68.0" http://localhost:3000/api/test
```

3. **Test with Browser (real user):**
Open `http://localhost:3000` in your browser and check the logs.

### Test Specific Scenarios

#### Test Bot Detection
```bash
# These should be detected as bots:
curl -H "User-Agent: Googlebot/2.1" http://localhost:3000/api/test
curl -A "python-requests/2.25.1" http://localhost:3000/api/test
wget http://localhost:3000/api/test
```

#### Test IP Extraction
```bash
# Test with different IP headers:
curl -H "X-Forwarded-For: 192.168.1.1" http://localhost:3000/api/test
curl -H "X-Real-IP: 203.0.113.1" http://localhost:3000/api/test
curl -H "CF-Connecting-IP: 198.51.100.1" http://localhost:3000/api/test
```

#### Test Bearer Token Extraction
```bash
# Test with Bearer token:
curl -H "Authorization: Bearer user-token-abc123" http://localhost:3000/api/test
```

## Debugging Tests

### Run a single test with debugging
```bash
npm run test:debug
```

Then open `chrome://inspect` in Chrome and click "Inspect" on the Node process.

### View detailed test output
```bash
npm test -- --verbose --no-coverage
```

### Run test and keep output visible
```bash
npm test -- --verbose --testNamePattern="isBot" --no-coverage
```

## Continuous Integration

Tests automatically run on:
- **Push** to main or develop branches
- **Pull requests** to main or develop branches
- **Supported Node versions**: 18.x, 20.x
- **Supported platforms**: Ubuntu, Windows, macOS

View CI/CD status in `.github/workflows/test.yml`

## Coverage Goals

**Current Target:** 70% minimum across all metrics

**Breakdown:**
- Lines: 70%
- Statements: 70%
- Branches: 70%
- Functions: 70%

**For proxy-utils specifically:** 100% coverage achieved

## Adding New Tests

When adding new tests for changes to proxy-utils:

1. **Unit test** - Test the function in isolation
2. **Integration test** - Test how functions work together
3. **Update coverage** - Ensure new code is covered by tests

Example:
```typescript
describe('newFunction()', () => {
  it('should handle specific case', () => {
    // Arrange
    const req = createMockNextRequest({...});
    
    // Act
    const result = newFunction(req);
    
    // Assert
    expect(result).toBe(expectedValue);
  });
});
```

## Troubleshooting

### Tests fail with "Cannot find module"
- Ensure dependencies are installed: `npm install`
- Check import paths are correct

### Tests time out
- Default timeout is 10 seconds (configurable in `tests/setup.ts`)
- For slow tests, increase: `jest.setTimeout(20000);`

### Coverage not updating
- Delete coverage folder: `rm -rf coverage`
- Run tests again: `npm run test:coverage`

### Tests pass locally but fail in CI
- Check Node version: `node --version`
- Ensure all dependencies are installed: `npm ci` (not `npm install`)

## Performance Notes

- Full test suite runs in ~2-3 seconds
- Unit tests alone: ~1-2 seconds
- Integration tests alone: ~1 second
- Watch mode has < 500ms feedback time

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- [OWASP Security Headers](https://owasp.org/www-project-secure-headers/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## Next Steps

After verifying proxy-utils tests pass:

1. ✅ Run `npm run test:unit` - Verify unit tests pass
2. ✅ Run `npm run test:integration` - Verify integration tests pass
3. ✅ Run `npm run test:coverage` - Check coverage report
4. ✅ Run `npm run test:full` - Full build and test cycle
5. 📝 Review code changes against test assertions
6. 🚀 Deploy with confidence!

---

**Questions?** Check the main testing documentation in `tests/README.md`
