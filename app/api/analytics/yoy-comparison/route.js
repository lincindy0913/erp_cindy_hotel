/**
 * GET /api/analytics/yoy-comparison
 *
 * 跨年同期比對：從 MonthlyBusinessReport snapshot 抓同一個月份多年的關鍵指標。
 *
 * Query params:
 *   month     Int         1–12，要比的月份
 *   years     String      逗號分隔，e.g. "2024,2025,2026"（最多 5 年）
 *   warehouse String?     篩館別
 *
 * Response:
 *   periods[]     — 每個年份的指標快照（含 profitAnalysis + cashFlowAnalysis）
 *   metrics[]     — 轉置後的指標列表，方便前端直接渲染表格
 *   trends[]      — 相對於第一個年份的成長率
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const MAX_YEARS = 5;

const METRIC_KEYS = [
  { key: 'revenue',         label: '銷貨收入',   source: 'profit' },
  { key: 'cogs',            label: '進貨成本',   source: 'profit' },
  { key: 'grossProfit',     label: '毛利',       source: 'profit' },
  { key: 'grossMargin',     label: '毛利率 (%)', source: 'profit', isPct: true },
  { key: 'operatingProfit', label: '營業利益',   source: 'profit' },
  { key: 'netCashFlow',     label: '淨現金流',   source: 'cashFlow' },
];

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month     = parseInt(searchParams.get('month'));
    const yearsRaw  = searchParams.get('years') || '';
    const warehouse = searchParams.get('warehouse') || null;

    if (!month || month < 1 || month > 12) {
      return createErrorResponse('VALIDATION_FAILED', 'month 必須在 1–12 之間', 400);
    }

    const years = [...new Set(
      yearsRaw.split(',').map(y => parseInt(y.trim())).filter(y => y > 2000 && y < 2100)
    )].sort().slice(0, MAX_YEARS);

    if (years.length < 1) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供至少一個年份（years 逗號分隔）', 400);
    }

    // ── Fetch reports for all requested years ───────────────────────────
    const reports = await prisma.monthlyBusinessReport.findMany({
      where: {
        reportMonth: month,
        reportYear:  { in: years },
        warehouse:   warehouse ?? null,
      },
      select: {
        reportYear:          true,
        reportMonth:         true,
        warehouse:           true,
        status:              true,
        profitAnalysis:      true,
        cashFlowAnalysis:    true,
        executiveSummary:    true,
        generatedAt:         true,
      },
      orderBy: { reportYear: 'asc' },
    });

    const reportMap = new Map(reports.map(r => [r.reportYear, r]));

    // ── Build periods array ─────────────────────────────────────────────
    const periods = years.map(year => {
      const r = reportMap.get(year);
      if (!r) {
        return { year, month, warehouse, found: false, data: null };
      }
      const profit   = r.profitAnalysis   || {};
      const cashFlow = r.cashFlowAnalysis  || {};
      return {
        year,
        month,
        warehouse,
        found:    true,
        status:   r.status,
        generatedAt: r.generatedAt?.toISOString() ?? null,
        executiveSummary: r.executiveSummary ?? null,
        data: {
          revenue:         profit.revenue         ?? null,
          cogs:            profit.cogs            ?? null,
          grossProfit:     profit.grossProfit     ?? null,
          grossMargin:     profit.grossMargin     ?? null,
          operatingProfit: profit.operatingProfit ?? null,
          netCashFlow:     cashFlow.netCashFlow   ?? null,
        },
      };
    });

    // ── Transpose: metrics × years table ───────────────────────────────
    const baseYear   = periods.find(p => p.found);
    const metrics = METRIC_KEYS.map(({ key, label, isPct }) => {
      const values = periods.map(p => ({
        year:  p.year,
        value: p.found ? (p.data[key] ?? null) : null,
      }));
      const baseVal = baseYear?.data?.[key] ?? null;
      const withGrowth = values.map(v => {
        let growthPct = null;
        if (v.value !== null && baseVal !== null && baseVal !== 0 && v.year !== baseYear?.year) {
          growthPct = parseFloat(((v.value - baseVal) / Math.abs(baseVal) * 100).toFixed(1));
        }
        return { ...v, growthPct };
      });
      return { key, label, isPct: isPct ?? false, values: withGrowth };
    });

    return NextResponse.json({
      month,
      years,
      warehouse,
      periods,
      metrics,
      baseYear:    baseYear?.year ?? null,
      missingYears: years.filter(y => !reportMap.has(y)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
