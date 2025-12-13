/**
 * Next.js Proxy for lockdown mode
 * When LOCKDOWN=true, blocks all API requests and shows lockdown page
 */

export default async function proxy(req) {
  const isLockdown = process.env.LOCKDOWN === 'true';
  
  if (!isLockdown) {
    return;
  }

  const url = new URL(req.url);
  const isApi = url.pathname.startsWith('/api');
  const isStatic = url.pathname.startsWith('/_next') || url.pathname.includes('.');
  const isLockdownPage = url.pathname === '/lockdown';

  // Allow static assets
  if (isStatic) return;

  // Block API calls with 503
  if (isApi) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'Service temporarily locked down',
        code: 'LOCKDOWN_ACTIVE' 
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Lockdown': '1'
        }
      }
    );
  }

  // Redirect pages to lockdown screen
  if (!isLockdownPage) {
    return Response.redirect(new URL('/lockdown', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
