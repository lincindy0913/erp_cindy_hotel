'use client';

import { formatNumber } from './pmsIncomeFormatters';

/**
 * 月度統計條圖（全年或單月科目）
 */
export default function PmsIncomeStatsChart({ statsData }) {
  if (!statsData) return null;

  if (statsData.byAccountingCode) {
    const items = statsData.byAccountingCode;
    if (items.length === 0) return <p className="text-gray-500 text-center py-8">無資料</p>;
    const maxVal = Math.max(...items.map((i) => Math.abs(i.net)));

    return (
      <div className="space-y-3">
        {items.map((item, i) => {
          const pct = maxVal > 0 ? (Math.abs(item.net) / maxVal) * 100 : 0;
          const isPositive = item.net >= 0;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 text-right text-sm text-gray-700 truncate" title={item.accountingName}>
                {item.accountingCode} {item.accountingName}
              </div>
              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isPositive ? 'bg-teal-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                  {formatNumber(item.net)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (Array.isArray(statsData)) {
    const maxTotal = Math.max(...statsData.map((m) => Math.abs(m.total)), 1);
    return (
      <div className="space-y-2">
        {statsData.map((m, i) => {
          const pct = maxTotal > 0 ? (Math.abs(m.total) / maxTotal) * 100 : 0;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-16 text-right text-sm font-medium text-gray-700">{m.month}月</div>
              <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                  {formatNumber(m.total)} ({m.importedDays}/{m.totalDays}天)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
