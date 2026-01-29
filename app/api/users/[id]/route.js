import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

// Demo users module for development without database
const demoUsers = require('@/lib/demo-users');

// GET single user
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    // Try database first, fallback to demo mode
    try {
      const prisma = (await import('@/lib/db')).default;
      const user = await prisma.user.findUnique({
        where: { id: parseInt(params.id) },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          isActive: true
        }
      });

      if (!user) {
        return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
      }

      return NextResponse.json(user);
    } catch (dbError) {
      console.log('Database not available, using demo mode');
      const user = demoUsers.getUserById(params.id);

      if (!user) {
        return NextResponse.json({ error: '使用者不存在' }, { status: 404 });
      }

      return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive
      });
    }
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: '取得使用者資料失敗' }, { status: 500 });
  }
}

// PUT update user
export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    const data = await request.json();

    // Try database first, fallback to demo mode
    try {
      const prisma = (await import('@/lib/db')).default;
      const bcrypt = (await import('bcryptjs')).default;

      const updateData = {
        name: data.name,
        role: data.role,
        permissions: data.permissions,
        isActive: data.isActive
      };

      // Only update password if provided
      if (data.password && data.password.trim() !== '') {
        updateData.password = await bcrypt.hash(data.password, 10);
      }

      const user = await prisma.user.update({
        where: { id: parseInt(params.id) },
        data: updateData
      });

      return NextResponse.json({ id: user.id, email: user.email, name: user.name });
    } catch (dbError) {
      console.log('Database not available, using demo mode');

      try {
        const updateData = {
          name: data.name,
          role: data.role,
          permissions: data.permissions,
          isActive: data.isActive
        };

        // Only update password if provided
        if (data.password && data.password.trim() !== '') {
          updateData.password = data.password;
        }

        const user = demoUsers.updateUser(params.id, updateData);
        return NextResponse.json(user);
      } catch (demoError) {
        return NextResponse.json({ error: demoError.message }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: '更新使用者失敗' }, { status: 500 });
  }
}

// DELETE user
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    // Prevent deleting the current user
    if (parseInt(params.id) === parseInt(session.user.id)) {
      return NextResponse.json({ error: '無法刪除目前登入的使用者' }, { status: 400 });
    }

    // Try database first, fallback to demo mode
    try {
      const prisma = (await import('@/lib/db')).default;
      await prisma.user.delete({
        where: { id: parseInt(params.id) }
      });

      return NextResponse.json({ success: true });
    } catch (dbError) {
      console.log('Database not available, using demo mode');

      try {
        demoUsers.deleteUser(params.id);
        return NextResponse.json({ success: true });
      } catch (demoError) {
        return NextResponse.json({ error: demoError.message }, { status: 400 });
      }
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: '刪除使用者失敗' }, { status: 500 });
  }
}
