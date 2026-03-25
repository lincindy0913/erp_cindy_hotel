import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

// PUT - Update a notification channel preference
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const session = auth.session;
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的 ID', 400);
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();

    // Verify record exists and belongs to current user (or admin)
    const existing = await prisma.userNotificationChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到通知渠道設定', 404);
    }

    // Only the owner or admin can modify
    const isAdmin = session.user.role === 'admin';
    if (existing.userId !== userId && !isAdmin) {
      return createErrorResponse('FORBIDDEN', '權限不足，無法修改他人設定', 403);
    }

    // Build update data
    const updateData = {};

    if (data.enableEmail !== undefined) {
      if (typeof data.enableEmail !== 'boolean') {
        return createErrorResponse('VALIDATION_FAILED', 'enableEmail 必須為布林值', 400);
      }
      updateData.enableEmail = data.enableEmail;
    }

    if (data.enableLine !== undefined) {
      if (typeof data.enableLine !== 'boolean') {
        return createErrorResponse('VALIDATION_FAILED', 'enableLine 必須為布林值', 400);
      }
      updateData.enableLine = data.enableLine;
    }

    // enableInApp is always true, cannot be changed
    updateData.enableInApp = true;

    if (Object.keys(updateData).length === 1 && updateData.enableInApp === true) {
      // Only enableInApp was set (forced), nothing else to update
      return NextResponse.json(existing);
    }

    const updated = await prisma.userNotificationChannel.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - Remove a notification channel preference (resets to defaults)
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const session = auth.session;
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return createErrorResponse('VALIDATION_FAILED', '無效的 ID', 400);
    }

    const userId = parseInt(session.user.id);

    // Verify record exists and belongs to current user (or admin)
    const existing = await prisma.userNotificationChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到通知渠道設定', 404);
    }

    const isAdmin = session.user.role === 'admin';
    if (existing.userId !== userId && !isAdmin) {
      return createErrorResponse('FORBIDDEN', '權限不足，無法刪除他人設定', 403);
    }

    await prisma.userNotificationChannel.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `已刪除 ${existing.notificationCode} 通知渠道設定，將回復為預設值`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
