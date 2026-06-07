import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rentals/income/import-excel
 * body: { rows: [{ contractNo, year, month, amount, actualDate, paymentMethod, accountName }] }
 *
 * 比對現有 RentalIncome 記錄並更新為已收款。
 * 若該月份尚無記錄則回報錯誤（需先在合約中產生收款計畫）。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '無有效資料' }, { status: 400 });
    }

    const errors  = [];
    let   updated = 0;

    // 預載帳戶
    const accounts = await prisma.cashAccount.findMany({
      where:  { isActive: true },
      select: { id: true, name: true },
    });
    const accMap = Object.fromEntries(accounts.map(a => [a.name.trim(), a.id]));

    // 預載合約（合約號 → id）
    const contracts = await prisma.rentalContract.findMany({
      select: { id: true, contractNo: true },
    });
    const contractMap = Object.fromEntries(contracts.map(c => [c.contractNo?.trim(), c.id]));

    for (const r of rows) {
      const rowNum       = r._row ?? '?';
      const contractNo   = r.contractNo?.trim();
      const year         = parseInt(r.year);
      const month        = parseInt(r.month);
      const amount       = parseFloat(r.amount);
      const actualDate   = r.actualDate?.trim();
      const payMethod    = r.paymentMethod?.trim() || '匯款';
      const accountName  = r.accountName?.trim();

      if (!contractNo)        { errors.push({ row: rowNum, message: '合約號為必填' }); continue; }
      if (isNaN(year) || isNaN(month)) { errors.push({ row: rowNum, message: '年份和月份需為數字' }); continue; }
      if (isNaN(amount) || amount <= 0) { errors.push({ row: rowNum, message: '金額必須大於 0' }); continue; }
      if (!actualDate)        { errors.push({ row: rowNum, message: '收款日期為必填' }); continue; }

      const contractId = contractMap[contractNo];
      if (!contractId) { errors.push({ row: rowNum, message: `合約號「${contractNo}」不存在` }); continue; }

      const accountId = accountName ? (accMap[accountName] ?? null) : null;
      if (accountName && !accountId) { errors.push({ row: rowNum, message: `帳戶「${accountName}」不存在` }); continue; }

      // 找對應的 RentalIncome 記錄
      const income = await prisma.rentalIncome.findFirst({
        where: { contractId, incomeYear: year, incomeMonth: month, status: { in: ['pending', 'partial', 'overdue'] } },
      });

      if (!income) {
        errors.push({ row: rowNum, message: `合約 ${contractNo} ${year}/${month} 無待收款記錄（可能已收款或尚未產生計畫）` });
        continue;
      }

      await prisma.rentalIncome.update({
        where: { id: income.id },
        data:  {
          actualAmount:  amount,
          actualDate,
          paymentMethod: payMethod,
          accountId,
          status:        amount >= Number(income.expectedAmount) ? 'completed' : 'partial',
        },
      });
      updated++;
    }

    return NextResponse.json({ count: updated, errors });
  } catch (error) {
    return handleApiError(error);
  }
}
