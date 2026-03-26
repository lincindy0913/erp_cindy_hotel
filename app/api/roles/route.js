import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { validateBody } from '@/lib/validate-body';

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

    const rawData = await request.json();
    const { ok: bodyOk, data, error: bodyError } = validateBody(rawData, {
      code:        { type: 'string', required: true, maxLength: 50, pattern: /^[a-z0-9_-]+$/ },
      name:        { type: 'string', required: true, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      permissions: { type: 'array', itemType: 'string', maxItems: 200 },
    });
    if (!bodyOk) {
      return createErrorResponse('VALIDATION_FAILED', bodyError, 400);
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
