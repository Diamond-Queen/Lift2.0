/**
 * Test Fixtures
 * Common test data and mocks
 */

export const mockUserAgents = {
  bot: {
    googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0)',
    curl: 'curl/7.68.0',
    wget: 'wget/1.20.3',
    python: 'python-requests/2.25.1',
  },
  desktop: {
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  },
  mobile: {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
  },
};

export const mockIpAddresses = {
  private: {
    local: '127.0.0.1',
    privateRange1: '10.0.0.1',
    privateRange2: '192.168.1.1',
    privateRange3: '172.16.0.1',
  },
  public: {
    google: '8.8.8.8',
    cloudflare: '1.1.1.1',
    aws: '52.1.1.1',
    example1: '203.0.113.1',
    example2: '198.51.100.1',
  },
  cloudflare: {
    us: '103.21.244.0',
    eu: '103.22.200.0',
  },
};

export const mockTokens = {
  bearer: {
    user: 'user-token-abc123def456',
    admin: 'admin-token-xyz789uvw012',
    service: 'service-token-qrs345tuv678',
  },
  jwt: {
    valid: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },
};

export const mockHeaders = {
  standard: {
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  },
  proxy: {
    'x-forwarded-for': '192.168.1.1, 10.0.0.1',
    'x-real-ip': '203.0.113.1',
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'example.com',
  },
  cloudflare: {
    'cf-connecting-ip': '203.0.113.42',
    'cf-ray': '123456789abcdef-LAX',
    'cf-ipcountry': 'US',
  },
  security: {
    'origin': 'https://example.com',
    'referer': 'https://example.com/page',
  },
};

export const mockResponses = {
  success: {
    data: 'response data',
    message: 'Success',
    status: 200,
  },
  error: {
    error: 'Not Found',
    message: 'Resource not found',
    status: 404,
  },
  unauthorized: {
    error: 'Unauthorized',
    message: 'Invalid credentials',
    status: 401,
  },
};
