'use client';

import Link from 'next/link';

export default function AnalysisTab({
  analysisFilter,
  setAnalysisFilter,
  analysisRecords,
  analysisLoading,
  analysisMode,
  setAnalysisMode,
  fetchAnalysisRecords,
  buildPivot,
  WAREHOUSE_OPTIONS,
}) {
  const isElec = analysisFilter.billType === '電費';
  const pivotMap = buildPivot(analysisRecords, analysisFilter.billType, analysisMode);
  const labels = [...pivotMap.keys()];
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const colTotals = months.map(m =>
    [...pivotMap.values()].reduce((s, row) => s + (row[m] || 0), 0)
  );
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別 <span className="text-red-400">*</span></label>
          <select value={analysisFilter.warehouse}
            onChange={e => setAnalysisFilter(f => ({ ...f, warehouse: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[120px]">
            <option value="">請選擇</option>
            {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-13" className="block text-xs text-gray-500 mb-1">年度（民國）</label>
          <input id="f-13" type="number" value={analysisFilter.year}
            onChange={e => setAnalysisFilter(f => ({ ...f, year: e.target.value }))}
            placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
        </div>
        <div>
          <label htmlFor="f-8" className="block text-xs text-gray-500 mb-1">類型</label>
          <select id="f-8" value={analysisFilter.billType}
            onChange={e => setAnalysisFilter(f => ({ ...f, billType: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="電費">電費</option>
            <option value="水費">水費</option>
          </select>
        </div>
        <button onClick={fetchAnalysisRecords} disabled={!analysisFilter.warehouse || !analysisFilter.year}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
          查詢
        </button>
        {/* 模式切換 */}
        <div className="ml-auto flex items-center gap-1 border rounded-lg overflow-hidden text-sm">
          {[['usage','使用度數'],['amount','繳費金額']].map(([val, lbl]) => (
            <button key={val} onClick={() => setAnalysisMode(val)}
              className={`px-3 py-2 font-medium transition-colors ${analysisMode === val
                ? (isElec ? 'bg-amber-500 text-white' : 'bg-sky-500 text-white')
                : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* 分析標題 */}
      {analysisRecords.length > 0 && (
        <p className="text-sm text-gray-500 px-1">
          {isElec ? '⚡' : '💧'} {analysisFilter.warehouse} — {analysisFilter.year} 年
          {analysisFilter.billType} {analysisMode === 'usage' ? '使用度數' : '繳費金額'}分析
          　共 <strong>{analysisRecords.length}</strong> 個月份資料，
          <strong>{labels.length}</strong> 條線路/地址
        </p>
      )}
      <p className="text-xs text-gray-500 px-1 -mt-2">
        若要比對<strong>住宿人數／入住間數</strong>（PMS 日匯入）並看「每人電費」等指標，請至
        <Link href="/analytics" className="text-teal-700 hover:underline mx-0.5">決策分析</Link>
        →「<strong>水電與住宿</strong>」分頁，選擇相同館別與民國年後查詢。
      </p>

      {/* Pivot 表 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto">
        {analysisLoading ? (
          <div className="py-16 text-center text-gray-400">查詢中…</div>
        ) : !analysisFilter.warehouse ? (
          <div className="py-16 text-center text-gray-400">
            請在上方選擇館別，系統將自動載入資料
          </div>
        ) : analysisRecords.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <div className="text-3xl mb-3">📭</div>
            <div className="font-medium">{analysisFilter.warehouse}　{analysisFilter.year} 年　{analysisFilter.billType}</div>
            <div className="text-sm mt-1 text-gray-400">查無資料。請先在「電費單解析」或「水費單解析」上傳並儲存帳單。</div>
          </div>
        ) : labels.length === 0 ? (
          <div className="py-16 text-center text-gray-400">帳單資料中無法辨識地址，請至「帳單明細管理」手動補填</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className={isElec ? 'bg-amber-600 text-white' : 'bg-sky-600 text-white'}>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-0 z-10 bg-inherit min-w-[200px]">
                  列標籤
                  <span className="block text-[10px] font-normal opacity-75">
                    加總 — {analysisMode === 'usage' ? '使用度數' : '繳費金額'}
                  </span>
                </th>
                {months.map(m => (
                  <th key={m} className="px-3 py-2 text-right font-medium whitespace-nowrap min-w-[60px]">
                    {String(m).padStart(2, '0')}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap min-w-[72px]">合計</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => {
                const rowData = pivotMap.get(label);
                const rowTotal = months.reduce((s, m) => s + (rowData[m] || 0), 0);
                return (
                  <tr key={label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r border-gray-100 max-w-[280px] truncate"
                      title={label}>{label}</td>
                    {months.map(m => (
                      <td key={m} className="px-3 py-1.5 text-right text-gray-700 tabular-nums">
                        {rowData[m] ? rowData[m].toLocaleString() : ''}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-800 border-l border-gray-100 tabular-nums">
                      {rowTotal > 0 ? rowTotal.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`font-bold border-t-2 ${isElec ? 'border-amber-300 bg-amber-50' : 'border-sky-300 bg-sky-50'}`}>
                <td className="px-3 py-2 sticky left-0 z-10 bg-inherit">總計</td>
                {colTotals.map((t, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {t > 0 ? t.toLocaleString() : ''}
                  </td>
                ))}
                <td className="px-3 py-2 text-right border-l border-gray-200 tabular-nums">
                  {grandTotal > 0 ? grandTotal.toLocaleString() : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* 缺資料月份提示 */}
      {analysisRecords.length > 0 && analysisRecords.length < 12 && (
        <p className="text-xs text-amber-600 px-1">
          提示：目前只有 {analysisRecords.map(r => `${r.billMonth} 月`).join('、')} 的資料，
          共 {analysisRecords.length} 個月（年度完整應有 12 個月）
        </p>
      )}
    </div>
  );
}
