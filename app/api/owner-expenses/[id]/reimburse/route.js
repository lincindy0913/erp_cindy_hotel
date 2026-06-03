/**
 * POST /api/owner-expenses/[id]/reimburse
 *
 * 記錄老闆向公司請款（透過股東往來回款）。
 * 不新增 schema，只把格式化的請款備註附加到現有 note 欄位，
 * 並將狀態設為「已確認」。
 *
 * Body:
 *   reimburseDate  String  YYYY-MM-DD  — 現金交易日期（shareholder_loan）
 *   memo?          String              — 選填補充說明
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requireAnyPermission([
    PERMISSIONS.OWNER_EXPENSE_EDIT,
    PERMISSIONS.FINANCE_CREATE,
    PERMISSIONS.FINANCE_EDIT,
  ]);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const body = await request.json();
    const { reimburseDate, memo } = body;

    if (!reimburseDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供請款日期（reimburseDate）', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reimburseDate)) {
      return createErrorResponse('VALIDATION_FAILED', 'reimburseDate 格式應為 YYYY-MM-DD', 400);
    }

    const expense = await prisma.ownerMonthlyExpense.findUnique({ where: { id } });
    if (!expense) return createErrorResponse('NOT_FOUND', '找不到業主支出記錄', 404);
    if (expense.status === '已確認' && expense.note?.includes('【已請款】')) {
      return createErrorResponse('VALIDATION_FAILED', '此記錄已標記請款，請直接修改備註', 409);
    }

    // 格式化請款備註：附加在現有 note 後面（不覆蓋）
    const reimburseTag = memo
      ? `【已請款】${reimburseDate} 透過股東往來回款：${memo}`
      : `【已請款】${reimburseDate} 透過股東往來回款`;

    const existingNote = expense.note?.trim() ?? '';
    const newNote = existingNote
      ? `${existingNote}\n${reimburseTag}`
      : reimburseTag;

    const updated = await prisma.ownerMonthlyExpense.update({
      where: { id },
      data: {
        note:        newNote,
        status:      '已確認',
        confirmedBy: auth.session?.user?.name || auth.session?.user?.email || null,
        confirmedAt: new Date(),
      },
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.EXPENSE_CREATE,
      targetModule: 'owner-expense',
      targetRecordId: id,
      beforeState: { status: expense.status, note: expense.note },
      afterState:  { status: '已確認', reimburseDate, memo: memo || null },
      note: `老闆支出請款記錄 ${expense.expenseMonth}（${reimburseDate} 透過股東往來）`,
    }).catch(e => console.error('[AUDIT_FAIL] owner-expense reimburse:', e.message));

    return NextResponse.json({
      ...updated,
      totalAmount: Number(updated.totalAmount),
      reimburseDate,
      message: `已記錄：${reimburseTag}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
