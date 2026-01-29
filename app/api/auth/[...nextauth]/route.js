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
            where: { email: credentials.email }
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

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions
          };
        } catch (error) {
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
            permissions: user.permissions
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
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
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
