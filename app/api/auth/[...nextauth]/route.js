import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

// Demo users module for development without database
const demoUsers = require('@/lib/demo-users');

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
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

          console.log('Database not available, using demo mode');

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
            permissions: user.role === 'admin' ? ['*'] : user.permissions
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.roles = token.roles || [];
        session.user.permissions = token.permissions;
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
