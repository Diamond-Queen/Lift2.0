/**
 * Test utilities for mocking Next.js Request/Response objects
 */

/**
 * Create a mock NextRequest-like object for testing
 */
export function createMockNextRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}): any {
  const {
    method = 'GET',
    url = 'http://localhost:3000/api/test',
    headers = {},
    body = null,
  } = options;

  // Create a mock headers object with get method
  const mockHeaders = new Map<string, string>();
  Object.entries(headers).forEach(([key, value]) => {
    mockHeaders.set(key.toLowerCase(), value);
  });

  // Create the mock request
  const mockRequest = {
    method,
    url,
    nextUrl: {
      toString: () => url,
    },
    headers: {
      get: (key: string) => mockHeaders.get(key.toLowerCase()) || null,
    },
    body: body ? JSON.stringify(body) : null,
  };

  return mockRequest;
}

/**
 * Create a mock NextResponse-like object for testing
 */
export function createMockNextResponse(options: {
  status?: number;
  statusText?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}): any {
  const {
    status = 200,
    statusText = 'OK',
    body = null,
    headers = {},
  } = options;

  const mockHeaders = new Map<string, string>(Object.entries(headers));

  const mockResponse = {
    status,
    statusText,
    body: body ? JSON.stringify(body) : null,
    headers: {
      get: (key: string) => mockHeaders.get(key) || null,
      set: (key: string, value: string) => {
        mockHeaders.set(key, value);
      },
      forEach: (callback: (value: string, key: string) => void) => {
        mockHeaders.forEach((value, key) => callback(value, key));
      },
    },
  };

  return mockResponse;
}

/**
 * Extract headers from a mock response for assertions
 */
export function getResponseHeaders(response: any): Record<string, string> {
  const headers: Record<string, string> = {};
  if (response.headers && typeof response.headers.forEach === 'function') {
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });
  }
  return headers;
}
