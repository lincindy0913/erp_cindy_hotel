'use client';

import { formatNumber } from './pmsIncomeFormatters';

export default function PmsIncomeManualCommissionTab({
  manualMonth,
  setManualMonth,
  fetchManualEntries,
  setEditingManualEntry,
  setManualEntryForm,
  setShowManualEntryModal,
  manualEntries,
  loading,
  selectedManualIds,
  setSelectedManualIds,
  setConfirmCommissionForm,
  setShowConfirmCommissionModal,
  setError,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-gray-700">每月代訂中心佣金輸入</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">結算月份：</span>
            <input
              type="text"
              value={manualMonth}
              onChange={(e) => setManualMonth(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="202603"
              className="w-24 border rounded px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={fetchManualEntries}
              className="px-3 py-1 text-sm border border-teal-300 text-teal-700 rounded hover:bg-teal-50"
            >
              查詢
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingManualEntry(null);
                setManualEntryForm({
                  agencyName: '',
                  agencyCode: '',
                  totalRoomRent: '',
                  roomNights: '',
                  commissionPercentage: '',
                  commissionAmount: '',
                  arOrAp: 'AP',
                  remarks: '',
                });
                setShowManualEntryModal(true);
              }}
              className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              ＋ 新增代訂記錄
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          無法從 PMS 自動提取的代訂中心，於此手動輸入當月房租與佣金，系統自動計算應收/應付。確認無誤後可送出至現金流。
        </p>
        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={
                        manualEntries.filter((e) => e.status === 'DRAFT').length > 0 &&
                        selectedManualIds.length === manualEntries.filter((e) => e.status === 'DRAFT').length
                      }
                      onChange={(e) => {
                        if (e.target.checked) setSelectedManualIds(manualEntries.filter((x) => x.status === 'DRAFT').map((x) => x.id));
                        else setSelectedManualIds([]);
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">代訂中心</th>
                  <th className="px-3 py-2 font-medium text-right">房租總額</th>
                  <th className="px-3 py-2 font-medium text-right">房晚</th>
                  <th className="px-3 py-2 font-medium text-right">佣金%</th>
                  <th className="px-3 py-2 font-medium text-right">佣金金額</th>
                  <th className="px-3 py-2 font-medium">應收/應付</th>
                  <th className="px-3 py-2 font-medium text-right">淨額</th>
                  <th className="px-3 py-2 font-medium text-center">狀態</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {manualEntries.map((entry) => (
                  <tr key={entry.id} className={`border-t hover:bg-gray-50 ${entry.status !== 'DRAFT' ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-2 py-2">
                      {entry.status === 'DRAFT' ? (
                        <input
                          type="checkbox"
                          checked={selectedManualIds.includes(entry.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedManualIds((prev) => [...prev, entry.id]);
                            else setSelectedManualIds((prev) => prev.filter((id) => id !== entry.id));
                          }}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{entry.agencyName}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(entry.totalRoomRent)}</td>
                    <td className="px-3 py-2 text-right">{entry.roomNights}</td>
                    <td className="px-3 py-2 text-right">{Number(entry.commissionPercentage)}%</td>
                    <td className="px-3 py-2 text-right">{formatNumber(entry.commissionAmount)}</td>
                    <td className="px-3 py-2">{entry.arOrAp === 'AR' ? '應收' : entry.arOrAp === 'AP' ? '應付' : '—'}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatNumber(entry.netAmount)}</td>
                    <td className="px-3 py-2 text-center">
                      {entry.status === 'DRAFT' && <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">草稿</span>}
                      {entry.status === 'SUBMITTED' && <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">已送出</span>}
                      {entry.status === 'VERIFIED' && <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">已核實</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {entry.status === 'DRAFT' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingManualEntry(entry);
                              setManualEntryForm({
                                agencyName: entry.agencyName,
                                agencyCode: entry.agencyCode || '',
                                totalRoomRent: String(entry.totalRoomRent),
                                roomNights: String(entry.roomNights),
                                commissionPercentage: String(entry.commissionPercentage),
                                commissionAmount: String(entry.commissionAmount),
                                arOrAp: entry.arOrAp,
                                remarks: entry.remarks || '',
                              });
                              setShowManualEntryModal(true);
                            }}
                            className="text-teal-600 hover:underline text-xs"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm('確定刪除？')) return;
                              try {
                                const r = await fetch(`/api/pms-income/monthly-manual-commission/${entry.id}`, { method: 'DELETE' });
                                if (r.ok) fetchManualEntries();
                                else setError((await r.json())?.error?.message || '刪除失敗');
                              } catch (err) {
                                setError(err.message);
                              }
                            }}
                            className="ml-2 text-red-500 hover:underline text-xs"
                          >
                            刪除
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">已送出</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {manualEntries.length > 0 && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm text-gray-600">
                  小計：{manualEntries.length} 筆 · 房租合計 {formatNumber(manualEntries.reduce((s, e) => s + Number(e.totalRoomRent), 0))} · 佣金合計{' '}
                  {formatNumber(manualEntries.reduce((s, e) => s + Number(e.commissionAmount), 0))} · 應付合計{' '}
                  {formatNumber(manualEntries.filter((e) => e.arOrAp === 'AP').reduce((s, e) => s + Number(e.netAmount), 0))}
                </div>
                {selectedManualIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setConfirmCommissionForm({ accountId: '', transactionDate: today });
                      setShowConfirmCommissionModal(true);
                    }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    確認送出至現金流（{selectedManualIds.length} 筆）
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
