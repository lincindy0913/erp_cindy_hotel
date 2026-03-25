import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET - 列出所有角色
export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      include: {
        _count: { select: { userRoles: true } },
      },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(roles.map(r => ({
      ...r,
      userCount: r._count.userRoles,
      _count: undefined,
    })));
  } catch (error) {
    console.error('取得角色列表錯誤:', error.message || error);
    return handleApiError(error);
  }
}

// POST - 建立自訂角色（admin only）
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const data = await request.json();
    if (!data.code || !data.name) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫角色代碼與名稱', 400);
    }

    const existing = await prisma.role.findUnique({ where: { code: data.code } });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '角色代碼已存在', 409);
    }

    const role = await prisma.role.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description || null,
        permissions: data.permissions || [],
        isSystem: false,
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error('建立角色錯誤:', error.message || error);
    return handleApiError(error);
  }
}
