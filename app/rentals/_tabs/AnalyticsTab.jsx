'use client';

import Link from 'next/link';
import { todayStr } from '@/lib/localDate';
import { CONTRACT_STATUSES, getContractDisplayStatus } from '../_lib/rentalHelpers';
import StatusBadge from '../_components/StatusBadge';
import { exportToXlsx } from '@/lib/export';
import ExcelBatchImport from '@/components/ExcelBatchImport';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

// ── Excel 匯出工具函式 ──────────────────────────────────────────

async function exportIncomeExcel({ rows, year }) {
  if (!rows?.length) return;
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const columns = [
    { header: '序號',  key: 'idx',   width: 6 },
    { header: '資產編號', key: 'assetNo', width: 8 },
    { header: '房號',  key: 'label', width: 22 },
    ...months.map(m => ({ header: `${m}月`, key: `m${m}`, width: 12, format: 'amount' })),
    { header: '合計',  key: 'total', width: 14, format: 'amount' },
  ];
  const sorted = [
    ...rows.filter(r => !r.isTerminated),
    ...rows.filter(r => r.isTerminated),
  ];
  const data = sorted.map((r, i) => {
    const row = {
      idx:   r.sortOrder ?? (i + 1),
      assetNo: r.sortOrder ?? '',
      label: r.tenantName ? `${r.propertyLabel}(${r.tenantName})` : r.propertyLabel,
      total: r.total || 0,
    };
    months.forEach(m => {
      const st  = r.monthStatus?.[m] || 'empty';
      const act = r.months?.[m] || 0;
      const exp = r.monthsExpected?.[m] || 0;
      if (st === 'completed' || st === 'partial') row[`m${m}`] = act;
      else if (st === 'pending')  row[`m${m}`] = `待收 ${exp.toLocaleString('zh-TW')}`;
      else if (st === 'overdue')  row[`m${m}`] = `逾期 ${exp.toLocaleString('zh-TW')}`;
      else row[`m${m}`] = '';
    });
    return row;
  });
  // 合計列
  const sumRow = { idx: '', assetNo: '', label: '合計', _isSummary: true, total: rows.reduce((s, r) => s + (r.total || 0), 0) };
  months.forEach(m => { sumRow[`m${m}`] = rows.reduce((s, r) => s + (r.months?.[m] || 0), 0) || ''; });
  data.push(sumRow);

  await exportToXlsx({
    filename:  `租屋收入分析_${year}年`,
    sheetName: '收入分析',
    title:     `租屋收入分析報表 — ${year} 年`,
    columns,
    data,
  });
}

function fmtPeriod(startMonth, endMonth) {
  if (!startMonth) return '—';
  return startMonth === endMonth ? `${startMonth}月` : `${startMonth}–${endMonth}月`;
}

async function exportByTenantExcel({ rows, year }) {
  if (!rows?.length) return;
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const columns = [
    { header: '序號',  key: 'idx',    width: 6 },
    { header: '房號',  key: 'label',  width: 22 },
    { header: '租客',  key: 'tenant', width: 16 },
    { header: '期間',  key: 'period', width: 10 },
    ...months.map(m => ({ header: `${m}月`, key: `m${m}`, width: 12, format: 'amount' })),
    { header: '合計',  key: 'total', width: 14, format: 'amount' },
  ];
  const data = rows.map((r, i) => {
    const prev = rows[i - 1];
    const sameAsPrev = prev && prev.propertyId === r.propertyId;
    const row = {
      idx:    sameAsPrev ? '〃' : (r.sortOrder ?? (i + 1)),
      label:  sameAsPrev ? '〃' : r.propertyLabel,
      tenant: r.isCurrent ? r.tenantName : `${r.tenantName}（已退租）`,
      period: fmtPeriod(r.startMonth, r.endMonth),
      total:  r.total || 0,
    };
    months.forEach(m => {
      const st  = r.monthStatus?.[m] || 'empty';
      const act = r.months?.[m] || 0;
      const exp = r.monthsExpected?.[m] || 0;
      if (st === 'completed' || st === 'partial') row[`m${m}`] = act;
      else if (st === 'pending')  row[`m${m}`] = `待收 ${exp.toLocaleString('zh-TW')}`;
      else if (st === 'overdue')  row[`m${m}`] = `逾期 ${exp.toLocaleString('zh-TW')}`;
      else row[`m${m}`] = act > 0 ? act : '';
    });
    return row;
  });
  const sumRow = { idx: '', label: '合計', tenant: '', period: '', _isSummary: true, total: rows.reduce((s, r) => s + (r.total || 0), 0) };
  months.forEach(m => { sumRow[`m${m}`] = rows.reduce((s, r) => s + (r.months?.[m] || 0), 0) || ''; });
  data.push(sumRow);

  await exportToXlsx({
    filename:  `租屋收入_依租客_${year}年`,
    sheetName: '依租客分析',
    title:     `租屋收入分析（依租客）— ${year} 年`,
    columns,
    data,
  });
}

async function exportOperatingExcel({ rows, year }) {
  if (!rows?.length) return;
  const columns = [
    { header: '序號',       key: 'idx',    width: 6 },
    { header: '資產編號',   key: 'assetNo', width: 10 },
    { header: '物業',       key: 'label',  width: 24 },
    { header: '租金實收',   key: 'rent',   width: 14, format: 'amount' },
    { header: '水電實收',   key: 'util',   width: 14, format: 'amount' },
    { header: '維修金額',   key: 'maint',  width: 14, format: 'amount' },
    { header: '房務稅/地價稅', key: 'tax', width: 16, format: 'amount' },
    { header: '總支出',     key: 'exp',    width: 14, format: 'amount' },
    { header: '淨利',       key: 'profit', width: 14, format: 'amount' },
    { header: '淨利率%',   key: 'margin', width: 10 },
  ];
  const data = rows.map((r, i) => ({
    idx:    r.sortOrder ?? (i + 1),
    assetNo: r.sortOrder ?? '',
    label:  r.propertyLabel,
    rent:   r.rentOnly ?? r.rentIncome ?? 0,
    util:   r.utilityIncome || 0,
    maint:  r.maintenanceAmount || 0,
    tax:    r.taxAmount || 0,
    exp:    r.totalExpense || 0,
    profit: r.netProfit || 0,
    margin: r.profitMarginPercent != null ? `${r.profitMarginPercent}%` : '-',
  }));
  const sumRent   = rows.reduce((s, r) => s + (r.rentOnly ?? r.rentIncome ?? 0), 0);
  const sumUtil   = rows.reduce((s, r) => s + (r.utilityIncome || 0), 0);
  const sumMaint  = rows.reduce((s, r) => s + (r.maintenanceAmount || 0), 0);
  const sumTax    = rows.reduce((s, r) => s + (r.taxAmount || 0), 0);
  const sumExp    = rows.reduce((s, r) => s + (r.totalExpense || 0), 0);
  const sumProfit = rows.reduce((s, r) => s + (r.netProfit || 0), 0);
  const sumIncome = sumRent + sumUtil;
  const totalMgn  = sumIncome > 0 ? `${Math.round((sumProfit / sumIncome) * 10000) / 100}%` : '-';
  data.push({ idx: '', assetNo: '', label: '合計', rent: sumRent, util: sumUtil, maint: sumMaint, tax: sumTax, exp: sumExp, profit: sumProfit, margin: totalMgn, _isSummary: true });

  await exportToXlsx({
    filename:  `物業營運分析_${year}年`,
    sheetName: '營運分析',
    title:     `物業營運狀況分析報表 — ${year} 年`,
    columns,
    data,
  });
}

async function exportOverdueExcel({ items }) {
  if (!items?.length) return;
  const today = todayStr();
  const columns = [
    { header: '序號',     key: 'idx',     width: 6 },
    { header: '物業',     key: 'prop',    width: 22 },
    { header: '租客',     key: 'tenant',  width: 16 },
    { header: '聯絡電話', key: 'phone',   width: 16 },
    { header: '租期',     key: 'period',  width: 10 },
    { header: '應收金額', key: 'amount',  width: 14, format: 'amount' },
    { header: '到期日',   key: 'due',     width: 12 },
    { header: '逾期天數', key: 'days',    width: 10 },
  ];
  const data = items.map((i, idx) => ({
    idx:    i.contractSortOrder ?? (idx + 1),
    prop:   i.propertyName,
    tenant: i.tenantName || i.tenant?.companyName || i.tenant?.fullName || '—',
    phone:  i.tenant?.phone || '—',
    period: `${i.incomeYear}/${String(i.incomeMonth).padStart(2, '0')}`,
    amount: Number(i.expectedAmount || 0),
    due:    i.dueDate,
    days:   Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000),
  }));
  const totalAmount = items.reduce((s, i) => s + Number(i.expectedAmount || 0), 0);
  data.push({ idx: '', prop: '合計', tenant: '', phone: '', period: '', amount: totalAmount, due: '', days: '', _isSummary: true });

  await exportToXlsx({
    filename:  `逾期催繳報表_${today}`,
    sheetName: '逾期催繳',
    title:     `逾期租金催繳報表 — ${today}`,
    columns,
    data,
  });
}

async function exportVacancyExcel({ rows, year }) {
  if (!rows?.length) return;
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const columns = [
    { header: '序號',   key: 'idx',     width: 6 },
    { header: '物業',   key: 'label',   width: 22 },
    ...months.map(m => ({ header: `${m}月`, key: `m${m}`, width: 6 })),
    { header: '出租月數', key: 'rentedCount', width: 10 },
    { header: '空置率%',  key: 'vacancy',     width: 10 },
    { header: '平均月租', key: 'avgRent',     width: 12, format: 'amount' },
  ];
  const data = rows.map((r, i) => {
    const row = {
      idx:        i + 1,
      label:      r.propertyLabel,
      rentedCount: r.rentedCount,
      vacancy:    `${r.vacancyRate}%`,
      avgRent:    r.avgRent || 0,
    };
    months.forEach((m, mi) => { row[`m${m}`] = r.monthRented[mi] ? '●出租' : '○空置'; });
    return row;
  });

  await exportToXlsx({
    filename:  `空置率分析_${year}年`,
    sheetName: '空置率',
    title:     `物業空置率分析報表 — ${year} 年`,
    columns,
    data,
  });
}

async function exportDepositExcel({ contracts, depositFilter }) {
  const all = contracts.filter(c => Number(c.depositAmount) > 0);
  const filtered = depositFilter === 'pending_receive' ? all.filter(c => !c.depositReceived)
    : depositFilter === 'received'  ? all.filter(c => c.depositReceived && !c.depositRefunded)
    : depositFilter === 'refunded'  ? all.filter(c => c.depositRefunded)
    : all;
  if (!filtered.length) return;
  const FILTER_LABEL = { all: '全部', pending_receive: '待收押金', received: '已收持有中', refunded: '已退' };
  const columns = [
    { header: '序號',     key: 'idx',      width: 6 },
    { header: '合約號',   key: 'contractNo', width: 16 },
    { header: '物業',     key: 'prop',     width: 22 },
    { header: '租客',     key: 'tenant',   width: 16 },
    { header: '合約期間', key: 'period',   width: 24 },
    { header: '月租',     key: 'rent',     width: 12, format: 'amount' },
    { header: '押金金額', key: 'deposit',  width: 12, format: 'amount' },
    { header: '收款狀態', key: 'received', width: 10 },
    { header: '退款狀態', key: 'refunded', width: 10 },
    { header: '合約狀態', key: 'status',   width: 12 },
  ];
  const data = filtered.map((c, i) => ({
    idx:        i + 1,
    contractNo: c.contractNo,
    prop:       c.propertyName,
    tenant:     c.tenantName,
    period:     `${c.startDate} ~ ${c.endDate}`,
    rent:       Number(c.monthlyRent || 0),
    deposit:    Number(c.depositAmount || 0),
    received:   c.depositReceived ? '已收' : '未收',
    refunded:   c.depositRefunded ? '已退' : c.depositRefundPaymentOrderId ? '待出納' : '—',
    status:     getContractDisplayStatus(c),
  }));
  const total = filtered.reduce((s, c) => s + Number(c.depositAmount || 0), 0);
  data.push({ idx: '', contractNo: '合計', prop: '', tenant: '', period: '', rent: '', deposit: total, received: '', refunded: '', status: '', _isSummary: true });

  await exportToXlsx({
    filename:  `押金追蹤_${FILTER_LABEL[depositFilter] || '全部'}`,
    sheetName: '押金追蹤',
    title:     `租屋押金追蹤 — ${FILTER_LABEL[depositFilter] || '全部'}`,
    columns,
    data,
  });
}

const PAYMENT_METHODS = ['現金', 'transfer', '支票', '匯款'];
const VALID_ANALYTICS_SUB = ['income', 'byTenant', 'operating', 'overdue', 'deposit', 'vacancy'];
const ANALYTICS_SUB_LABELS = [
  { key: 'income',    label: '收入分析' },
  { key: 'byTenant',  label: '依租客分析' },
  { key: 'operating', label: '營運分析' },
  { key: 'overdue',   label: '逾期催繳' },
  { key: 'vacancy',   label: '空置率' },
  { key: 'deposit',   label: '押金追蹤' },
];

export default function AnalyticsTab({
  analyticsSub, switchAnalyticsSub,
  reportYear, setReportYear,
  reportStartDate, setReportStartDate,
  reportEndDate, setReportEndDate,
  reportCategoryFilter, setReportCategoryFilter,
  incomeReportData, operatingReportData, byTenantReportData, reportLoading,
  overdueReportData, overdueReportLoading,
  overdueSelectedIds, setOverdueSelectedIds,
  showOverdueBatch, setShowOverdueBatch,
  overdueBatchForm, setOverdueBatchForm, overdueBatchSaving,
  overdueBatchProgress, overdueBatchAbortRef,
  quickPayIncome, setQuickPayIncome,
  quickPayForm, setQuickPayForm, quickPaySaving,
  vacancyYear, setVacancyYear, vacancyData, vacancyLoading,
  depositFilter, setDepositFilter,
  fetchIncomeReport, fetchOperatingReport, fetchByTenantReport, fetchOverdueReport, fetchVacancyReport,
  openQuickPay, confirmQuickPay, batchConfirmOverdueIncomes,
  contracts, handleDepositAction,
  accounts, reportCategoryOptions,
  switchTab,
}) {
  return (
    <div>
      <div className="no-print flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
        {ANALYTICS_SUB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchAnalyticsSub(key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
              analyticsSub === key
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {analyticsSub === 'income' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-18" className="text-sm">年份：</label>
            <select id="f-18" value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">或</span>
            <label htmlFor="f-96" className="text-sm">日期區間：</label>
            <input id="f-96" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <span className="text-sm">～</span>
            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <label htmlFor="f-77" className="text-sm">類別：</label>
            <select id="f-77" value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {reportCategoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={fetchIncomeReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
            <button
              onClick={() => exportIncomeExcel({ rows: incomeReportData.rows, year: incomeReportData.year || reportYear })}
              disabled={reportLoading || !incomeReportData.rows?.length}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 no-print flex items-center gap-1"
            >
              ↓ Excel
            </button>
            <ExcelBatchImport
              title="租屋收款批次確認"
              hint="批次確認已到期的租金收款。合約號需與系統一致，年月需有待收記錄。"
              columns={[
                { key: 'contractNo',    header: '合約號',    example: 'RC-20240101', required: true,  width: 18 },
                { key: 'year',          header: '年',        example: String(new Date().getFullYear()), required: true, width: 8 },
                { key: 'month',         header: '月',        example: String(new Date().getMonth() + 1), required: true, width: 6 },
                { key: 'amount',        header: '收款金額',  example: '15000',       required: true,  width: 12 },
                { key: 'actualDate',    header: '收款日期',  example: todayStr(),    required: true,  width: 14, note: 'YYYY-MM-DD' },
                { key: 'paymentMethod', header: '付款方式',  example: '匯款',        required: false, width: 10, note: '現金/匯款/轉帳' },
                { key: 'accountName',   header: '收款帳戶',  example: '玉山銀行',    required: false, width: 14 },
              ]}
              onImport={async rows => {
                const res = await fetch('/api/rentals/income/import-excel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rows }),
                });
                const json = await res.json();
                if (res.ok) { fetchIncomeReport(); return json; }
                throw new Error(json.error || '匯入失敗');
              }}
            />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">租屋收入分析報表 — {incomeReportData.year || reportYear} 年</h2>
          {reportLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : (
            <div className="bg-white rounded-lg shadow tbl-wrap overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                    <th className="text-center px-2 py-2 border border-gray-200 w-12 text-gray-500">資產編號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">房號</th>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <th key={m} className="text-right px-2 py-2 border border-gray-200 whitespace-nowrap">{incomeReportData.year || reportYear}/{m}</th>
                    ))}
                    <th className="text-right px-3 py-2 border border-gray-200 font-semibold">總和</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeReportData.rows.length === 0 ? (
                    <tr><td colSpan={16} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                  ) : (
                    (() => {
                      const sorted = [
                        ...incomeReportData.rows.filter(r => !r.isTerminated),
                        ...incomeReportData.rows.filter(r => r.isTerminated),
                      ];
                      return sorted.map((r, idx) => (
                      <tr key={r.propertyId} className={r.isTerminated ? 'bg-gray-50/60 opacity-70' : 'hover:bg-gray-50'}>
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{r.sortOrder ?? (idx + 1)}</td>
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-500">{r.sortOrder ?? '—'}</td>
                        <td className="px-3 py-2 border border-gray-200">
                          {r.tenantName ? `${r.propertyLabel}(${r.tenantName})` : r.propertyLabel}
                          {r.isTerminated && <span className="ml-2 text-xs text-gray-400">（已退租）</span>}
                        </td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const st = r.monthStatus?.[m] || 'empty';
                          const actual = r.months[m] || 0;
                          const expected = r.monthsExpected?.[m] || 0;
                          const isSplit = !!r.monthsSplit?.[m];
                          const isReceivedNoExpect = (st === 'partial' || st === 'completed') && expected === 0 && actual > 0;
                          const cellBg = isSplit                          ? 'bg-teal-50 text-teal-700'
                            : isReceivedNoExpect                          ? 'bg-green-50 text-green-700'
                            : st === 'completed'                          ? 'bg-green-50 text-green-800'
                            : st === 'partial'                            ? 'bg-orange-50 text-orange-800'
                            : st === 'overdue'                            ? 'bg-red-50 text-red-700'
                            : st === 'pending'                            ? 'bg-yellow-50 text-yellow-800'
                            : '';
                          return (
                            <td key={m} className={`text-right px-2 py-2 border border-gray-200 align-top ${cellBg}`}>
                              {isSplit && (
                                <div>
                                  <div className="font-medium">{fmt(actual)}</div>
                                  <div className="text-xs opacity-60">分攤</div>
                                </div>
                              )}
                              {!isSplit && isReceivedNoExpect && (
                                <div>
                                  <div className="font-medium">{fmt(actual)}</div>
                                  <div className="text-xs opacity-60">已收</div>
                                </div>
                              )}
                              {!isSplit && !isReceivedNoExpect && st === 'completed' && <div className="font-medium">{fmt(actual)}</div>}
                              {!isSplit && !isReceivedNoExpect && st === 'partial' && (
                                <div>
                                  <div className="font-medium">{fmt(actual)}</div>
                                  <div className="text-xs opacity-60">應收 {fmt(expected)}</div>
                                </div>
                              )}
                              {(st === 'pending' || st === 'overdue') && (
                                <div>
                                  <div className="text-xs font-semibold">{st === 'overdue' ? '逾期' : '待收'}</div>
                                  <div className="text-xs">{fmt(expected)}</div>
                                </div>
                              )}
                              {st === 'empty' && ''}
                            </td>
                          );
                        })}
                        <td className="text-right px-3 py-2 border border-gray-200 font-semibold">{fmt(r.total)}</td>
                      </tr>
                    ));
                    })()
                  )}
                </tbody>
                {incomeReportData.rows.length > 0 && (() => {
                  const rows = incomeReportData.rows;
                  const grandTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
                  return (
                    <tfoot className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-300">
                      <tr>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-3 py-2 border border-gray-200 text-teal-800">合計</td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const sum = rows.reduce((s, r) => s + (r.months?.[m] || 0), 0);
                          return <td key={m} className="text-right px-2 py-2 border border-gray-200 text-teal-800">{sum > 0 ? fmt(sum) : ''}</td>;
                        })}
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-900">{fmt(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
          {!reportLoading && incomeReportData.rows.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 text-xs no-print">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />已收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-teal-200" />分攤</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-200" />部分收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-200" />待收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200" />逾期未收</span>
            </div>
          )}
        </div>
      )}

      {analyticsSub === 'byTenant' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-bt-y" className="text-sm">年份：</label>
            <select id="f-bt-y" value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">或</span>
            <label htmlFor="f-bt-s" className="text-sm">日期區間：</label>
            <input id="f-bt-s" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <span className="text-sm">～</span>
            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <label htmlFor="f-bt-c" className="text-sm">類別：</label>
            <select id="f-bt-c" value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {reportCategoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={fetchByTenantReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
            <button
              onClick={() => exportByTenantExcel({ rows: byTenantReportData.rows, year: byTenantReportData.year || reportYear })}
              disabled={reportLoading || !byTenantReportData.rows?.length}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 no-print flex items-center gap-1"
            >
              ↓ Excel
            </button>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-1 print:block">租屋收入分析（依租客）— {byTenantReportData.year || reportYear} 年</h2>
          <p className="text-xs text-gray-500 mb-3 no-print">同一物業若年度內換過租客，會分列顯示各租客的承租期間與各月實收。租客以收款紀錄產生當下為準。</p>
          {reportLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : (
            <div className="bg-white rounded-lg shadow tbl-wrap overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">房號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">租客</th>
                    <th className="text-center px-2 py-2 border border-gray-200 whitespace-nowrap">期間</th>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                      <th key={m} className="text-right px-2 py-2 border border-gray-200 whitespace-nowrap">{byTenantReportData.year || reportYear}/{m}</th>
                    ))}
                    <th className="text-right px-3 py-2 border border-gray-200 font-semibold">總和</th>
                  </tr>
                </thead>
                <tbody>
                  {byTenantReportData.rows.length === 0 ? (
                    <tr><td colSpan={17} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                  ) : (
                    byTenantReportData.rows.map((r, idx) => {
                      const prev = byTenantReportData.rows[idx - 1];
                      const sameAsPrev = prev && prev.propertyId === r.propertyId;
                      return (
                        <tr key={r.key} className={`hover:bg-gray-50 ${sameAsPrev ? '' : 'border-t-2 border-teal-100'}`}>
                          <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-500">{sameAsPrev ? <span className="text-gray-300">〃</span> : (r.sortOrder ?? (idx + 1))}</td>
                          <td className="px-3 py-2 border border-gray-200">{sameAsPrev ? <span className="text-gray-300">〃</span> : r.propertyLabel}</td>
                          <td className="px-3 py-2 border border-gray-200">
                            {r.tenantName}
                            {!r.isCurrent && <span className="ml-2 text-xs text-gray-400">（已退租）</span>}
                          </td>
                          <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-600 whitespace-nowrap">{fmtPeriod(r.startMonth, r.endMonth)}</td>
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                            const st = r.monthStatus?.[m] || 'empty';
                            const actual = r.months[m] || 0;
                            const expected = r.monthsExpected?.[m] || 0;
                            const isSplit = !!r.monthsSplit?.[m];
                            const isReceivedNoExpect = (st === 'partial' || st === 'completed') && expected === 0 && actual > 0;
                            const cellBg = isSplit                          ? 'bg-teal-50 text-teal-700'
                              : isReceivedNoExpect                          ? 'bg-green-50 text-green-700'
                              : st === 'completed'                          ? 'bg-green-50 text-green-800'
                              : st === 'partial'                            ? 'bg-orange-50 text-orange-800'
                              : st === 'overdue'                            ? 'bg-red-50 text-red-700'
                              : st === 'pending'                            ? 'bg-yellow-50 text-yellow-800'
                              : (actual > 0 ? 'bg-green-50 text-green-700' : '');
                            return (
                              <td key={m} className={`text-right px-2 py-2 border border-gray-200 align-top ${cellBg}`}>
                                {isSplit && (
                                  <div>
                                    <div className="font-medium">{fmt(actual)}</div>
                                    <div className="text-xs opacity-60">分攤</div>
                                  </div>
                                )}
                                {!isSplit && (st === 'completed' || isReceivedNoExpect) && <div className="font-medium">{fmt(actual)}</div>}
                                {!isSplit && !isReceivedNoExpect && st === 'partial' && (
                                  <div>
                                    <div className="font-medium">{fmt(actual)}</div>
                                    <div className="text-xs opacity-60">應收 {fmt(expected)}</div>
                                  </div>
                                )}
                                {(st === 'pending' || st === 'overdue') && (
                                  <div>
                                    <div className="text-xs font-semibold">{st === 'overdue' ? '逾期' : '待收'}</div>
                                    <div className="text-xs">{fmt(expected)}</div>
                                  </div>
                                )}
                                {st === 'empty' && actual > 0 && <div className="font-medium">{fmt(actual)}</div>}
                              </td>
                            );
                          })}
                          <td className="text-right px-3 py-2 border border-gray-200 font-semibold">{fmt(r.total)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {byTenantReportData.rows.length > 0 && (() => {
                  const rows = byTenantReportData.rows;
                  const grandTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
                  return (
                    <tfoot className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-300">
                      <tr>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-3 py-2 border border-gray-200 text-teal-800" colSpan={3}>合計</td>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const sum = rows.reduce((s, r) => s + (r.months?.[m] || 0), 0);
                          return <td key={m} className="text-right px-2 py-2 border border-gray-200 text-teal-800">{sum > 0 ? fmt(sum) : ''}</td>;
                        })}
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-900">{fmt(grandTotal)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
          {!reportLoading && byTenantReportData.rows.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 text-xs no-print">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />已收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-teal-200" />分攤</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-orange-200" />部分收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-200" />待收</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200" />逾期未收</span>
            </div>
          )}
        </div>
      )}

      {analyticsSub === 'operating' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <label htmlFor="f-19" className="text-sm">年份：</label>
            <select id="f-19" value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-gray-400 text-xs">或</span>
            <label htmlFor="f-97" className="text-sm">日期區間：</label>
            <input id="f-97" type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <span className="text-sm">～</span>
            <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
            <label htmlFor="f-78" className="text-sm">類別：</label>
            <select id="f-78" value={reportCategoryFilter} onChange={e => setReportCategoryFilter(e.target.value)} className="border rounded px-2 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {reportCategoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button onClick={fetchOperatingReport} disabled={reportLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
            <button
              onClick={() => exportOperatingExcel({ rows: operatingReportData.rows, year: operatingReportData.year || reportYear })}
              disabled={reportLoading || !operatingReportData.rows?.length}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 no-print flex items-center gap-1"
            >
              ↓ Excel
            </button>
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2 print:block">物業營運狀況分析報表 — {operatingReportData.year || reportYear} 年</h2>
          <p className="text-sm text-gray-600 mb-2 no-print">收租金額、維修、房務稅/地價稅等支出，淨利與淨利率（投報率需物業成本，可於設定中維護後顯示）。</p>
          {reportLoading ? (
            <p className="text-gray-500">載入中...</p>
          ) : (
            <div className="bg-white rounded-lg shadow tbl-wrap">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                    <th className="text-center px-2 py-2 border border-gray-200 w-12 text-gray-500">資產編號</th>
                    <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                    <th className="text-right px-3 py-2 border border-gray-200">租金實收</th>
                    <th className="text-right px-3 py-2 border border-gray-200">水電實收</th>
                    <th className="text-right px-3 py-2 border border-gray-200">維修金額</th>
                    <th className="text-right px-3 py-2 border border-gray-200">房務稅/地價稅</th>
                    <th className="text-right px-3 py-2 border border-gray-200">總支出</th>
                    <th className="text-right px-3 py-2 border border-gray-200">淨利</th>
                    <th className="text-right px-3 py-2 border border-gray-200">淨利率 %</th>
                  </tr>
                </thead>
                <tbody>
                  {operatingReportData.rows.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-4 text-gray-500 text-center">尚無資料</td></tr>
                  ) : (
                    operatingReportData.rows.map((r, idx) => (
                      <tr key={r.propertyId} className="hover:bg-gray-50">
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{r.sortOrder ?? (idx + 1)}</td>
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-500">{r.sortOrder ?? '—'}</td>
                        <td className="px-3 py-2 border border-gray-200">{r.propertyLabel}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.rentOnly ?? r.rentIncome)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{r.utilityIncome > 0 ? fmt(r.utilityIncome) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.maintenanceAmount)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.taxAmount)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{fmt(r.totalExpense)}</td>
                        <td className={`text-right px-3 py-2 border border-gray-200 font-medium ${r.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(r.netProfit)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200">{r.profitMarginPercent != null ? `${r.profitMarginPercent}%` : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {operatingReportData.rows.length > 0 && (() => {
                  const rows = operatingReportData.rows;
                  const sumRent     = rows.reduce((s, r) => s + (r.rentOnly ?? r.rentIncome ?? 0), 0);
                  const sumUtility  = rows.reduce((s, r) => s + (r.utilityIncome || 0), 0);
                  const sumMaint    = rows.reduce((s, r) => s + (r.maintenanceAmount || 0), 0);
                  const sumTax      = rows.reduce((s, r) => s + (r.taxAmount || 0), 0);
                  const sumExpense  = rows.reduce((s, r) => s + (r.totalExpense || 0), 0);
                  const sumProfit   = rows.reduce((s, r) => s + (r.netProfit || 0), 0);
                  const sumIncome   = sumRent + sumUtility;
                  const totalMargin = sumIncome > 0 ? Math.round((sumProfit / sumIncome) * 10000) / 100 : null;
                  return (
                    <tfoot className="bg-teal-50 font-semibold text-sm border-t-2 border-teal-300">
                      <tr>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-2 py-2 border border-gray-200 text-center text-xs text-gray-500">—</td>
                        <td className="px-3 py-2 border border-gray-200 text-teal-800">合計</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumRent)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{sumUtility > 0 ? fmt(sumUtility) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumMaint)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumTax)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{fmt(sumExpense)}</td>
                        <td className={`text-right px-3 py-2 border border-gray-200 ${sumProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(sumProfit)}</td>
                        <td className="text-right px-3 py-2 border border-gray-200 text-teal-800">{totalMargin != null ? `${totalMargin}%` : '-'}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
        </div>
      )}

      {analyticsSub === 'overdue' && (
        <div className="rental-report-print-area">
          <div className="no-print flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="text-base font-semibold text-gray-800">逾期租金催繳報表</h3>
            <span className="text-sm text-gray-500">（所有到期日已過、尚未收款的租金）</span>
            <button onClick={fetchOverdueReport} disabled={overdueReportLoading}
              className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50 ml-auto">
              {overdueReportLoading ? '載入中…' : '重新整理'}
            </button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800">列印</button>
            <button
              onClick={() => exportOverdueExcel({ items: overdueReportData })}
              disabled={overdueReportLoading || !overdueReportData?.length}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 no-print flex items-center gap-1"
            >
              ↓ Excel
            </button>
          </div>
          <h2 className="hidden print:block text-lg font-bold mb-2">逾期租金催繳報表 — 列印日期：{new Date().toLocaleDateString('zh-TW')}</h2>

          {overdueReportLoading ? (
            <p className="text-gray-500 py-6 text-center">載入中…</p>
          ) : overdueReportData.length === 0 ? (
            <div className="bg-white rounded-lg shadow py-12 text-center text-gray-400">
              目前沒有逾期未收的租金
            </div>
          ) : (
            <>
              <div className="no-print flex flex-wrap gap-3 mb-3 items-center text-sm">
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg font-medium">
                  共 {overdueReportData.length} 筆逾期
                </span>
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">
                  逾期總金額：<b>${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</b>
                </span>
                {overdueSelectedIds.size > 0 && (
                  <button onClick={() => setShowOverdueBatch(true)}
                    className="ml-auto px-4 py-1.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700">
                    批次收款（{overdueSelectedIds.size} 筆）
                  </button>
                )}
              </div>

              {/* 批次收款 panel */}
              {showOverdueBatch && (
                <div className="no-print mb-3 bg-teal-50 border border-teal-200 rounded-xl p-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label htmlFor="f-20" className="text-xs text-gray-600 block mb-1">收款日期 *</label>
                      <input id="f-20" type="date" value={overdueBatchForm.actualDate}
                        onChange={e => setOverdueBatchForm(f => ({ ...f, actualDate: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-21" className="text-xs text-gray-600 block mb-1">收款帳戶 *</label>
                      <select id="f-21" value={overdueBatchForm.accountId}
                        onChange={e => {
                          const acct = accounts.find(a => String(a.id) === e.target.value);
                          const autoMethod = acct?.type === '現金' ? '現金' : acct?.type === '銀行存款' ? '匯款' : null;
                          setOverdueBatchForm(f => ({ ...f, accountId: e.target.value, ...(autoMethod ? { paymentMethod: autoMethod } : {}) }));
                        }}
                        className="border rounded px-2 py-1.5 text-sm min-w-[160px]">
                        <option value="">-- 選擇帳戶 --</option>
                        {accounts.filter(a => a.isActive !== false).map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-79" className="text-xs text-gray-600 block mb-1">付款方式</label>
                      <select id="f-79" value={overdueBatchForm.paymentMethod}
                        onChange={e => setOverdueBatchForm(f => ({ ...f, paymentMethod: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm">
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m === 'transfer' ? '轉帳' : m}</option>)}
                      </select>
                    </div>
                    <button onClick={batchConfirmOverdueIncomes} disabled={overdueBatchSaving}
                      className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                      {overdueBatchSaving && overdueBatchProgress ? `${overdueBatchProgress.done}/${overdueBatchProgress.total}` : overdueBatchSaving ? '處理中…' : `確認收款 ${overdueSelectedIds.size} 筆`}
                    </button>
                    {overdueBatchSaving && overdueBatchProgress
                      ? <button onClick={() => { overdueBatchAbortRef.current = true; }} className="text-xs text-red-500 hover:underline self-center">中止</button>
                      : <button onClick={() => { setShowOverdueBatch(false); setOverdueSelectedIds(new Set()); }}
                          className="text-xs text-gray-500 hover:text-gray-700">取消</button>
                    }
                    {overdueBatchSaving && overdueBatchProgress && (
                      <div className="w-full mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>已完成 {overdueBatchProgress.done}/{overdueBatchProgress.total}{overdueBatchProgress.failed > 0 && <span className="text-red-500 ml-1.5">失敗 {overdueBatchProgress.failed}</span>}</span>
                          <span>{Math.round(overdueBatchProgress.done / overdueBatchProgress.total * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 transition-all duration-200"
                            style={{ width: `${overdueBatchProgress.done / overdueBatchProgress.total * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg shadow tbl-wrap">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-red-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 no-print">
                        <input type="checkbox"
                          checked={overdueSelectedIds.size === overdueReportData.length && overdueReportData.length > 0}
                          onChange={e => setOverdueSelectedIds(e.target.checked ? new Set(overdueReportData.map(i => i.id)) : new Set())} />
                      </th>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                      <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                      <th className="text-left px-3 py-2 border border-gray-200">租客</th>
                      <th className="text-left px-3 py-2 border border-gray-200">聯絡電話</th>
                      <th className="text-center px-3 py-2 border border-gray-200">租期</th>
                      <th className="text-right px-3 py-2 border border-gray-200">應收金額</th>
                      <th className="text-center px-3 py-2 border border-gray-200">到期日</th>
                      <th className="text-right px-3 py-2 border border-gray-200 text-red-700">逾期天數</th>
                      <th className="text-center px-3 py-2 border border-gray-200 no-print">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueReportData.map((i, idx) => {
                      const today = todayStr();
                      const daysOverdue = Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000);
                      const tenantPhone = i.tenant?.phone || '—';
                      const tenantName = i.tenantName || (i.tenant?.tenantType === 'company' ? i.tenant?.companyName : i.tenant?.fullName) || '—';
                      return (
                        <tr key={i.id} className={`border-t ${overdueSelectedIds.has(i.id) ? 'bg-teal-50' : idx % 2 === 0 ? 'bg-white' : 'bg-red-50/30'}`}>
                          <td className="text-center px-2 py-2 border border-gray-200 no-print">
                            <input type="checkbox" checked={overdueSelectedIds.has(i.id)}
                              onChange={e => setOverdueSelectedIds(prev => { const n = new Set(prev); e.target.checked ? n.add(i.id) : n.delete(i.id); return n; })} />
                          </td>
                          <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{i.contractSortOrder ?? (idx + 1)}</td>
                          <td className="px-3 py-2 border border-gray-200">{i.propertyName}</td>
                          <td className="px-3 py-2 border border-gray-200 font-medium">{tenantName}</td>
                          <td className="px-3 py-2 border border-gray-200 text-gray-600">{tenantPhone}</td>
                          <td className="px-3 py-2 border border-gray-200 text-center text-gray-500">{i.incomeYear}/{String(i.incomeMonth).padStart(2,'0')}</td>
                          <td className="px-3 py-2 border border-gray-200 text-right font-medium">${fmt(i.expectedAmount)}</td>
                          <td className="px-3 py-2 border border-gray-200 text-center">{i.dueDate}</td>
                          <td className="px-3 py-2 border border-gray-200 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${daysOverdue > 30 ? 'bg-red-200 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                              {daysOverdue} 天
                            </span>
                          </td>
                          <td className="px-3 py-2 border border-gray-200 text-center no-print">
                            <button onClick={() => openQuickPay(i)}
                              className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">
                              收款
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-red-100 font-semibold">
                      <td className="px-3 py-2 border border-gray-200" colSpan={5}>合計</td>
                      <td className="px-3 py-2 border border-gray-200 text-right text-red-700">${fmt(overdueReportData.reduce((s, i) => s + Number(i.expectedAmount || 0), 0))}</td>
                      <td className="px-3 py-2 border border-gray-200" colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {analyticsSub === 'deposit' && (() => {
        const depositContracts = contracts.filter(c => Number(c.depositAmount) > 0);
        const filtered = depositFilter === 'all' ? depositContracts
          : depositFilter === 'pending_receive' ? depositContracts.filter(c => !c.depositReceived)
          : depositFilter === 'received' ? depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
          : depositFilter === 'refunded' ? depositContracts.filter(c => c.depositRefunded)
          : depositContracts;
        const totalHeld = depositContracts.filter(c => c.depositReceived && !c.depositRefunded)
          .reduce((s, c) => s + Number(c.depositAmount || 0), 0);
        const pendingReceive = depositContracts.filter(c => !c.depositReceived).length;
        const pendingRefund = depositContracts.filter(c => c.depositRefundPaymentOrderId && !c.depositRefunded).length;
        return (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                <p className="text-xs text-gray-500">合約筆數</p>
                <p className="text-xl font-bold text-teal-700">{depositContracts.length}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                <p className="text-xs text-gray-500">目前持有押金</p>
                <p className="text-xl font-bold text-green-700">${fmt(totalHeld)}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-blue-500">
                <p className="text-xs text-gray-500">待收押金</p>
                <p className="text-xl font-bold text-blue-700">{pendingReceive} 筆</p>
              </div>
              <div className="bg-white rounded-lg shadow p-3 border-l-4 border-orange-500">
                <p className="text-xs text-gray-500">待退押金（已申請）</p>
                <p className="text-xl font-bold text-orange-700">{pendingRefund} 筆</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              {[['all', '全部'], ['pending_receive', '待收押金'], ['received', '已收持有中'], ['refunded', '已退']].map(([v, l]) => (
                <button key={v} onClick={() => setDepositFilter(v)}
                  className={`text-sm px-3 py-1 rounded-full border ${depositFilter === v ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => exportDepositExcel({ contracts, depositFilter })}
                  disabled={!contracts?.filter(c => Number(c.depositAmount) > 0).length}
                  className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1"
                >
                  ↓ Excel
                </button>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow tbl-wrap">
              <table className="w-full text-sm">
                <thead className="bg-teal-50 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-2 py-2 w-8 text-gray-500">序號</th>
                    <th className="text-left px-3 py-2">合約號</th>
                    <th className="text-left px-3 py-2">物業</th>
                    <th className="text-left px-3 py-2">租客</th>
                    <th className="text-left px-3 py-2">合約期間</th>
                    <th className="text-right px-3 py-2">月租</th>
                    <th className="text-right px-3 py-2">押金金額</th>
                    <th className="text-center px-3 py-2">收款</th>
                    <th className="text-center px-3 py-2">退款</th>
                    <th className="text-center px-3 py-2">合約狀態</th>
                    <th className="text-center px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-8 text-gray-400">暫無資料</td></tr>
                  ) : filtered.map((c, idx) => (
                    <tr key={c.id} className={`border-t hover:bg-gray-50 ${!c.depositReceived ? 'bg-blue-50/30' : c.depositRefunded ? 'bg-gray-50' : ''}`}>
                      <td className="text-center px-2 py-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.contractNo}</td>
                      <td className="px-3 py-2">{c.propertyName}</td>
                      <td className="px-3 py-2">{c.tenantName}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{c.startDate} ~ {c.endDate}</td>
                      <td className="px-3 py-2 text-right">${fmt(c.monthlyRent)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-teal-700">${fmt(c.depositAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        {c.depositReceived
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">已收</span>
                          : <button onClick={() => handleDepositAction(c.id, 'depositReceive')} className="text-xs text-blue-600 hover:underline">收押金</button>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.depositRefunded
                          ? <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">已退</span>
                          : c.depositRefundPaymentOrderId
                            ? <Link href="/cashier" className="text-xs text-teal-600 hover:underline">待出納</Link>
                            : c.depositReceived
                              ? <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline">退押金</button>
                              : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge value={getContractDisplayStatus(c)} list={CONTRACT_STATUSES} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => { switchTab('contracts'); }} className="text-xs text-teal-600 hover:underline">查看合約</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-teal-50 font-semibold">
                      <td colSpan={6} className="px-3 py-2 text-sm">合計</td>
                      <td className="px-3 py-2 text-right text-teal-700">${fmt(filtered.reduce((s, c) => s + Number(c.depositAmount || 0), 0))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        );
      })()}

      {analyticsSub === 'vacancy' && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
            <label htmlFor="f-22" className="text-sm">年份：</label>
            <select id="f-22" value={vacancyYear} onChange={e => setVacancyYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button onClick={fetchVacancyReport} disabled={vacancyLoading} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700 disabled:opacity-50">查詢</button>
            <button onClick={() => window.print()} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-800 no-print">列印</button>
            <button
              onClick={() => exportVacancyExcel({ rows: vacancyData.rows, year: vacancyYear })}
              disabled={vacancyLoading || !vacancyData.rows?.length}
              className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700 disabled:opacity-40 no-print flex items-center gap-1"
            >
              ↓ Excel
            </button>
          </div>

          {vacancyLoading ? (
            <p className="text-gray-500 text-center py-8">載入中…</p>
          ) : (
            <>
              {vacancyData.rows.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
                    <p className="text-xs text-gray-500">物業總數</p>
                    <p className="text-xl font-bold text-teal-700">{vacancyData.rows.length}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
                    <p className="text-xs text-gray-500">全年出租</p>
                    <p className="text-xl font-bold text-green-700">{vacancyData.fullyRented} 間</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-3 border-l-4 border-red-500">
                    <p className="text-xs text-gray-500">平均空置率</p>
                    <p className="text-xl font-bold text-red-700">{vacancyData.avgVacancy}%</p>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg shadow tbl-wrap">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-teal-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-center px-2 py-2 border border-gray-200 w-8 text-gray-500">序號</th>
                      <th className="text-left px-3 py-2 border border-gray-200">物業</th>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <th key={m} className="text-center px-2 py-2 border border-gray-200 text-xs w-10">{m}月</th>
                      ))}
                      <th className="text-right px-3 py-2 border border-gray-200">出租月數</th>
                      <th className="text-right px-3 py-2 border border-gray-200 text-red-700">空置率</th>
                      <th className="text-right px-3 py-2 border border-gray-200">平均月租</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacancyData.rows.length === 0 ? (
                      <tr><td colSpan={17} className="text-center py-8 text-gray-400">暫無資料，請點擊查詢</td></tr>
                    ) : vacancyData.rows.map((r, idx) => (
                      <tr key={r.propertyId} className="hover:bg-gray-50">
                        <td className="text-center px-2 py-2 border border-gray-200 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 border border-gray-200 font-medium">{r.propertyLabel}</td>
                        {r.monthRented.map((rented, idx) => (
                          <td key={idx} className={`border border-gray-200 text-center text-xs ${rented ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-400'}`}>
                            {rented ? '●' : '○'}
                          </td>
                        ))}
                        <td className="px-3 py-2 border border-gray-200 text-right font-semibold">{r.rentedCount}</td>
                        <td className={`px-3 py-2 border border-gray-200 text-right font-bold ${r.vacancyRate === 0 ? 'text-green-600' : r.vacancyRate >= 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {r.vacancyRate}%
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-right text-gray-600">
                          {r.avgRent > 0 ? `$${fmt(r.avgRent)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vacancyData.rows.length > 0 && (
                <div className="flex gap-4 mt-2 text-xs no-print">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200" />出租中</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100" />空置</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
