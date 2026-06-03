/**
 * Taiwan bimonthly VAT period utilities.
 *
 * Period mapping (期別 → 月份):
 *   1 = Jan–Feb   4 = Jul–Aug
 *   2 = Mar–Apr   5 = Sep–Oct
 *   3 = May–Jun   6 = Nov–Dec
 */

/**
 * Return { periodStart, periodEnd } date strings for a given year + period (1–6).
 */
export function vatPeriodDates(year, period) {
  const startMonth = (period - 1) * 2 + 1;           // 1,3,5,7,9,11
  const endMonth   = startMonth + 1;                  // 2,4,6,8,10,12
  const lastDay    = new Date(year, endMonth, 0).getDate(); // last day of endMonth
  return {
    periodStart: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    periodEnd:   `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * For a given year + period, fetch and return the carry-forward amount from the
 * PREVIOUS period's carryForwardOut.  Returns 0 if no previous record exists.
 */
export async function getPreviousCarryForward(prisma, year, period, warehouse) {
  let prevYear   = year;
  let prevPeriod = period - 1;
  if (prevPeriod === 0) { prevYear--; prevPeriod = 6; }

  const prev = await prisma.vatFilingPeriod.findUnique({
    where: { year_period_warehouse: { year: prevYear, period: prevPeriod, warehouse: warehouse ?? null } },
    select: { carryForwardOut: true },
  });
  return Number(prev?.carryForwardOut ?? 0);
}
