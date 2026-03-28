import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

// Demo users module for development without database
const demoUsers = require('@/lib/demo-users');

// Validate NEXTAUTH_SECRET — reject weak/placeholder values at runtime
function _validateSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  const PLACEHOLDER_PATTERNS = ['change-me', 'your-secret', 'placeholder', 'example', 'xxxxxxxx', 'secret-at-least'];
  const isPlaceholder = !secret || PLACEHOLDER_PATTERNS.some(p => secret.toLowerCase().includes(p));
  const isTooShort = secret && secret.length < 32;

  if (isPlaceholder || isTooShort) {
    const msg = 'FATAL: NEXTAUTH_SECRET is missing, too short (<32 chars), or using a placeholder. Set a secure value via: openssl rand -base64 32';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(`[auth] WARNING: ${msg}`);
  }
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        _validateSecret(); // Throws in production if secret is weak

        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Try database authentication first
        try {
          const prisma = (await import('@/lib/prisma')).default;
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              userRoles: { include: { role: true } }
            }
          });

          if (!user || !user.isActive) {
            return null;
          }

          // Account lockout check: 5 failed attempts → lock for 15 minutes
          const MAX_FAILED_ATTEMPTS = 5;
          const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
          if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            console.warn(`[auth] Account locked: ${user.email}, until ${user.lockedUntil}`);
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            // Increment failed attempts; lock if threshold reached
            const attempts = (user.failedLoginAttempts || 0) + 1;
            const lockData = { failedLoginAttempts: attempts };
            if (attempts >= MAX_FAILED_ATTEMPTS) {
              lockData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
              console.warn(`[auth] Locking account: ${user.email} after ${attempts} failed attempts`);
            }
            await prisma.user.update({ where: { id: user.id }, data: lockData });
            return null;
          }

          // Successful login — reset failed attempts and lock
          if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
            });
          } else {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() }
            });
          }

          // 合併所有角色的權限
          const roleCodes = user.userRoles.map(ur => ur.role.code);
          const permSet = new Set();
          for (const ur of user.userRoles) {
            const perms = ur.role.permissions;
            if (Array.isArray(perms)) perms.forEach(p => permSet.add(p));
          }
          const isAdmin = roleCodes.includes('admin') || user.role === 'admin';

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: isAdmin ? 'admin' : (user.role || 'user'),
            roles: roleCodes,
            permissions: isAdmin ? ['*'] : Array.from(permSet),
            warehouseRestriction: user.warehouseRestriction || null,
            passwordChangedAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : null,
          };
        } catch (error) {
          // Only fall back to demo mode for DB connection errors
          const isConnectionError =
            error.code === 'P1001' ||
            error.code === 'P1002' ||
            error.code === 'P1003' ||
            error.message?.includes('connect ECONNREFUSED') ||
            error.message?.includes("Can't reach database server");

          if (!isConnectionError) {
            console.error('Auth DB error (non-connection):', error.message);
            return null;
          }

          // Block demo fallback in production
          if (process.env.NODE_ENV === 'production') {
            console.error('Database unavailable in production — demo fallback disabled');
            return null;
          }

          console.log('Database not available, using demo mode (development only)');

          // Fallback to demo users (file-based storage)
          const user = demoUsers.getUserByEmail(credentials.email);

          if (!user || !user.isActive) {
            return null;
          }

          // Verify password (plain text comparison for demo)
          if (!demoUsers.verifyPassword(user, credentials.password)) {
            return null;
          }

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.role === 'admin' ? ['*'] : user.permissions,
            warehouseRestriction: user.warehouseRestriction || null,
          };
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roles = user.roles || [];
        token.permissions = user.permissions;
        token.warehouseRestriction = user.warehouseRestriction || null;
        token.passwordChangedAt = user.passwordChangedAt || null;
        token.issuedAt = Date.now();
        token.lastActivity = Date.now();
        token.refreshedAt = Date.now();
      }

      // Invalidate session if password was changed after token was issued
      if (token.issuedAt && token.passwordChangedAt && token.passwordChangedAt > token.issuedAt) {
        return null; // Forces re-login
      }

      // Idle timeout: if no activity for 2 hours, force re-login (#14)
      const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
      if (token.lastActivity && (Date.now() - token.lastActivity) > IDLE_TIMEOUT_MS) {
        return null; // Forces re-login
      }

      // Sliding window token rotation: refresh permissions from DB every 1 hour (#11)
      const ROTATION_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour
      if (token.refreshedAt && (Date.now() - token.refreshedAt) > ROTATION_INTERVAL_MS) {
        try {
          const prisma = (await import('@/lib/prisma')).default;
          const freshUser = await prisma.user.findUnique({
            where: { id: parseInt(token.id) },
            include: { userRoles: { include: { role: true } } },
          });
          if (!freshUser || !freshUser.isActive) {
            return null; // User deactivated — force logout
          }
          // Refresh token data from DB
          const roleCodes = freshUser.userRoles.map(ur => ur.role.code);
          const permSet = new Set();
          for (const ur of freshUser.userRoles) {
            const perms = ur.role.permissions;
            if (Array.isArray(perms)) perms.forEach(p => permSet.add(p));
          }
          const isAdmin = roleCodes.includes('admin') || freshUser.role === 'admin';
          token.role = isAdmin ? 'admin' : (freshUser.role || 'user');
          token.roles = roleCodes;
          token.permissions = isAdmin ? ['*'] : Array.from(permSet);
          token.warehouseRestriction = freshUser.warehouseRestriction || null;
          token.passwordChangedAt = freshUser.passwordChangedAt ? freshUser.passwordChangedAt.getTime() : null;
          token.refreshedAt = Date.now();
        } catch {
          // DB unavailable — keep existing token data, retry next time
        }
      }

      // Update last activity timestamp
      token.lastActivity = Date.now();

      return token;
    },
    async session({ session, token }) {
      if (!token) return session;
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.roles = token.roles || [];
        session.user.permissions = token.permissions;
        session.user.warehouseRestriction = token.warehouseRestriction || null;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60 // 24 hours absolute maximum
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
