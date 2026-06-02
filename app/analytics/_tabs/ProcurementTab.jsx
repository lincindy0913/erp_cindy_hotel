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

const Bar = ({ value, max, color = 'bg-cyan-500' }) => {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
    </div>
  );
};

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function SupplierRiskView({ data }) {
  const maxAmt = data.suppliers?.[0]?.amount || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="採購總額" value={NT(data.totalAmount)} color="text-gray-800" icon="🛒" />
        <KpiCard label="供應商數量" value={data.supplierCount ?? 0} color="text-blue-600" icon="🏢"
          sub={`建議 ≥ 15 家`} />
        <KpiCard label="Top 1 集中度" value={pct(data.top1Concentration)}
          color={(data.top1Concentration || 0) > 20 ? 'text-red-600' : 'text-emerald-600'} icon="⚠️"
          sub="門檻 20%" />
        <KpiCard label="Top 3 集中度" value={pct(data.top3Concentration)}
          color={(data.top3Concentration || 0) > 50 ? 'text-orange-600' : 'text-emerald-600'} icon="📋"
          sub={`HHI: ${(data.hhiIndex || 0).toFixed(4)}`} />
      </div>

      {data.risks?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 mb-2">風險警示</p>
          {data.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${r.severity === 'high' ? 'bg-red-100 text-red-700' : r.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.severity}</span>
              <p className="text-sm text-amber-700">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">供應商採購佔比</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">排名</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">供應商</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">採購金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">佔比</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.suppliers || []).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{s.supplierName}</td>
                <td className="px-4 py-2 text-right">{NT(s.amount)}</td>
                <td className={`px-4 py-2 text-right font-medium ${Number(s.percentage) > 20 ? 'text-red-600' : Number(s.percentage) > 10 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {pct(s.percentage)}
                </td>
                <td className="px-4 py-2">
                  <Bar value={s.amount} max={maxAmt} color={Number(s.percentage) > 20 ? 'bg-red-400' : 'bg-cyan-400'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcurementStructureView({ data }) {
  const maxSupp = data.topSuppliers?.[0]?.amount || 1;
  const maxCat = data.categoryBreakdown?.[0]?.amount || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="進貨總額（期間）" value={NT(data.totalAmount)} color="text-gray-800" icon="🛒" />
        <KpiCard label="進貨單筆數" value={`${data.totalOrders ?? 0} 筆`} color="text-blue-600" icon="📦" />
        <KpiCard label="前三大廠商集中度" value={pct(data.concentration)} color="text-indigo-700" icon="📊" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">前十大供應商（依進貨金額）</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">排名</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">供應商</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">佔比</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">單據數</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.topSuppliers || []).map((s, i) => (
              <tr key={s.supplierId ?? i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 text-right">{NT(s.amount)}</td>
                <td className="px-4 py-2 text-right">{pct(s.percentage)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{s.count}</td>
                <td className="px-4 py-2"><Bar value={s.amount} max={maxSupp} color="bg-cyan-500" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">品類金額結構（依明細列計）</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">品類</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">占進貨額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">明細列數</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.categoryBreakdown || []).map((c) => (
              <tr key={c.category} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{c.category}</td>
                <td className="px-4 py-2 text-right">{NT(c.amount)}</td>
                <td className="px-4 py-2 text-right">{pct(c.percentage)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{c.count}</td>
                <td className="px-4 py-2"><Bar value={c.amount} max={maxCat} color="bg-indigo-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(data.monthlyTrend || []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">月度進貨趨勢（依進貨單日期）</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">月份</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">單據數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.monthlyTrend.map((m) => (
                <tr key={m.month} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{m.month}</td>
                  <td className="px-4 py-2 text-right">{NT(m.amount)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProcurementVsBreakfastView({ data }) {
  const pi = data.productInfo;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="年月" value={data.yearMonth || '—'} color="text-gray-800" icon="📅" sub={`館別：${data.warehouse || '全部'}`} />
        <KpiCard label="當月早餐人數（PMS）" value={(data.totalBreakfastCount ?? 0).toLocaleString()} color="text-amber-700" icon="🍳" />
        <KpiCard label="住宿人數（PMS）" value={(data.totalGuestCount ?? 0).toLocaleString()} color="text-blue-700" icon="👥" />
        <KpiCard label="入住間數（PMS）" value={(data.totalOccupiedRooms ?? 0).toLocaleString()} color="text-cyan-700" icon="🛏" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="品項進貨數量"
          value={data.totalProcurementQty != null ? Number(data.totalProcurementQty).toLocaleString() : '—'}
          color="text-gray-800"
          icon="📦"
          sub={pi ? `${pi.name || ''}${pi.unit ? `（${pi.unit}）` : ''}` : '請輸入關鍵字以匯總進貨明細'}
        />
        <KpiCard label="品項進貨金額" value={NT(data.totalProcurementAmount)} color="text-emerald-700" icon="💵" />
        <KpiCard
          label="每人早餐耗用量（數量）"
          value={data.perBreakfastQty != null ? String(data.perBreakfastQty) : '—'}
          color="text-indigo-700"
          icon="📐"
          sub="進貨數量 ÷ 早餐人數"
        />
        <KpiCard
          label="每人早餐耗用金額"
          value={data.perBreakfastAmount != null ? NT(data.perBreakfastAmount) : '—'}
          color="text-violet-700"
          icon="💹"
          sub="進貨金額 ÷ 早餐人數"
        />
      </div>
      {pi && (
        <p className="text-xs text-gray-500 px-1">
          對應品項：{pi.code ? `${pi.code} ` : ''}{pi.name || '—'}（ID {pi.id}）
        </p>
      )}
    </div>
  );
}

export default function ProcurementTab({
  warehouses,
  procurementSegment, setProcurementSegment,
  supplierLoading, supplierRisk,
  riskMonth, setRiskMonth,
  fetchSupplierRisk,
  procurementStructLoading, procurementStruct,
  procStart, setProcStart,
  procEnd, setProcEnd,
  procWarehouse, setProcWarehouse,
  fetchProcurementStruct,
  pvLoading, pvData,
  pvYearMonth, setPvYearMonth,
  pvWarehouse, setPvWarehouse,
  pvKeyword, setPvKeyword,
  fetchPvBreakfast,
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-1">檢視：</span>
        <button
          type="button"
          onClick={() => setProcurementSegment('risk')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            procurementSegment === 'risk' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          供應商風險
        </button>
        <button
          type="button"
          onClick={() => setProcurementSegment('structure')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            procurementSegment === 'structure' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          採購結構分析
        </button>
        <button
          type="button"
          onClick={() => setProcurementSegment('breakfastCompare')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            procurementSegment === 'breakfastCompare' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          早餐與採購對照
        </button>
        <Link href="/purchasing" className="ml-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          前往採購模組 →
        </Link>
      </div>

      {procurementSegment === 'risk' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="yyyymm" className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
              <input id="yyyymm" type="text" value={riskMonth} onChange={e => setRiskMonth(e.target.value)}
                placeholder="202506" maxLength={6}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <button type="button" onClick={fetchSupplierRisk} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
              查詢
            </button>
          </div>
          <p className="text-xs text-gray-500 px-1">依廠商集中度、採購額與風險規則分析；與「採購結構分析」資料來源不同。</p>
          {supplierLoading ? <Loading text="分析供應商資料中..." /> :
            supplierRisk ? <SupplierRiskView data={supplierRisk} /> :
            <div className="text-center py-12 text-gray-400">無採購資料</div>
          }
        </>
      )}

      {procurementSegment === 'structure' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="f-11" className="block text-xs text-gray-500 mb-1">進貨起始日</label>
                <input id="f-11" type="date" value={procStart} onChange={e => setProcStart(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <div>
                <label htmlFor="f-12" className="block text-xs text-gray-500 mb-1">進貨結束日</label>
                <input id="f-12" type="date" value={procEnd} onChange={e => setProcEnd(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <div>
                <label htmlFor="f-13" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                <select id="f-13" value={procWarehouse} onChange={e => setProcWarehouse(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  <option value="">全部館別</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <button type="button" onClick={fetchProcurementStruct} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                查詢
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">彙總進貨單明細：前十大廠商、品類占比、月度趨勢；變更條件後請按「查詢」。</p>
          </div>
          {procurementStructLoading ? <Loading text="計算採購結構中..." /> :
            procurementStruct ? <ProcurementStructureView data={procurementStruct} /> :
            <div className="text-center py-12 text-gray-400">請設定日期後按「查詢」</div>
          }
        </>
      )}

      {procurementSegment === 'breakfastCompare' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="yyyy-mm" className="block text-xs text-gray-500 mb-1">年月（YYYY-MM）</label>
                <input id="yyyy-mm"
                  type="month"
                  value={pvYearMonth.length >= 7 ? pvYearMonth.substring(0, 7) : pvYearMonth}
                  onChange={(e) => setPvYearMonth(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label htmlFor="f-14" className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                <select id="f-14"
                  value={pvWarehouse}
                  onChange={(e) => setPvWarehouse(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
                >
                  <option value="">全部館別</option>
                  {warehouses.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px] flex-1">
                <label htmlFor="f-26" className="block text-xs text-gray-500 mb-1">品項關鍵字（選填，對應進貨品名／編號）</label>
                <input id="f-26"
                  type="text"
                  value={pvKeyword}
                  onChange={(e) => setPvKeyword(e.target.value)}
                  placeholder="例：牛奶、蛋"
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <button
                type="button"
                onClick={fetchPvBreakfast}
                className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
              >
                查詢
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500 leading-relaxed">
              比對當月 PMS <strong>早餐人數</strong>與<strong>指定品項進貨數量／金額</strong>；未填關鍵字時僅顯示住宿／早餐量體，採購合計為 0。
              資料需已匯入 PMS 日報與進貨單。
            </p>
          </div>
          {pvLoading ? (
            <Loading text="載入早餐與採購對照..." />
          ) : pvData ? (
            <ProcurementVsBreakfastView data={pvData} />
          ) : (
            <div className="text-center py-12 text-gray-400">請選擇年月後按「查詢」</div>
          )}
        </>
      )}
    </div>
  );
}
