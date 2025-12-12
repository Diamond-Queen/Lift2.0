import { NextResponse } from 'next/server';

// Global maintenance/lockdown toggle. Set LOCKDOWN=true in env to enable.
export function middleware(req) {
  const isLockdown = process.env.LOCKDOWN === 'true';
  if (!isLockdown) return NextResponse.next();

  const url = req.nextUrl.clone();
  const path = url.pathname;
  const isApi = path.startsWith('/api');
  const isStatic = path.startsWith('/_next') || path.startsWith('/static') || path.includes('.');
  const isLockdownPage = path === '/lockdown';

  // Allow static assets to load so the lockdown page renders correctly
  if (isStatic) return NextResponse.next();

  if (isApi) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: 'Service temporarily locked down' }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json',
          'x-lockdown': '1'
        }
      }
    );
  }

  // For non-API routes, rewrite to the lockdown page
  if (!isLockdownPage) {
    url.pathname = '/lockdown';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

// Apply to all routes; static assets are already short-circuited above.
export const config = {
  matcher: ['/((?!favicon.ico).*)']
};
