/**
 * Middleware Utilities
 * Provides helper functions for middleware operations
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if request is from a known bot/crawler
 */
export function isBot(req: NextRequest): boolean {
  const userAgent = req.headers.get('user-agent')?.toLowerCase() || '';
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'curl',
    'wget',
    'python',
  ];
  return botPatterns.some(pattern => userAgent.includes(pattern));
}

/**
 * Get client IP address from request
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0] ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Extract user ID from request
 */
export function extractUserId(req: NextRequest): string | null {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      // For API routes with token
      const token = authHeader.slice(7);
      // Would need to decode JWT here in production
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create security headers response
 */
export function createSecureResponse(
  response: NextResponse = NextResponse.next()
): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  
  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), magnetometer=(), gyroscope=()'
  );
  
  // Content Security Policy (allow Google Fonts, Tesseract worker, OCR APIs, Stripe)
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: https://api.ocr.space; worker-src 'self' blob:; frame-src https://js.stripe.com;"
  );

  return response;
}

/**
 * Log request for audit trail
 */
export function logRequest(
  userId: string | null,
  method: string,
  pathname: string,
  status?: number
): void {
  const timestamp = new Date().toISOString();
  const userLabel = userId ? `User:${userId}` : 'Anonymous';
  const statusLabel = status ? ` Status:${status}` : '';
  
  console.log(
    `[MIDDLEWARE_LOG] ${timestamp} | ${userLabel} | ${method} ${pathname}${statusLabel}`
  );
}

/**
 * Check if route is public
 */
export function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/',
    '/privacy',
    '/terms',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/beta-signup',
  ];
  
  return publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Check if route is protected
 */
export function isProtectedRoute(pathname: string): boolean {
  const protectedRoutes = [
    '/dashboard',
    '/notes',
    '/career',
    '/account',
    '/subscription',
    '/api/user',
    '/api/subscription',
    '/api/beta',
    '/api/notes',
    '/api/career',
  ];
  
  return protectedRoutes.some(route => pathname.startsWith(route));
}

/**
 * Check if route is an API route
 */
export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * Rate limit check (basic implementation)
 * In production, use Redis or similar for distributed rate limiting
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || now > record.resetTime) {
    // New window
    requestCounts.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * Validate request structure
 */
export function validateRequest(req: NextRequest): {
  valid: boolean;
  error?: string;
} {
  // Check for suspicious patterns
  const url = req.nextUrl.toString();
  
  // Check for SQL injection attempts (basic)
  if (/('|";|--|\/\*|\*\/|xp_|sp_)/i.test(url)) {
    return { valid: false, error: 'Invalid request pattern' };
  }

  // Check for path traversal
  if (url.includes('..') || url.includes('//')) {
    return { valid: false, error: 'Invalid path' };
  }

  return { valid: true };
}

/**
 * Get or create request ID for tracking
 */
export function getRequestId(req: NextRequest): string {
  const existing = req.headers.get('x-request-id');
  if (existing) return existing;
  
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
