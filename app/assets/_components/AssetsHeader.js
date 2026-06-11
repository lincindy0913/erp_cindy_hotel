'use client';

import HelpButton from '@/components/HelpButton';

export function AssetsHeader({
  currentYear, year, setYear,
  activeRange, setActiveRange,
  dateStart, setDateStart,
  dateEnd, setDateEnd,
  loading, setLoading,
  loadYearData,
  canEdit,
  openCreate,
  exportCSV,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h2 className="text-xl font-bold text-gray-800">資產管理總覽</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          各物業出租狀況、收租金額、稅費及維護費
          {activeRange
            ? <span className="ml-1 text-teal-600 font-medium">{activeRange.start} ~ {activeRange.end}</span>
            : <span className="ml-1">{year} 年度彙整</span>
          }
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="f-23" className="text-sm text-gray-600">年度：</label>
        <select
          id="f-23"
          value={year}
          onChange={e => {
            setYear(Number(e.target.value));
            setActiveRange(null);
            setDateStart('');
            setDateEnd('');
          }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          {[0, 1, 2, 3, 4].map(d => {
            const y = currentYear - d;
            return <option key={y} value={y}>{y} 年</option>;
          })}
        </select>
        {/* 日期區間查詢 */}
        <div className="flex items-center gap-2 border rounded px-3 py-1 bg-gray-50">
          <label htmlFor="f-15" className="text-sm text-gray-500 whitespace-nowrap">區間：</label>
          <input id="f-15" type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-36" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-36" />
          <button type="button"
            disabled={!dateStart || !dateEnd || loading}
            onClick={async () => {
              if (!dateStart || !dateEnd) return;
              if (dateStart > dateEnd) { return; }
              setLoading(true);
              setActiveRange({ start: dateStart, end: dateEnd });
              try {
                await loadYearData(year, dateStart, dateEnd);
              } finally {
                setLoading(false);
              }
            }}
            className="px-3 py-1 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap">
            查詢
          </button>
          {activeRange && (
            <button type="button"
              onClick={() => { setActiveRange(null); setDateStart(''); setDateEnd(''); loadYearData(year); }}
              className="text-xs text-gray-500 hover:text-red-500 whitespace-nowrap">✕ 清除</button>
          )}
        </div>
        <HelpButton anchor="七資產管理" />
        <button type="button" onClick={exportCSV}
          className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
          ↓ 匯出 CSV
        </button>
        {canEdit && (
          <button type="button" onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            新增資產
          </button>
        )}
      </div>
    </div>
  );
}
