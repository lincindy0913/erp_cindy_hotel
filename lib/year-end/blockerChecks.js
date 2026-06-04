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

  // ── 1. All 12 months must be closed or locked ─────────────────────────
  const closedMonthRows = await prisma.monthEndStatus.findMany({
    where: { year, status: { in: ['已結帳', '已鎖定'] } },
    select: { month: true },
    distinct: ['month'],
  });
  if (closedMonthRows.length < 12) {
    const closedSet = new Set(closedMonthRows.map(r => r.month));
    const unclosed  = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !closedSet.has(m));
    blockers.push(
      `尚未月結的月份：${unclosed.join('、')} 月（共 ${unclosed.length} 個月）`
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

  return blockers;
}
