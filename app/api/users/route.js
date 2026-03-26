import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { validatePasswordStrength } from '@/lib/password-policy';
import { validateBody } from '@/lib/validate-body';

export const dynamic = 'force-dynamic';

// GET all users (admin only)
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        warehouseRestriction: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          include: { role: { select: { id: true, code: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = users.map(u => ({
      ...u,
      roles: u.userRoles.map(ur => ur.role),
      roleCodes: u.userRoles.map(ur => ur.role.code),
      userRoles: undefined,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get users error:', error.message || error);
    return handleApiError(error);
  }
}

// POST create user (admin only)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return createErrorResponse('FORBIDDEN', '權限不足', 403);
    }

    const rawData = await request.json();

    // Validate and sanitize request body — strip unknown fields
    const { ok: bodyOk, data, error: bodyError } = validateBody(rawData, {
      email:                { type: 'string', required: true, maxLength: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      password:             { type: 'string', required: true, minLength: 8, maxLength: 128 },
      name:                 { type: 'string', required: true, maxLength: 100 },
      role:                 { type: 'enum', values: ['admin', 'user', 'viewer'] },
      roleIds:              { type: 'array', itemType: 'number', maxItems: 20 },
      permissions:          { type: 'array', itemType: 'string', maxItems: 100 },
      warehouseRestriction: { type: 'string', maxLength: 100 },
    });
    if (!bodyOk) {
      return createErrorResponse('VALIDATION_FAILED', bodyError, 400);
    }

    const pwCheck = validatePasswordStrength(data.password);
    if (!pwCheck.ok) {
      return createErrorResponse('VALIDATION_FAILED', pwCheck.message, 400);
    }

    const bcrypt = (await import('bcryptjs')).default;

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return createErrorResponse('CONFLICT_UNIQUE', '此電子郵件已被使用', 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    // 預設角色為 viewer
    const roleIds = data.roleIds || [];
    if (roleIds.length === 0) {
      const viewerRole = await prisma.role.findUnique({ where: { code: 'viewer' } });
      if (viewerRole) roleIds.push(viewerRole.id);
    }

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          role: data.role || 'user',
          permissions: data.permissions || [],
          warehouseRestriction: data.warehouseRestriction || null,
        },
      });

      // 建立角色關聯
      for (const roleId of roleIds) {
        await tx.userRole.create({
          data: {
            userId: newUser.id,
            roleId: parseInt(roleId),
            assignedBy: session.user.email,
          },
        });
      }

      return newUser;
    });

    await auditFromSession(prisma, session, {
      action: AUDIT_ACTIONS.USER_CREATE,
      targetModule: 'users',
      targetRecordId: user.id,
      afterState: { email: user.email, name: user.name, roleIds },
    });

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create user error:', error.message || error);
    return handleApiError(error);
  }
}
