# Middleware Implementation Guide

## Overview

The middleware system provides centralized handling for:
- **Authentication & Authorization** - Protect routes and validate sessions
- **Security Headers** - Add security headers to all responses
- **Request Validation** - Check for suspicious patterns
- **Audit Logging** - Track user actions across the app
- **Rate Limiting** - Prevent abuse
- **Bot Detection** - Identify and handle bots/crawlers

## Files Created

### 1. `middleware.ts` (Root Level)
Main middleware file that runs on all matching routes.

**Key Features:**
- Adds security headers (CSP, X-Frame-Options, etc.)
- Protects routes based on authentication status
- Redirects authenticated users away from auth pages
- Logs access to protected routes for audit trail
- Uses NextAuth integration for session validation

**Configuration:**
- `protectedRoutes` - Routes that require authentication
- `authRoutes` - Routes only for unauthenticated users
- `publicRoutes` - Routes accessible to everyone
- `matcher` - Patterns for which routes run middleware

### 2. `lib/middleware-utils.ts`
Utility functions used by middleware and other parts of the app.

**Available Functions:**
- `isBot()` - Detect if request is from a bot/crawler
- `getClientIp()` - Extract client IP from request
- `extractUserId()` - Get user ID from request
- `createSecureResponse()` - Apply security headers
- `logRequest()` - Log request for audit trail
- `isPublicRoute()` - Check if route is public
- `isProtectedRoute()` - Check if route is protected
- `isApiRoute()` - Check if route is API
- `checkRateLimit()` - Basic rate limiting
- `validateRequest()` - Check for suspicious patterns
- `getRequestId()` - Generate/retrieve request ID for tracking

## How It Works

### Authentication Flow
1. User tries to access `/dashboard` (protected route)
2. Middleware checks if user has valid session token
3. If not authenticated → Redirect to `/login?redirect=/dashboard`
4. If authenticated → Allow access, log the action

### Security Flow
1. Request comes in for any matched route
2. Middleware adds security headers to response
3. Validates request for suspicious patterns
4. Logs access if it's a protected route
5. Response returned with security headers applied

### Protected Routes
These automatically require authentication:
- `/dashboard/*` - Main dashboard
- `/notes/*` - Notes feature
- `/career/*` - Career feature
- `/account/*` - Account settings
- `/subscription/*` - Subscription management
- `/api/*` - All API endpoints

### Public Routes
These are accessible without authentication:
- `/` - Landing page
- `/login` - Login page
- `/signup` - Signup page
- `/privacy` - Privacy policy
- `/terms` - Terms of service
- `/beta-signup` - Beta signup (unauthenticated)

## Usage in Application

### In Page Components
```jsx
// The middleware automatically redirects unauthenticated users
// No need to duplicate auth checks in pages

export default function Dashboard() {
  // Middleware ensures only authenticated users reach here
  return <div>Protected content</div>;
}
```

### In API Routes
```javascript
// API routes still need auth checks, but middleware provides first layer
export default async function handler(req, res) {
  // Middleware has already validated session
  // Additional checks can be added here for granular control
}
```

### Using Utilities
```typescript
import { 
  isBot, 
  getClientIp, 
  logRequest 
} from '@/lib/middleware-utils';

// In an API route:
if (isBot(req)) {
  return res.status(403).json({ error: 'Bots not allowed' });
}

const ip = getClientIp(req);
logRequest(userId, 'POST', '/api/notes', 200);
```

## Security Headers Explained

- **X-Frame-Options: SAMEORIGIN** - Prevents clickjacking attacks
- **X-XSS-Protection: 1; mode=block** - Browser XSS protection
- **X-Content-Type-Options: nosniff** - Prevents MIME sniffing
- **Content-Security-Policy** - Restricts resource sources
- **Referrer-Policy: strict-origin-when-cross-origin** - Controls referrer info
- **Permissions-Policy** - Disables unnecessary APIs (camera, microphone, etc.)

## Rate Limiting

Basic in-memory rate limiting is included in `checkRateLimit()`:
```typescript
const { allowed, remaining } = checkRateLimit('user_123', 100, 60000);

if (!allowed) {
  return res.status(429).json({ error: 'Too many requests' });
}
```

**Note:** For production with multiple servers, use Redis or similar distributed solution.

## Logging & Audit Trail

All protected route access is logged:
```
[MIDDLEWARE_LOG] 2026-02-13T12:34:56.789Z | User:user_123 | GET /dashboard Status:200
[AUTH_ACCESS] User: user_123, Route: /api/notes, Time: 2026-02-13T12:34:56.789Z
```

This creates an audit trail for security monitoring.

## Testing

### Test Protected Routes
```bash
# Should redirect to login
curl http://localhost:3000/dashboard

# Should work (if authenticated)
curl -H "Cookie: auth-token=..." http://localhost:3000/dashboard
```

### Test Security Headers
```bash
# Check for security headers
curl -I http://localhost:3000/dashboard
# Look for X-Frame-Options, X-XSS-Protection, etc.
```

### Test Rate Limiting
```bash
# Rapid requests should trigger rate limit
for i in {1..150}; do curl http://localhost:3000/api/user; done
```

## Customization

### Add New Protected Route
1. Add route to `protectedRoutes` array in `middleware.ts`
2. Update `matcher` config if needed
3. Middleware will automatically protect it

### Add New Public Route
1. Add route to `publicRoutes` array in `middleware.ts`
2. Routes not in protected or auth lists are public by default

### Modify Security Headers
Edit the header setting code in `middleware.ts` or in `createSecureResponse()` function in `middleware-utils.ts`.

### Adjust Rate Limits
Modify `checkRateLimit()` function calls with different `maxRequests` and `windowMs` parameters.

## Performance Considerations

- Middleware runs on **every request** to matched routes
- Keep middleware logic lightweight
- Heavy operations should be in API endpoints, not middleware
- Rate limiting with large request volumes should use Redis
- Consider caching middleware decisions for frequently accessed routes

## Troubleshooting

### Users getting redirected to login unexpectedly
- Check if route is in `protectedRoutes` array
- Verify session token is being set correctly
- Check browser cookies are not being blocked

### Security headers not appearing
- Verify middleware is running (check console logs)
- Check if route matches the `matcher` pattern
- Ensure no other middleware is overriding headers

### Rate limiting too aggressive
- Increase `maxRequests` parameter
- Increase `windowMs` parameter (in milliseconds)
- Consider using Redis for distributed rate limiting

## Next Steps

1. ✅ Middleware created and configured
2. Next: Monitor logs for issues
3. Consider adding Redis for rate limiting at scale
4. Add request ID tracking for better debugging
5. Implement more granular permission levels if needed
