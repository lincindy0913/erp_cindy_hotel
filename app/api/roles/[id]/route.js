import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// PUT - 更新角色
export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const id = parseInt(params.id);
    const data = await request.json();

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return createErrorResponse('NOT_FOUND', '角色不存在', 404);
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : role.name,
        description: data.description !== undefined ? data.description : role.description,
        permissions: data.permissions !== undefined ? data.permissions : role.permissions,
        isActive: data.isActive !== undefined ? data.isActive : role.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('更新角色錯誤:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE - 刪除非系統角色
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const id = parseInt(params.id);
    const role = await prisma.role.findUnique({ where: { id } });

    if (!role) {
      return createErrorResponse('NOT_FOUND', '角色不存在', 404);
    }

    if (role.isSystem) {
      return createErrorResponse('VALIDATION_FAILED', '系統內建角色不可刪除', 400);
    }

    // 先移除所有使用者的此角色關聯
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ]);

    return NextResponse.json({ message: '角色已刪除' });
  } catch (error) {
    console.error('刪除角色錯誤:', error.message || error);
    return handleApiError(error);
  }
}
