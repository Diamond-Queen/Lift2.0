import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '../../../lib/prisma';
import { findUserByEmail, updateUser } from '../../../lib/db';
import argon2 from 'argon2';
import {
  setSecureHeaders,
  trackIpRateLimit,
  trackFailedLogin,
  resetFailedLogin,
  validateRequest,
  auditLog,
} from '../../../lib/security';
import logger from '../../../lib/logger';
import { extractClientIp } from '../../../lib/ip';

const usePrisma = !!prisma;

export const authOptions = {
  adapter: usePrisma ? PrismaAdapter(prisma) : undefined,
  session: usePrisma ? { strategy: 'database', maxAge: 60 * 60 * 24 * 7 } : { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        // add secure headers to the response if available
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
        // Check account lockout
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
          // increment failed attempts and possibly lock the account
          try {
            const attempts = (user.failedLoginAttempts || 0) + 1;
            const data = { failedLoginAttempts: attempts };
            const LOCK_THRESHOLD = 5; // configurable: lock after 5 failed attempts
            const LOCK_MINUTES = 15; // lock duration
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
        // Successful login: reset counters if necessary
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
        // NextAuth expects an object; avoid returning password
        const { password, ...safe } = user;
        return safe;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // When user signs in (user object is present), attach id/role to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token, user }) {
      // For JWT sessions: copy token data to session.user
      // For DB sessions: user object will be present
      if (token) {
        session.user = session.user || {};
        session.user.id = token.id || token.sub;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.role = token.role;
      } else if (user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },
  // session merged above (strategy + maxAge)
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

export default NextAuth(authOptions);
