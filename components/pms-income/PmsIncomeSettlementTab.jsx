'use client';

import { formatNumber } from './pmsIncomeFormatters';

export default function PmsIncomeSettlementTab({
  WAREHOUSES,
  settlementWarehouse,
  setSettlementWarehouse,
  settlementYearMonth,
  setSettlementYearMonth,
  fetchSettlementData,
  settlementStatus,
  settlementBatches,
  settling,
  handleSettleMonth,
  handleVerifyMonth,
  handleVerifyBatches,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <p className="text-sm font-medium text-teal-800 mb-2">PMS 收入結算流程：</p>
        <ol className="text-xs text-teal-700 space-y-1 list-decimal list-inside">
          <li>
            <b>每日匯入</b> — 匯入 PMS 日報表（狀態：已匯入）
          </li>
          <li>
            <b>會計核對</b> — 飯店會計核對整月資料正確後，點「核對整月」（狀態：已核對）
          </li>
          <li>
            <b>月度結算</b> — 核對完成後，點「結算入帳」→ 系統自動建立現金流收入（現金、信用卡、轉帳各別入帳）
          </li>
        </ol>
        <div className="mt-2 flex items-center gap-2 text-xs text-teal-600">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
          已匯入
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 ml-2" />
          已核對
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 ml-2" />
          已結算
        </div>
        <p className="text-xs text-teal-600 mt-2">
          <b>注意：</b>結算前請先到「收入帳戶設定」設定各付款方式（現金、信用卡、轉帳）對應的存簿帳戶、手續費比例、入帳延遲天數。
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-wrap gap-3 items-center">
        <select
          value={settlementWarehouse}
          onChange={(e) => setSettlementWarehouse(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {WAREHOUSES.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={settlementYearMonth}
          onChange={(e) => setSettlementYearMonth(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={fetchSettlementData}
          className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50"
        >
          查詢
        </button>
        <div className="flex-1" />

        {settlementStatus ? (
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                settlementStatus.status === '已結算'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : settlementStatus.status === '已核對'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
              }`}
            >
              {settlementStatus.status}
            </span>
            {settlementStatus.status === '已核對' && (
              <button
                type="button"
                onClick={handleSettleMonth}
                disabled={settling}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {settling ? '結算中...' : '結算入帳'}
              </button>
            )}
            {settlementStatus.status === '已結算' && (
              <span className="text-xs text-gray-500">
                結算者: {settlementStatus.settledBy} |{' '}
                {settlementStatus.settledAt ? new Date(settlementStatus.settledAt).toLocaleString('zh-TW') : ''}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {settlementBatches.filter((b) => b.status === '已匯入').length > 0 && (
              <button type="button" onClick={handleVerifyMonth} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                核對整月
              </button>
            )}
          </div>
        )}
      </div>

      {settlementStatus && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-teal-500">
            <p className="text-xs text-gray-500">批次數量</p>
            <p className="text-xl font-bold text-teal-700">{settlementStatus.batchCount}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
            <p className="text-xs text-gray-500">貸方合計（收入）</p>
            <p className="text-xl font-bold text-green-700">{formatNumber(settlementStatus.creditTotal)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-amber-500">
            <p className="text-xs text-gray-500">借方合計（付款方式）</p>
            <p className="text-xl font-bold text-amber-700">{formatNumber(settlementStatus.debitTotal)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
            <p className="text-xs text-gray-500">核對者</p>
            <p className="text-sm font-medium text-blue-700">{settlementStatus.verifiedBy || '-'}</p>
            <p className="text-xs text-gray-400">
              {settlementStatus.verifiedAt ? new Date(settlementStatus.verifiedAt).toLocaleString('zh-TW') : ''}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-bold text-gray-700">
            {settlementWarehouse} — {settlementYearMonth} 批次列表 ({settlementBatches.length}筆)
          </h3>
        </div>
        {settlementBatches.length === 0 ? (
          <div className="p-8 text-center text-gray-400">此月份無匯入批次</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">營業日期</th>
                  <th className="px-3 py-2 text-right font-medium">貸方</th>
                  <th className="px-3 py-2 text-right font-medium">借方</th>
                  <th className="px-3 py-2 text-right font-medium">差額</th>
                  <th className="px-3 py-2 text-center font-medium">筆數</th>
                  <th className="px-3 py-2 text-center font-medium">狀態</th>
                  <th className="px-3 py-2 text-center font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {settlementBatches.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{b.businessDate}</td>
                    <td className="px-3 py-2 text-right font-mono text-teal-700">{formatNumber(b.creditTotal)}</td>
                    <td className="px-3 py-2 text-right font-mono text-amber-700">{formatNumber(b.debitTotal)}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        Math.abs(Number(b.difference)) < 0.01 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatNumber(b.difference)}
                    </td>
                    <td className="px-3 py-2 text-center">{b.recordCount}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          b.status === '已結算' ? 'bg-green-100 text-green-700' : b.status === '已核對' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {b.status === '已匯入' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyBatches([b.id])}
                          className="text-blue-600 hover:text-blue-800 text-xs hover:underline"
                        >
                          核對
                        </button>
                      )}
                      {b.status === '已核對' && <span className="text-xs text-gray-400">已核對</span>}
                      {b.status === '已結算' && <span className="text-xs text-green-600">已結算</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
