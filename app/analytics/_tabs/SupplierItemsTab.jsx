'use client';

import { useState, useMemo } from 'react';
import ExportButtons from '@/components/ExportButtons';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

const KpiCard = ({ label, value, sub, color = 'text-gray-900', icon }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-start justify-between">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {icon && <span className="text-lg">{icon}</span>}
    </div>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function SupplierItemsDataView({ data, filterMeta }) {
  const { rows = [], totalAmount = 0, totalQty = 0 } = data;
  const [viewMode, setViewMode] = useState('detail');

  const monthlyPivot = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const m = parseInt(r.purchaseDate.slice(5, 7), 10);
      if (!map.has(r.supplierName)) {
        map.set(r.supplierName, { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0,11:0,12:0 });
      }
      map.get(r.supplierName)[m] += r.subtotal;
    }
    return Array.from(map.entries())
      .map(([name, months]) => ({
        supplierName: name,
        months,
        total: Object.values(months).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const monthlyColTotals = useMemo(() =>
    MONTHS.reduce((acc, m) => {
      acc[m] = monthlyPivot.reduce((s, r) => s + r.months[m], 0);
      return acc;
    }, {}),
  [monthlyPivot]);

  const DETAIL_EXPORT_COLS = [
    { header: '日期',     key: 'purchaseDate', width: 14 },
    { header: '進貨單號', key: 'purchaseNo',   width: 22 },
    { header: '館別',     key: 'warehouse',    width: 12 },
    { header: '部門',     key: 'department',   width: 12 },
    { header: '廠商',     key: 'supplierName', width: 22 },
    { header: '品號',     key: 'productCode',  width: 16 },
    { header: '品名',     key: 'productName',  width: 32 },
    { header: '分類',     key: 'category',     width: 14 },
    { header: '單位',     key: 'unit',         width: 8  },
    { header: '數量',     key: 'quantity',     width: 8,  format: 'number'   },
    { header: '單價',     key: 'unitPrice',    width: 14, format: 'currency' },
    { header: '小計',     key: 'subtotal',     width: 16, format: 'currency' },
    { header: '備註',     key: 'note',         width: 24 },
  ];

  const MONTHLY_EXPORT_COLS = [
    { header: '廠商', key: 'supplierName', width: 22 },
    ...MONTHS.map(m => ({ header: `${m}月`, key: `m${m}`, width: 12, format: 'currency' })),
    { header: '合計', key: 'total', width: 14, format: 'currency' },
  ];

  const monthlyExportData = useMemo(() =>
    monthlyPivot.map(r => ({
      supplierName: r.supplierName,
      ...MONTHS.reduce((acc, m) => { acc[`m${m}`] = r.months[m] || 0; return acc; }, {}),
      total: r.total,
    })),
  [monthlyPivot]);

  const titleLabel = filterMeta.supplierName
    ? `廠商採購明細 — ${filterMeta.supplierName}`
    : '廠商採購明細（全部廠商）';

  function handlePrintDetail() {
    const periodLabel = `${filterMeta.startDate} ～ ${filterMeta.endDate}${filterMeta.warehouse ? ` ／ ${filterMeta.warehouse}` : ''}`;
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.purchaseDate}</td><td>${r.purchaseNo}</td><td>${r.warehouse || ''}</td>
        <td>${r.supplierName}</td><td>${r.productCode}</td><td>${r.productName}</td>
        <td>${r.category || ''}</td><td>${r.unit || ''}</td>
        <td style="text-align:right">${r.quantity.toLocaleString()}</td>
        <td style="text-align:right">NT$ ${Number(r.unitPrice).toLocaleString()}</td>
        <td style="text-align:right">NT$ ${Number(r.subtotal).toLocaleString()}</td>
        <td>${r.note || ''}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel}</title>
<style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:12px}.summary{display:flex;gap:24px;margin-bottom:14px}.kpi{border:1px solid #ddd;border-radius:6px;padding:8px 16px}.kpi-label{font-size:10px;color:#888}.kpi-val{font-size:14px;font-weight:bold}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 7px;white-space:nowrap}th{background:#f5f5f5}tfoot td{background:#f0f0f0;font-weight:bold}@page{size:landscape;margin:15mm}</style>
</head><body>
<h2>${titleLabel}</h2>
<p class="meta">查詢期間：${periodLabel} ／ 列印時間：${new Date().toLocaleString('zh-TW')}</p>
<div class="summary">
  <div class="kpi"><div class="kpi-label">品項筆數</div><div class="kpi-val">${rows.length.toLocaleString()}</div></div>
  <div class="kpi"><div class="kpi-label">總數量</div><div class="kpi-val">${totalQty.toLocaleString()}</div></div>
  <div class="kpi"><div class="kpi-label">採購總金額</div><div class="kpi-val">NT$ ${Number(totalAmount).toLocaleString()}</div></div>
</div>
<table><thead><tr><th>日期</th><th>進貨單號</th><th>館別</th><th>廠商</th><th>品號</th><th>品名</th><th>分類</th><th>單位</th><th>數量</th><th>單價</th><th>小計</th><th>備註</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr><td colspan="8" style="text-align:right">合計</td><td style="text-align:right">${totalQty.toLocaleString()}</td><td></td><td style="text-align:right">NT$ ${Number(totalAmount).toLocaleString()}</td><td></td></tr></tfoot>
</table></body></html>`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  function handlePrintMonthly() {
    const periodLabel = `${filterMeta.startDate} ～ ${filterMeta.endDate}${filterMeta.warehouse ? ` ／ ${filterMeta.warehouse}` : ''}`;
    const bodyRows = monthlyPivot.map(r => `
      <tr>
        <td>${r.supplierName}</td>
        ${MONTHS.map(m => `<td style="text-align:right">${r.months[m] ? Number(r.months[m]).toLocaleString() : ''}</td>`).join('')}
        <td style="text-align:right;font-weight:bold">${Number(r.total).toLocaleString()}</td>
      </tr>`).join('');
    const footRow = `<tr>
      <td style="font-weight:bold">合計</td>
      ${MONTHS.map(m => `<td style="text-align:right;font-weight:bold">${monthlyColTotals[m] ? Number(monthlyColTotals[m]).toLocaleString() : ''}</td>`).join('')}
      <td style="text-align:right;font-weight:bold">${Number(totalAmount).toLocaleString()}</td>
    </tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel} — 月份彙整</title>
<style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;white-space:nowrap}th{background:#f5f5f5;text-align:center}tfoot td{background:#f0f0f0}@page{size:landscape;margin:12mm}</style>
</head><body>
<h2>${titleLabel} — 月份採購金額彙整</h2>
<p class="meta">查詢期間：${periodLabel} ／ 共 ${monthlyPivot.length} 家廠商 ／ 列印時間：${new Date().toLocaleString('zh-TW')}</p>
<table>
<thead><tr><th>廠商／月份</th>${MONTHS.map(m=>`<th>${m}月</th>`).join('')}<th>合計</th></tr></thead>
<tbody>${bodyRows}</tbody>
<tfoot>${footRow}</tfoot>
</table></body></html>`;
    const win = window.open('', '_blank', 'width=1400,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const isMonthly = viewMode === 'monthly';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="品項筆數"   value={rows.length.toLocaleString()} icon="📋" color="text-blue-600" />
        <KpiCard label="總數量"     value={totalQty.toLocaleString()}    icon="📦" color="text-gray-700" />
        <KpiCard label="採購總金額" value={NT(totalAmount)}               icon="💰" color="text-cyan-700" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('detail')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              明細清單
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              月份彙整
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={isMonthly ? handlePrintMonthly : handlePrintDetail}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              列印
            </button>
            <ExportButtons
              data={isMonthly ? monthlyExportData : rows}
              columns={isMonthly ? MONTHLY_EXPORT_COLS : DETAIL_EXPORT_COLS}
              title={isMonthly ? `${titleLabel} — 月份彙整` : titleLabel}
              exportName={isMonthly ? '廠商月份採購彙整' : '廠商採購明細'}
              sheetName={isMonthly ? '月份彙整' : '採購明細'}
            />
          </div>
        </div>

        {!isMonthly && (
          <div className="tbl-wrap">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日期</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">進貨單號</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">館別</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">廠商</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">品號</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">品名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">分類</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">單位</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">數量</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">單價</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">小計</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.purchaseDate}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{r.purchaseNo}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.warehouse || '—'}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r.supplierName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400 whitespace-nowrap">{r.productCode || '—'}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.productName}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{r.category || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{r.unit || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{r.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{NT(r.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900 whitespace-nowrap">{NT(r.subtotal)}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs max-w-[160px] truncate">{r.note || '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">查無符合條件的採購記錄</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold text-sm">
                  <tr>
                    <td colSpan={8} className="px-3 py-2.5 text-right text-gray-700">合計</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{totalQty.toLocaleString()}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-cyan-700">{NT(totalAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {isMonthly && (
          <div className="tbl-wrap">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                    廠商／月份
                  </th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap min-w-[80px]">
                      {m}月
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap bg-cyan-50">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyPivot.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white z-10">
                      {r.supplierName}
                    </td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        {r.months[m] > 0 ? Number(r.months[m]).toLocaleString() : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-bold text-cyan-700 whitespace-nowrap tabular-nums bg-cyan-50">
                      {Number(r.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {monthlyPivot.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">查無符合條件的採購記錄</td></tr>
                )}
              </tbody>
              {monthlyPivot.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">合計</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {monthlyColTotals[m] > 0 ? Number(monthlyColTotals[m]).toLocaleString() : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold text-cyan-700 tabular-nums whitespace-nowrap bg-cyan-50">
                      {Number(totalAmount).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupplierItemsTab({
  warehouses, suppliersFullList,
  spItemsStart, setSpItemsStart,
  spItemsEnd, setSpItemsEnd,
  spItemsWarehouse, setSpItemsWarehouse,
  spItemsSupplierId, setSpItemsSupplierId,
  spItemsLoading, spItems,
  fetchSpItems,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">廠商</label>
            <select id="f-16" value={spItemsSupplierId} onChange={e => setSpItemsSupplierId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[160px]">
              <option value="">全部廠商</option>
              {suppliersFullList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-27" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="f-27" type="date" value={spItemsStart} onChange={e => setSpItemsStart(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-28" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="f-28" type="date" value={spItemsEnd} onChange={e => setSpItemsEnd(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label htmlFor="f-29" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
            <select id="f-29" value={spItemsWarehouse} onChange={e => setSpItemsWarehouse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">全部館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button onClick={fetchSpItems}
            className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
            查詢
          </button>
        </div>
      </div>

      {spItemsLoading ? <Loading text="載入採購明細中..." /> :
        spItems ? (
          <SupplierItemsDataView
            data={spItems}
            filterMeta={{
              supplierName: suppliersFullList.find(s => String(s.id) === String(spItemsSupplierId))?.name || '',
              startDate: spItemsStart,
              endDate: spItemsEnd,
              warehouse: spItemsWarehouse,
            }}
          />
        ) :
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">請選擇廠商及日期區間後按「查詢」</p>
          <p className="text-xs mt-1">可查詢指定廠商在特定期間內的所有採購品項明細</p>
        </div>
      }
    </div>
  );
}
