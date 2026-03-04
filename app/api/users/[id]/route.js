import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET single user
export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const id = parseInt(params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true, permissions: true,
        isActive: true, warehouseRestriction: true, notificationSettings: true,
        lastLoginAt: true, createdAt: true,
        userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
      },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '使用者不存在', 404);
    }

    return NextResponse.json({
      ...user,
      roles: user.userRoles.map(ur => ur.role),
      roleCodes: user.userRoles.map(ur => ur.role.code),
      userRoles: undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT update user (admin only)
export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const id = parseInt(params.id);
    const data = await request.json();

    const user = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '使用者不存在', 404);
    }

    const beforeState = {
      name: user.name,
      isActive: user.isActive,
      warehouseRestriction: user.warehouseRestriction,
      roleCodes: user.userRoles.map(ur => ur.role.code),
    };

    await prisma.$transaction(async (tx) => {
      const updateData = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.warehouseRestriction !== undefined) updateData.warehouseRestriction = data.warehouseRestriction;
      if (data.notificationSettings !== undefined) updateData.notificationSettings = data.notificationSettings;

      if (data.password && data.password.trim() !== '') {
        const bcrypt = (await import('bcryptjs')).default;
        updateData.password = await bcrypt.hash(data.password, 10);
      }

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({ where: { id }, data: updateData });
      }

      // 更新角色
      if (data.roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });

        for (const roleId of data.roleIds) {
          await tx.userRole.create({
            data: {
              userId: id,
              roleId: parseInt(roleId),
              assignedBy: session.user.email,
            },
          });
        }

        // 同步 User.role 欄位（向下相容）
        const roles = await tx.role.findMany({
          where: { id: { in: data.roleIds.map(r => parseInt(r)) } },
        });
        const roleCodes = roles.map(r => r.code);
        const newRole = roleCodes.includes('admin') ? 'admin' : 'user';
        await tx.user.update({ where: { id }, data: { role: newRole } });
      }
    });

    await auditFromSession(prisma, session, {
      action: AUDIT_ACTIONS.USER_UPDATE,
      targetModule: 'users',
      targetRecordId: id,
      beforeState,
      afterState: { name: data.name, isActive: data.isActive, roleIds: data.roleIds },
    });

    return NextResponse.json({ message: '使用者已更新' });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE deactivate user (admin only)
export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const id = parseInt(params.id);

    if (id === parseInt(session.user.id)) {
      return createErrorResponse('VALIDATION_FAILED', '無法停用目前登入的使用者', 400);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await auditFromSession(prisma, session, {
      action: AUDIT_ACTIONS.USER_DEACTIVATE,
      targetModule: 'users',
      targetRecordId: id,
    });

    return NextResponse.json({ message: '使用者已停用' });
  } catch (error) {
    return handleApiError(error);
  }
}
