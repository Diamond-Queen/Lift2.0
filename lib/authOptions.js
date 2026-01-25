/**
 * NextAuth Configuration for Lift
 * 
 * Compatible with Stripe Redirect Checkout:
 * - No Stripe client-side dependencies required
 * - Works with JWT sessions for API authentication
 * - Supports server-side session validation in payment endpoints
 */

const NextAuth = require('next-auth').default;
const CredentialsProvider = require('next-auth/providers/credentials').default;
const { PrismaAdapter } = require('@next-auth/prisma-adapter');
const prisma = require('./prisma');
const { findUserByEmail, updateUser } = require('./db');
const argon2 = require('argon2');
const {
  setSecureHeaders,
  trackIpRateLimit,
  trackFailedLogin,
  resetFailedLogin,
  validateRequest,
  auditLog,
} = require('./security');
const logger = require('./logger');
const { extractClientIp } = require('./ip');

const usePrisma = !!prisma;

const authOptions = {
  adapter: usePrisma ? PrismaAdapter(prisma) : undefined,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try { if (req?.res) setSecureHeaders(req.res); } catch (e) {}

        const ip = extractClientIp(req);
        const validation = validateRequest(req);
        if (!validation.valid) {
          auditLog('auth_request_blocked', null, { ip, reason: validation.reason }, 'warning');
          throw new Error('Request rejected.');
        }
        const rl = trackIpRateLimit(ip, '/api/auth/[...nextauth]');
        if (!rl.allowed) {
          auditLog('auth_rate_limited_ip', null, { ip });
          throw new Error('Too many login attempts. Try again later.');
        }

        if (!credentials?.email || !credentials?.password) return null;
        const normalized = String(credentials.email).trim().toLowerCase();
        const user = usePrisma ? await prisma.user.findUnique({ where: { email: normalized } }) : await findUserByEmail(normalized);
        if (!user || !user.password) return null;
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          const until = new Date(user.lockedUntil).toISOString();
          throw new Error(`Account locked until ${until}. Try again later or reset your password.`);
        }
        const valid = await argon2.verify(user.password, credentials.password);
        if (!valid) {
          const failed = trackFailedLogin(normalized, ip);
          if (!failed.allowed) {
            auditLog('auth_account_locked', user.id, { email: normalized, ip, lockUntil: failed.lockUntil }, 'warning');
            throw new Error('Account locked due to repeated failures. Try again later.');
          }
          try {
            const attempts = (user.failedLoginAttempts || 0) + 1;
            const data = { failedLoginAttempts: attempts };
            const LOCK_THRESHOLD = 5;
            const LOCK_MINUTES = 15;
            if (attempts >= LOCK_THRESHOLD) {
              data.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
            }
            if (usePrisma) {
              await prisma.user.update({ where: { id: user.id }, data });
            } else {
              await updateUser(user.id, data);
            }
          } catch (e) {
            logger.error('failed_login_attempt_update', { message: e.message });
          }
          auditLog('auth_failed', user.id, { email: normalized, ip });
          return null;
        }
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          try {
            if (usePrisma) {
              await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
            } else {
              await updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null });
            }
            resetFailedLogin(normalized);
          } catch (e) { logger.error('failed_reset_lockout', { message: e.message }); }
        }
        resetFailedLogin(normalized);
        auditLog('auth_success', user.id, { email: normalized, ip });
        const { password, ...safe } = user;
        return safe;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token, user }) {
      try {
        if (token) {
          session.user = session.user || {};
          session.user.id = token.id || token.sub;
          session.user.email = token.email || '';
          session.user.name = token.name || '';
          session.user.role = token.role || 'user';
        } else if (user) {
          session.user = session.user || {};
          session.user.id = user.id;
          session.user.email = user.email || '';
          session.user.name = user.name || '';
          session.user.role = user.role || 'user';
        }
      } catch (err) {
        logger.error('session_callback_error', { message: err.message, stack: err.stack });
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
};

module.exports = { authOptions };
