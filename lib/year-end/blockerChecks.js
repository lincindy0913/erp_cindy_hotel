/**
 * Shared year-end blocker checks.
 * Called by both /api/year-end/preview (returns warnings) and
 * /api/year-end POST (hard-stops with 422 if any blocker exists).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} year
 * @returns {Promise<string[]>} Array of blocker messages (empty = safe to proceed)
 */
export async function checkYearEndBlockers(prisma, year) {
  const blockers = [];

  // ── 1. Every warehouse × all 12 months must be closed or locked ─────────
  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  const whBlockers = [];
  for (const wh of warehouses) {
    const closedRows = await prisma.monthEndStatus.findMany({
      where: { year, warehouse: wh.name, status: { in: ['已結帳', '已鎖定'] } },
      select: { month: true },
      distinct: ['month'],
    });
    if (closedRows.length < 12) {
      const closedSet = new Set(closedRows.map(r => r.month));
      const unclosed  = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !closedSet.has(m));
      whBlockers.push(`${wh.name}：${unclosed.join('、')} 月`);
    }
  }
  if (whBlockers.length > 0) {
    blockers.push(
      `以下館別有月份尚未月結（${whBlockers.join('；')}），共 ${whBlockers.length} 個館別待完成`
    );
  }

  // ── 2. VAT period 6 (Nov–Dec) must be calculated ─────────────────────
  const period6 = await prisma.vatFilingPeriod.findUnique({
    where: { year_period_warehouse: { year, period: 6, warehouse: null } },
    select: { carryForwardOut: true, status: true },
  });
  if (period6 === null) {
    blockers.push('第 6 期（11–12 月）VAT 申報尚未計算，年結後留抵稅額無法確認');
  } else if (period6.status === '草稿') {
    const carry = Number(period6.carryForwardOut ?? 0);
    blockers.push(
      `第 6 期 VAT 申報為草稿狀態（留抵帶出 $${carry.toLocaleString()}），建議先確認申報後再結轉`
    );
  }

  // ── 3. December bank reconciliation must be confirmed ────────────────
  const bankAccounts = await prisma.cashAccount.findMany({
    where: { isActive: true, type: '銀行存款' },
    select: { id: true, name: true },
  });
  if (bankAccounts.length > 0) {
    const confirmed = await prisma.bankReconciliation.findMany({
      where: {
        statementYear: year,
        statementMonth: 12,
        status: 'confirmed',
        accountId: { in: bankAccounts.map(a => a.id) },
      },
      select: { accountId: true },
    });
    const reconciledIds = new Set(confirmed.map(r => r.accountId));
    const unreconciled = bankAccounts.filter(a => !reconciledIds.has(a.id)).map(a => a.name);
    if (unreconciled.length > 0) {
      const preview = unreconciled.slice(0, 3).join('、') + (unreconciled.length > 3 ? '…' : '');
      blockers.push(
        `${unreconciled.length} 個銀行帳戶 12 月份對帳未完成（${preview}），年結後期初餘額將不準確`
      );
    }
  }

  return blockers;
}
