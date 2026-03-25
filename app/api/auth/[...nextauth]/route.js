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
          const prisma = (await import('@/lib/db')).default;
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              userRoles: { include: { role: true } }
            }
          });

          if (!user || !user.isActive) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
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
      }
      // Invalidate session if password was changed after token was issued
      if (token.issuedAt && token.passwordChangedAt && token.passwordChangedAt > token.issuedAt) {
        return null; // Forces re-login
      }
      return token;
    },
    async session({ session, token }) {
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
    maxAge: 24 * 60 * 60 // 24 hours
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
