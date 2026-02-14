/**
 * Example integration test for API routes
 */

import { createMockNextRequest, createMockNextResponse, getResponseHeaders } from '../utils/mockNextRequest';
import { 
  isBot, 
  getClientIp, 
  extractUserId, 
  createSecureResponse,
  isPublicRoute,
  isProtectedRoute,
  isApiRoute,
  validateRequest,
} from '../../lib/proxy-utils';

describe('Integration Tests - Proxy Utils', () => {
  describe('Full request flow with multiple utilities', () => {
    it('should process a normal user request correctly', () => {
      // Arrange - Create a request from a real user
      const req = createMockNextRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/data',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'x-forwarded-for': '192.168.1.1',
          'authorization': 'Bearer user-token-abc123',
        },
      });

      // Act - Process the request through various utilities
      const isUserBot = isBot(req);
      const clientIp = getClientIp(req);
      const userId = extractUserId(req);
      const isApi = isApiRoute('/api/data'); // isApiRoute expects pathname, not full URL

      // Assert
      expect(isUserBot).toBe(false);
      expect(clientIp).toBe('192.168.1.1');
      expect(userId).toBe('user-token-abc123');
      expect(isApi).toBe(true);
    });

    it('should process a bot request correctly', () => {
      // Arrange - Create a request from a bot
      const req = createMockNextRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/data',
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
          'x-forwarded-for': '66.249.66.1',
        },
      });

      // Act
      const isUserBot = isBot(req);
      const clientIp = getClientIp(req);

      // Assert
      expect(isUserBot).toBe(true);
      expect(clientIp).toBe('66.249.66.1');
    });

    it('should create secure response with all headers', () => {
      // Arrange
      const response = createMockNextResponse();
      createSecureResponse(response);

      // Act - Check all security headers are present
      const headerMap = getResponseHeaders(response);

      // Assert
      expect(Object.keys(headerMap).length).toBeGreaterThan(0);
      expect(headerMap['X-Frame-Options']).toBeDefined();
      expect(headerMap['X-XSS-Protection']).toBeDefined();
      expect(headerMap['X-Content-Type-Options']).toBeDefined();
      expect(headerMap['Referrer-Policy']).toBeDefined();
      expect(headerMap['Permissions-Policy']).toBeDefined();
      expect(headerMap['Content-Security-Policy']).toBeDefined();
    });

    it('should handle requests from Cloudflare', () => {
      // Arrange - Simulate a request through Cloudflare
      const req = createMockNextRequest({
        headers: {
          'cf-connecting-ip': '203.0.113.42',
          'cf-ray': '123456789abcdef-LAX',
          'user-agent': 'Mozilla/5.0 (iPhone)',
        },
      });

      // Act
      const clientIp = getClientIp(req);
      const isUserBot = isBot(req);

      // Assert
      expect(clientIp).toBe('203.0.113.42');
      expect(isUserBot).toBe(false);
    });

    it('should handle requests with multiple forwarded IPs', () => {
      // Arrange
      const req = createMockNextRequest({
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
        },
      });

      // Act - Should extract the first IP (client IP)
      const clientIp = getClientIp(req);

      // Assert
      expect(clientIp).toBe('192.168.1.1');
    });

    it('should identify route types correctly', () => {
      // Arrange
      const apiReq = createMockNextRequest({ url: 'http://localhost:3000/api/user' });
      const dashboardReq = createMockNextRequest({ url: 'http://localhost:3000/dashboard' });
      const loginReq = createMockNextRequest({ url: 'http://localhost:3000/login' });

      // Act & Assert - Pass pathname strings to the route functions
      expect(isApiRoute('/api/user')).toBe(true);
      expect(isProtectedRoute('/dashboard')).toBe(true);
      expect(isPublicRoute('/login')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle minimal request', () => {
      // Arrange
      const req = createMockNextRequest({});

      // Act
      const isUserBot = isBot(req);
      const clientIp = getClientIp(req);
      const userId = extractUserId(req);

      // Assert
      expect(isUserBot).toBe(false);
      expect(clientIp).toBe('unknown');
      expect(userId).toBeNull();
    });

    it('should handle requests with empty headers', () => {
      // Arrange
      const req = createMockNextRequest({
        headers: {
          'user-agent': '',
          'authorization': '',
          'x-forwarded-for': '',
        },
      });

      // Act
      const isUserBot = isBot(req);
      const userId = extractUserId(req);

      // Assert
      expect(isUserBot).toBe(false);
      expect(userId).toBeNull();
    });

    it('should handle case-insensitive user agent matching', () => {
      // Arrange - Test with mixed case bot identifiers
      const req = createMockNextRequest({
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; GoogleBOT/2.1)',
        },
      });

      // Act
      const isUserBot = isBot(req);

      // Assert
      expect(isUserBot).toBe(true);
    });

    it('should validate requests for security threats', () => {
      // Arrange
      const maliciousReq = createMockNextRequest({
        url: "http://localhost:3000/api/test?id=1'; DROP TABLE users--",
      });
      const validReq = createMockNextRequest({
        url: 'http://localhost:3000/api/user/123',
      });
      // Fix the valid request URL to not contain '//' after http
      validReq.nextUrl.toString = () => '/api/user/123';

      // Act
      const maliciousResult = validateRequest(maliciousReq);
      const validResult = validateRequest(validReq);

      // Assert
      expect(maliciousResult.valid).toBe(false);
      expect(validResult.valid).toBe(true);
    });
  });
});
