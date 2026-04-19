'use client';

import { DEFAULT_PMS_COLUMNS } from './pmsIncomeConstants';

export default function PmsIncomePaymentConfigTab({
  paymentConfigWarehouse,
  setPaymentConfigWarehouse,
  paymentConfigBuildings,
  paymentConfigAccounts,
  paymentConfigs,
  handleSavePaymentConfig,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <p className="text-sm font-medium text-teal-800 mb-1">收入帳戶設定說明：</p>
        <p className="text-xs text-teal-700">
          依<strong>館別</strong>設定 PMS 借方收入（現金、信用卡、轉帳等）對應的存簿帳戶。結算時系統會依該館別的設定自動建立現金流交易。
          <br />
          信用卡收入可設定入帳延遲天數（銀行撥款通常延遲3~7天）和手續費比例（手續費會自動建立支出交易）。館別請至「設定 → 館別設定」新增。
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold text-gray-700">借方收入 → 存簿帳戶對應</h3>
          <label className="text-sm text-gray-600">館別：</label>
          <select
            value={paymentConfigWarehouse}
            onChange={(e) => setPaymentConfigWarehouse(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            {paymentConfigBuildings.length === 0 ? (
              <option value="">請先至設定新增館別</option>
            ) : (
              paymentConfigBuildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">PMS 收入項目</th>
                <th className="px-4 py-2 text-left font-medium">對應存簿帳戶</th>
                <th className="px-4 py-2 text-center font-medium">入帳延遲(天)</th>
                <th className="px-4 py-2 text-center font-medium">手續費(%)</th>
                <th className="px-4 py-2 text-center font-medium">啟用</th>
                <th className="px-4 py-2 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_PMS_COLUMNS.filter((c) => c.entryType === '借方').map((col) => {
                const existing = paymentConfigs.find(
                  (p) => (p.warehouse ?? '') === paymentConfigWarehouse && p.pmsColumnName === col.pmsColumnName
                );
                return (
                  <tr key={col.pmsColumnName} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{col.pmsColumnName}</div>
                      <div className="text-xs text-gray-400">
                        {col.accountingCode} - {col.accountingName}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={existing?.cashAccountId || ''}
                        onChange={(e) =>
                          handleSavePaymentConfig({
                            pmsColumnName: col.pmsColumnName,
                            cashAccountId: e.target.value || null,
                            settlementDelayDays: existing?.settlementDelayDays || 0,
                            feePercentage: existing?.feePercentage || 0,
                            isActive: existing?.isActive !== false,
                          })
                        }
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">未設定</option>
                        {paymentConfigAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={existing?.settlementDelayDays || 0}
                        onChange={(e) =>
                          handleSavePaymentConfig({
                            pmsColumnName: col.pmsColumnName,
                            cashAccountId: existing?.cashAccountId || null,
                            settlementDelayDays: parseInt(e.target.value, 10) || 0,
                            feePercentage: existing?.feePercentage || 0,
                            isActive: existing?.isActive !== false,
                          })
                        }
                        className="w-16 border rounded px-2 py-1.5 text-sm text-center"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.1"
                        value={existing?.feePercentage || 0}
                        onChange={(e) =>
                          handleSavePaymentConfig({
                            pmsColumnName: col.pmsColumnName,
                            cashAccountId: existing?.cashAccountId || null,
                            settlementDelayDays: existing?.settlementDelayDays || 0,
                            feePercentage: parseFloat(e.target.value) || 0,
                            isActive: existing?.isActive !== false,
                          })
                        }
                        className="w-20 border rounded px-2 py-1.5 text-sm text-center"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={existing?.isActive !== false}
                        onChange={(e) =>
                          handleSavePaymentConfig({
                            pmsColumnName: col.pmsColumnName,
                            cashAccountId: existing?.cashAccountId || null,
                            settlementDelayDays: existing?.settlementDelayDays || 0,
                            feePercentage: existing?.feePercentage || 0,
                            isActive: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {existing ? <span className="text-xs text-green-600">已設定</span> : <span className="text-xs text-gray-400">未設定</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="text-sm font-bold text-amber-800 mb-2">信用卡收入設定建議</h4>
        <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
          <li>
            <b>對應存簿：</b>選擇銀行帳戶（信用卡款項撥入的帳戶）
          </li>
          <li>
            <b>入帳延遲：</b>一般為 3~7 天（依銀行撥款時間），結算時交易日期 = 月底 + 延遲天數
          </li>
          <li>
            <b>手續費：</b>例如 2.5%，系統會自動建立一筆手續費支出（從同一帳戶扣除）
          </li>
          <li>
            <b>現金/轉帳收入：</b>延遲設0天，手續費設0%
          </li>
        </ul>
      </div>
    </div>
  );
}
