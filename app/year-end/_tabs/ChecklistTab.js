'use client';

import Link from 'next/link';

export default function ChecklistTab({
  yearChecklist,
  isYearCompleted,
  selectedYear,
  yearManualChecks,
  toggleYearManual,
}) {
  if (!yearChecklist || isYearCompleted) return null;

  const autoItems = [
    {
      key: 'all_months_closed',
      label: '12 個月份均已月結',
      done: yearChecklist.closedCount >= 12,
      desc: yearChecklist.closedCount < 12
        ? `尚有 ${12 - yearChecklist.closedCount} 個月份未完成月結`
        : '全年 12 個月已完成月結',
      href: '/month-end',
      linkText: '前往月結',
      isManual: false,
    },
    {
      key: 'all_months_locked',
      label: '12 個月份均已鎖定',
      done: yearChecklist.lockedCount >= 12,
      desc: yearChecklist.lockedCount < 12
        ? `建議鎖定所有月份後再執行年結（目前 ${yearChecklist.lockedCount}/12 已鎖）`
        : '全年 12 個月已鎖定',
      href: '/month-end',
      linkText: '前往月結',
      isManual: false,
    },
  ];

  const manualItems = [
    {
      key: 'vat_filing_done',
      label: '全年 VAT 統一發票申報已完成',
      desc: `確認 ${selectedYear} 年度各期統一發票均已向國稅局申報完畢`,
      href: '/pms-income?tab=invoiceQuery',
      linkText: '前往發票查詢',
    },
    {
      key: 'inventory_counted',
      label: '年度庫存盤點已完成',
      desc: `確認年底實際盤點已執行，數量與系統一致（或差異已調整）`,
      href: '/purchasing',
      linkText: '前往庫存',
    },
  ];

  const allItems = [...autoItems, ...manualItems];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-violet-200">
      <div className="px-6 py-4 border-b border-violet-100 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-violet-800">年結前置確認清單</h3>
          <p className="text-sm text-gray-500 mt-0.5">年結前請確認以下所有項目已完成</p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-bold ${yearChecklist.lockedCount === 12 ? 'text-green-600' : 'text-amber-600'}`}>
            {yearChecklist.lockedCount} / 12 月已鎖定
          </span>
          {yearChecklist.closedCount > yearChecklist.lockedCount && (
            <p className="text-xs text-amber-600">{yearChecklist.closedCount - yearChecklist.lockedCount} 月已結帳但未鎖定</p>
          )}
        </div>
      </div>
      <div className="px-6 py-4 space-y-4">
        {/* 12 月狀態格 */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">月結狀態（{selectedYear} 年）</p>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => {
              const m = yearChecklist.months.find(x => x.month === i + 1);
              const status = m?.status || '未結帳';
              const isLocked = status === '已鎖定';
              const isClosed = status === '已結帳';
              return (
                <div key={i} className={`rounded-lg p-2 text-center text-xs ${
                  isLocked ? 'bg-green-100 text-green-800' :
                  isClosed ? 'bg-amber-100 text-amber-800' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  <div className="font-bold">{i + 1}月</div>
                  <div className="mt-0.5 text-xs">{isLocked ? '🔒' : isClosed ? '✓' : '—'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 確認項目清單（自動 + 手動混合） */}
        <div className="space-y-2 pt-2 border-t border-violet-100">
          {allItems.map((item, idx) => {
            const isManual = item.isManual !== false && !('done' in item);
            const confirmed = isManual && !!yearManualChecks[item.key];
            const effectiveOk = isManual ? confirmed : item.done;
            return (
              <div key={item.key} className={`flex items-start gap-3 p-2.5 rounded-lg border ${effectiveOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${effectiveOk ? 'bg-green-500 text-white' : 'bg-amber-400 text-white'}`}>
                  {effectiveOk ? '✓' : idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${effectiveOk ? 'text-green-800' : 'text-amber-800'}`}>
                    {item.label}
                    {isManual && !confirmed && <span className="ml-1.5 text-xs text-gray-400 font-normal">（請人工確認）</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isManual && (
                    <button
                      onClick={() => toggleYearManual(item.key)}
                      className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${
                        confirmed
                          ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {confirmed ? '✓ 已確認' : '標記確認'}
                    </button>
                  )}
                  <Link
                    href={item.href}
                    className="text-xs px-2 py-1 rounded border border-violet-200 text-violet-600 hover:bg-violet-50 whitespace-nowrap font-medium transition-colors"
                  >
                    {item.linkText} →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
