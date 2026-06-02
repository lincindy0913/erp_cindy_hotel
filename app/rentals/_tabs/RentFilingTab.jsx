'use client';

import { getTenantDisplayName } from '../_lib/rentalHelpers';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

export default function RentFilingTab({
  rentFilingYear, setRentFilingYear,
  rentFilingData, rentFilingLoading,
  fetchRentFiling, seedRentFilingYear,
  openRentFilingModalForNew, openRentFilingModalForEdit, deleteRentFilingRow,
}) {
  return (
    <div>
      <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3 mb-4 text-sm text-teal-900">
        <p><strong>年度租金／租賃所得申報總表</strong>（每年一報）。請註記<strong>公益出租人</strong>以利房屋稅／申報類型區別；同一門牌若有兩間承租公司，請新增第二列並填<strong>承租人／租約綁定</strong>以利實收對照。</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label htmlFor="f-14" className="block text-xs text-gray-500 mb-1">申報／所得年度</label>
          <select id="f-14" value={rentFilingYear} onChange={(e) => setRentFilingYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm">
            {[0, 1, 2, 3].map((d) => {
              const y = new Date().getFullYear() - d;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
        <button type="button" onClick={() => fetchRentFiling()} disabled={rentFilingLoading}
          className="px-4 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50">
          {rentFilingLoading ? '載入…' : '重新整理'}
        </button>
        <button type="button" onClick={() => seedRentFilingYear()} disabled={rentFilingLoading}
          className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          為全部物業建立草稿
        </button>
        <button type="button" onClick={() => openRentFilingModalForNew()}
          className="px-4 py-1.5 text-sm rounded-lg bg-gray-800 text-white hover:bg-gray-900 ml-auto">
          新增申報列
        </button>
      </div>

      <div className="bg-white rounded-xl shadow tbl-wrap mb-4">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 text-teal-900 text-xs sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left">列</th>
              <th className="px-3 py-2 text-left">物業</th>
              <th className="px-3 py-2 text-left">地址</th>
              <th className="px-3 py-2 text-left">所有權人／稅籍</th>
              <th className="px-3 py-2 text-center">公益</th>
              <th className="px-3 py-2 text-left">承租人／抬頭</th>
              <th className="px-3 py-2 text-right">申報月租</th>
              <th className="px-3 py-2 text-center">月數</th>
              <th className="px-3 py-2 text-right">全年申報</th>
              <th className="px-3 py-2 text-right">預估房屋稅</th>
              <th className="px-3 py-2 text-right">當年實收</th>
              <th className="px-3 py-2 text-left">備註</th>
              <th className="px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rentFilingLoading ? (
              <tr><td colSpan={13} className="text-center py-12 text-gray-400">載入中…</td></tr>
            ) : rentFilingData.rows.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-12 text-gray-400">尚無資料，可使用「為全部物業建立草稿」或「新增申報列」</td></tr>
            ) : rentFilingData.rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500">{r.slotIndex + 1}</td>
                <td className="px-3 py-2 font-medium">{r.propertyName}</td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-[140px]" title={r.address || ''}>{r.address || '—'}</td>
                <td className="px-3 py-2 text-xs">
                  <div>{r.ownerName || '—'}</div>
                  <div className="text-gray-400 font-mono">{r.houseTaxRegistrationNo || '—'}</div>
                </td>
                <td className="px-3 py-2 text-center">
                  {r.isPublicInterest ? <span className="text-green-700 font-medium">是</span> : <span className="text-gray-400">否</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{r.lesseeDisplayName || r.contractLesseeName || '—'}</div>
                  {r.contractId && <div className="text-gray-400">租約 #{r.contractId}</div>}
                </td>
                <td className="px-3 py-2 text-right">{r.declaredMonthlyRent != null ? `$${fmt(r.declaredMonthlyRent)}` : '—'}</td>
                <td className="px-3 py-2 text-center">{r.monthsInScope ?? '—'}</td>
                <td className="px-3 py-2 text-right font-medium">{r.declaredAnnualIncome != null ? `$${fmt(r.declaredAnnualIncome)}` : '—'}</td>
                <td className="px-3 py-2 text-right text-amber-800">{r.estimatedHouseTax != null ? `$${fmt(r.estimatedHouseTax)}` : '—'}</td>
                <td className="px-3 py-2 text-right">
                  <span className="text-indigo-700">${fmt(r.actualAnnualIncome)}</span>
                  {r.declaredAnnualIncome != null && r.actualAnnualIncome > 0 && r.declaredAnnualIncome !== r.actualAnnualIncome && (
                    <span className={`block text-xs ${r.actualAnnualIncome > r.declaredAnnualIncome ? 'text-amber-600' : 'text-green-600'}`}>
                      {r.actualAnnualIncome > r.declaredAnnualIncome ? '▲' : '▼'} ${fmt(Math.abs(r.actualAnnualIncome - r.declaredAnnualIncome))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px]">
                  {r.incomeSplitHint && <span className="text-amber-700 block">{r.incomeSplitHint}</span>}
                  {r.note || ''}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <button type="button" className="text-teal-600 hover:underline text-xs mr-2" onClick={() => openRentFilingModalForEdit(r)}>編輯</button>
                  <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => deleteRentFilingRow(r)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
          {rentFilingData.rows.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold text-sm">
              <tr>
                <td colSpan={8} className="px-3 py-2 text-right">合計</td>
                <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.declaredAnnual)}</td>
                <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.estimatedHouseTax)}</td>
                <td className="px-3 py-2 text-right">${fmt(rentFilingData.totals.actualAnnual)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
