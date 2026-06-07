import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['收入', '支出', '移轉'];

/**
 * POST /api/cashflow/transactions/import-excel
 * body: { rows: [{ date, type, amount, accountName, description, category, warehouse }] }
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '無有效資料' }, { status: 400 });
    }

    const errors  = [];
    let   created = 0;

    // 預載所有帳戶（名稱 → id）
    const accounts = await prisma.cashAccount.findMany({
      where:  { isActive: true },
      select: { id: true, name: true, warehouse: true },
    });
    const accMap = Object.fromEntries(accounts.map(a => [a.name.trim(), a]));

    // 預載科目分類（名稱 → id）
    const categories = await prisma.cashCategory.findMany({ select: { id: true, name: true } });
    const catMap     = Object.fromEntries(categories.map(c => [c.name.trim(), c.id]));

    await prisma.$transaction(async tx => {
      for (const r of rows) {
        const rowNum = r._row ?? '?';
        const date   = r.date?.trim();
        const type   = r.type?.trim();
        const amt    = parseFloat(r.amount);
        const accName = r.accountName?.trim();

        if (!date)          { errors.push({ row: rowNum, message: '日期為必填' }); continue; }
        if (!VALID_TYPES.includes(type)) { errors.push({ row: rowNum, message: `類型必須是：${VALID_TYPES.join('/')}` }); continue; }
        if (isNaN(amt) || amt <= 0)      { errors.push({ row: rowNum, message: '金額必須大於 0' }); continue; }
        if (!accName)                    { errors.push({ row: rowNum, message: '帳戶名稱為必填' }); continue; }

        const account = accMap[accName];
        if (!account) { errors.push({ row: rowNum, message: `帳戶「${accName}」不存在` }); continue; }

        const categoryId = r.category?.trim() ? (catMap[r.category.trim()] ?? null) : null;
        const txNo       = await nextCashTransactionNo(tx, date);

        await tx.cashTransaction.create({
          data: {
            transactionNo:  txNo,
            transactionDate: date,
            type,
            amount:      amt,
            accountId:   account.id,
            categoryId,
            warehouse:   r.warehouse?.trim() || account.warehouse || null,
            description: r.description?.trim() || null,
            status:      '已確認',
            isAutoCreated: false,
          },
        });

        // 更新帳戶餘額
        const delta = type === '收入' ? amt : type === '支出' ? -amt : 0;
        if (delta !== 0) {
          await tx.cashAccount.update({
            where: { id: account.id },
            data:  { currentBalance: { increment: delta } },
          });
        }

        created++;
      }
    });

    return NextResponse.json({ count: created, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
