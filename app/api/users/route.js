import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

// Demo users module for development without database
const demoUsers = require('@/lib/demo-users');

// GET all users (admin only)
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    // Try database first, fallback to demo mode
    try {
      const prisma = (await import('@/lib/db')).default;
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          isActive: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });
      return NextResponse.json(users);
    } catch (dbError) {
      console.log('Database not available, using demo mode');
      const users = demoUsers.getAllUsers();
      return NextResponse.json(users);
    }
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: '取得使用者列表失敗' }, { status: 500 });
  }
}

// POST create user (admin only)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    const data = await request.json();

    // Validate required fields
    if (!data.email || !data.password || !data.name) {
      return NextResponse.json({ error: '請填寫必要欄位' }, { status: 400 });
    }

    // Try database first, fallback to demo mode
    try {
      const prisma = (await import('@/lib/db')).default;
      const bcrypt = (await import('bcryptjs')).default;

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (existingUser) {
        return NextResponse.json({ error: '此電子郵件已被使用' }, { status: 400 });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          role: data.role || 'user',
          permissions: data.permissions || []
        }
      });

      return NextResponse.json(
        { id: user.id, email: user.email, name: user.name },
        { status: 201 }
      );
    } catch (dbError) {
      console.log('Database not available, using demo mode');

      try {
        const newUser = demoUsers.createUser({
          email: data.email,
          password: data.password,
          name: data.name,
          role: data.role || 'user',
          permissions: data.permissions || []
        });

        return NextResponse.json(newUser, { status: 201 });
      } catch (demoError) {
        return NextResponse.json({ error: demoError.message }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: '新增使用者失敗' }, { status: 500 });
  }
}
