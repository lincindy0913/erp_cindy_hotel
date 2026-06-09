'use client';

import { formatNum0 as formatNumber } from '@/lib/format-utils';

export const STATUS_BADGES = {
  '未結帳': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  '結帳中': { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  '已結帳': { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  '已鎖定': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
};

export function StatusBadge({ status }) {
  const style = STATUS_BADGES[status] || STATUS_BADGES['未結帳'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
      {status}
    </span>
  );
}

export function renderReportTable(reportType, data) {
  if (!data) return <p className="text-gray-500 text-sm">無資料</p>;

  switch (reportType) {
    case '進貨彙總':
      return (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
            <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
            <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
          </div>
          {data.bySupplier && data.bySupplier.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依廠商</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">廠商</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">金額</th>
                    <th className="text-right p-2 border border-slate-200">稅額</th>
                    <th className="text-right p-2 border border-slate-200">含稅總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySupplier.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200">${formatNumber(row.amount)}</td>
                      <td className="text-right p-2 border border-slate-200">${formatNumber(row.tax)}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.byWarehouse && data.byWarehouse.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">館別</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">金額</th>
                    <th className="text-right p-2 border border-slate-200">稅額</th>
                    <th className="text-right p-2 border border-slate-200">含稅總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byWarehouse.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200">${formatNumber(row.amount)}</td>
                      <td className="text-right p-2 border border-slate-200">${formatNumber(row.tax)}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case '銷貨彙總':
      return (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
            <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
            <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
          </div>
          {data.byStatus && data.byStatus.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依狀態</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">狀態</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStatus.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.byWarehouse && data.byWarehouse.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">館別</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byWarehouse.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case '支出彙總':
      return (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
            <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
            <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
          </div>
          {data.byCategory && data.byCategory.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依類別</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">類別</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCategory.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.byWarehouse && data.byWarehouse.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">館別</th>
                    <th className="text-right p-2 border border-slate-200">筆數</th>
                    <th className="text-right p-2 border border-slate-200">總計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byWarehouse.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200">{row.count}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case '現金流彙總':
      return (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
            <span className="text-gray-600">交易筆數: <strong>{data.totalTransactions}</strong></span>
          </div>
          {data.byAccountType && data.byAccountType.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">依帳戶類型</h4>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200">帳戶類型</th>
                    <th className="text-right p-2 border border-slate-200">收入</th>
                    <th className="text-right p-2 border border-slate-200">支出</th>
                    <th className="text-right p-2 border border-slate-200">移轉</th>
                    <th className="text-right p-2 border border-slate-200">淨額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAccountType.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2 border border-slate-200">{row.name}</td>
                      <td className="text-right p-2 border border-slate-200 text-green-600">${formatNumber(row.income)}</td>
                      <td className="text-right p-2 border border-slate-200 text-red-600">${formatNumber(row.expense)}</td>
                      <td className="text-right p-2 border border-slate-200 text-blue-600">${formatNumber(row.transfer)}</td>
                      <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case '損益快照': {
      const s = data.summary || {};
      const rows = [
        { label: '營業收入', val: s.totalIncome,     color: 'text-blue-700' },
        { label: '收款成本', val: -s.ccFee,          color: 'text-amber-700' },
        { label: '毛利',     val: s.grossProfit,     color: 'text-teal-700',  bold: true },
        { label: '營業費用', val: -s.totalOpExp,     color: 'text-red-700' },
        { label: '營業淨利', val: s.operatingIncome, color: 'text-green-700', bold: true },
        { label: '業外收支', val: s.bizOutsideNet,   color: 'text-purple-700' },
        {
          label: '稅前淨利',
          val: s.netIncome,
          color: s.netIncome >= 0 ? 'text-green-700' : 'text-red-600',
          bold: true,
        },
      ];
      return (
        <div className="space-y-3">
          <div className="text-sm text-gray-500">期間: <strong>{data.period}</strong></div>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="bg-slate-50">
                <th className="text-left p-2 border border-slate-200">項目</th>
                <th className="text-right p-2 border border-slate-200">金額</th>
                <th className="text-right p-2 border border-slate-200">佔收入%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className={r.bold ? 'bg-gray-50' : 'hover:bg-slate-50'}>
                  <td className={`p-2 border border-slate-200 ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                  <td className={`text-right p-2 border border-slate-200 tabular-nums ${r.color} ${r.bold ? 'font-bold' : ''}`}>
                    {r.val != null ? `$${formatNumber(Math.abs(r.val))}` : '—'}
                  </td>
                  <td className="text-right p-2 border border-slate-200 text-gray-400 text-xs">
                    {s.totalIncome
                      ? ((Math.abs(r.val || 0) / s.totalIncome) * 100).toFixed(1) + '%'
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.groups?.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-blue-600 cursor-pointer hover:underline">展開科目明細</summary>
              <table className="w-full text-xs border-collapse mt-2">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="bg-slate-50">
                    <th className="text-left p-1.5 border border-slate-200">層級</th>
                    <th className="text-left p-1.5 border border-slate-200">科目群</th>
                    <th className="text-right p-1.5 border border-slate-200">收入</th>
                    <th className="text-right p-1.5 border border-slate-200">支出</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-1.5 border border-slate-200 text-gray-500">{g.level1}</td>
                      <td className="p-1.5 border border-slate-200">{g.plGroup}</td>
                      <td className="text-right p-1.5 border border-slate-200 text-green-600">
                        {g.income ? `$${formatNumber(g.income)}` : '—'}
                      </td>
                      <td className="text-right p-1.5 border border-slate-200 text-red-600">
                        {g.expense ? `$${formatNumber(g.expense)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      );
    }

    default:
      return (
        <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}
