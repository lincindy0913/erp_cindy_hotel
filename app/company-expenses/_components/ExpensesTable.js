'use client';

import { sortRows, SortableThInline } from '@/components/SortableTh';
import { fmt, sum } from '../_hooks/useCompanyExpenses';

export default function ExpensesTable({ filteredExpenses, expKey, expDir, expToggle, onEdit, onDelete }) {
  return (
    <>
      <div className="text-sm text-gray-500 mb-2">
        共 {filteredExpenses.length} 筆 ／ 總計 NT$ {sum(filteredExpenses, 'totalAmount').toLocaleString('zh-TW')}
      </div>
      <div className="tbl-wrap">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <SortableThInline label="日期" colKey="expenseDate" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'left' }} />
              <th className="px-3 py-2 text-left">發票號碼</th>
              <th className="px-3 py-2 text-left">廠商名稱</th>
              <th className="px-3 py-2 text-left">品名</th>
              <SortableThInline label="未稅" colKey="amount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
              <SortableThInline label="稅額" colKey="taxAmount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
              <th className="px-3 py-2 text-right">其他</th>
              <SortableThInline label="總計" colKey="totalAmount" sortKey={expKey} sortDir={expDir} onSort={expToggle} thStyle={{ padding: '8px 12px', textAlign: 'right' }} />
              <th className="px-3 py-2 text-left">期間</th>
              <th className="px-3 py-2 text-left">備註</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredExpenses.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">無資料</td></tr>
            ) : sortRows(filteredExpenses, expKey, expDir).map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{row.expenseDate}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{row.invoiceNo}</td>
                <td className="px-3 py-2">{row.vendorName}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{row.itemName}</td>
                <td className="px-3 py-2 text-right">{fmt(row.amount)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{fmt(row.taxAmount)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{fmt(row.otherAmount) === '—' || Number(row.otherAmount) === 0 ? '' : fmt(row.otherAmount)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(row.totalAmount)}</td>
                <td className="px-3 py-2 text-xs text-gray-400">{row.period}</td>
                <td className="px-3 py-2 text-xs text-gray-400 max-w-[150px] truncate">{row.note}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => onEdit(row)} className="text-blue-600 hover:underline text-xs mr-2">編輯</button>
                  <button onClick={() => onDelete(row)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
          {filteredExpenses.length > 0 && (
            <tfoot className="bg-gray-50 font-medium">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-gray-600">合計 {filteredExpenses.length} 筆</td>
                <td className="px-3 py-2 text-right">{sum(filteredExpenses, 'amount').toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{sum(filteredExpenses, 'taxAmount').toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{sum(filteredExpenses, 'otherAmount').toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-blue-700">{sum(filteredExpenses, 'totalAmount').toLocaleString('zh-TW')}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
