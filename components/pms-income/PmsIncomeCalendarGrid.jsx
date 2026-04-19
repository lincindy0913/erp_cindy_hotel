'use client';

import { formatNumber } from './pmsIncomeFormatters';

/**
 * 每日匯入狀態月曆格
 */
export default function PmsIncomeCalendarGrid({ overviewYear, overviewMonth, batches, warehouses, monthlySummary }) {
  if (!monthlySummary) return null;
  if (!overviewYear || !overviewMonth) return null;
  const daysInMonth = new Date(overviewYear, overviewMonth, 0).getDate();
  const monthStr = String(overviewMonth).padStart(2, '0');

  const importStatus = {};
  for (const batch of batches || []) {
    const key = `${batch.warehouse}|${batch.businessDate}`;
    importStatus[key] = batch;
  }

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${overviewYear}-${monthStr}-${String(d).padStart(2, '0')}`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-teal-50">
            <th className="border border-gray-200 px-3 py-2 text-left font-medium text-teal-800 sticky left-0 bg-teal-50 z-10">日期</th>
            {warehouses.map((wh) => (
              <th key={wh} className="border border-gray-200 px-3 py-2 text-center font-medium text-teal-800 min-w-[100px]">
                {wh}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((date) => {
            const dayNum = parseInt(date.split('-')[2], 10);
            const dayOfWeek = new Date(date).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isFuture = date > new Date().toISOString().split('T')[0];
            return (
              <tr key={date} className={`${isWeekend ? 'bg-gray-50' : ''} ${isFuture ? 'opacity-40' : ''} hover:bg-teal-50/50`}>
                <td className="border border-gray-200 px-3 py-1.5 font-mono text-xs sticky left-0 bg-white z-10">
                  {dayNum}日 ({['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]})
                </td>
                {warehouses.map((wh) => {
                  const key = `${wh}|${date}`;
                  const batch = importStatus[key];
                  return (
                    <td key={wh} className="border border-gray-200 px-3 py-1.5 text-center">
                      {batch ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-green-600 font-bold text-base">&#10003;</span>
                          <span className="text-xs text-gray-500">{formatNumber(batch.creditTotal)}</span>
                        </div>
                      ) : isFuture ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        <span className="text-red-500 font-bold text-base">&#10007;</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
