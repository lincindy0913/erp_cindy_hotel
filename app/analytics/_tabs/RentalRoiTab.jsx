'use client';

import Link from 'next/link';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

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

function RentalRoiDataView({ data }) {
  const sum = data.summary || {};
  const rows = data.properties || [];
  const year = data.year;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="物件數" value={String(sum.totalProperties ?? 0)} color="text-gray-800" icon="🏠" />
        <KpiCard label={`${year} 實收合計`} value={NT(sum.totalIncome)} color="text-emerald-700" icon="💰" />
        <KpiCard label={`${year} 應收合計`} value={NT(sum.totalExpected)} color="text-blue-700" icon="📋" />
        <KpiCard label="整體回收率" value={pct(sum.overallCollectionRate)} color="text-indigo-700" icon="📊" />
        <KpiCard label="平均年度租金回收率（有月租者）" value={pct(sum.avgRoi)} color="text-cyan-700" icon="📐" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">各物件（{year} 年）</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">物件</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">地址／單位</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">月租</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">實收</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">應收</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">年度回收率</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">回收率</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">尚無租賃物件或收入資料</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.name || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-[220px]">
                    {[r.buildingName, r.unitNo, r.address].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{NT(r.monthlyRent)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{NT(r.totalIncome)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{NT(r.expectedIncome)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{pct(r.roi)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct(r.collectionRate)}</td>
                  <td className="px-4 py-2 text-center text-xs text-gray-600">{r.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RentalRoiTab({
  rentalRoiYear, setRentalRoiYear,
  rentalRoiLoading, rentalRoiData,
  fetchRentalRoi,
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="f-23" className="block text-xs text-gray-500 mb-1">會計年度（西元）</label>
          <input id="f-23"
            type="number"
            value={rentalRoiYear}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setRentalRoiYear(Number.isFinite(v) ? v : new Date().getFullYear());
            }}
            min={2000}
            max={2100}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <button type="button" onClick={fetchRentalRoi} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
          查詢
        </button>
        <Link href="/rentals" className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          前往租賃模組 →
        </Link>
      </div>
      <p className="text-xs text-gray-500 px-1">
        依租賃物件、合約月租與當年度每月租金收入紀錄，計算實收、應收與回收率。
        「年度回收率」＝ 年度實收 ÷ 合約月租×12，反映全年收款完成度；「回收率」＝ 實收 ÷ 已登記應收，反映已開單的收款效率。
        若需以取得成本計算真正 ROI，請先在資產管理中維護取得成本後再行擴充。
      </p>
      {rentalRoiLoading ? <Loading text="載入租賃 ROI..." /> :
        rentalRoiData ? <RentalRoiDataView data={rentalRoiData} /> :
        <div className="text-center py-12 text-gray-400">請選擇年度後按「查詢」</div>
      }
    </div>
  );
}
