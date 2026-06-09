'use client';

import { formatNum0 as formatNumber, formatCurrency } from '@/lib/format-utils';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { renderStatementContent } from './StatementModal';

function StatusBadge({ status }) {
  const styles = {
    '進行中': 'bg-yellow-100 text-yellow-700',
    '已完成': 'bg-green-100 text-green-700',
    '失敗': 'bg-red-100 text-red-700'
  };
  const dotStyles = {
    '進行中': 'bg-yellow-400',
    '已完成': 'bg-green-500',
    '失敗': 'bg-red-500'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      <span className={`w-2 h-2 rounded-full ${dotStyles[status] || 'bg-gray-400'}`}></span>
      {status}
    </span>
  );
}

export default function HistoryTab({
  records,
  recordsError,
  fetchRecords,
  expandedId,
  detailData,
  detailLoading,
  detailTab,
  setDetailTab,
  handleToggleDetail,
  handleViewStatement,
  selectedYear,
}) {
  if (recordsError) {
    return <FetchErrorBanner message={recordsError} onRetry={fetchRecords} />;
  }

  if (records.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-violet-200">
      <div className="px-6 py-4 border-b border-violet-100">
        <h3 className="text-lg font-semibold text-violet-800">歷史年度結轉紀錄</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-violet-50">
            <tr className="bg-violet-50">
              <th className="text-left px-4 py-3 text-violet-700 font-medium">年度</th>
              <th className="text-left px-4 py-3 text-violet-700 font-medium">狀態</th>
              <th className="text-left px-4 py-3 text-violet-700 font-medium">執行者</th>
              <th className="text-left px-4 py-3 text-violet-700 font-medium">執行時間</th>
              <th className="text-right px-4 py-3 text-violet-700 font-medium">庫存快照</th>
              <th className="text-right px-4 py-3 text-violet-700 font-medium">帳戶快照</th>
              <th className="text-right px-4 py-3 text-violet-700 font-medium">保留盈餘</th>
              <th className="text-center px-4 py-3 text-violet-700 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td colSpan={8} className="p-0">
                  {/* Main row */}
                  <div
                    className={`flex items-center hover:bg-violet-50/50 transition-colors cursor-pointer ${expandedId === record.id ? 'bg-violet-50/50' : ''}`}
                    onClick={() => record.status === '已完成' && handleToggleDetail(record)}
                  >
                    <div className="flex-none w-[80px] px-4 py-3 font-medium text-gray-800">{record.year}</div>
                    <div className="flex-none w-[100px] px-4 py-3"><StatusBadge status={record.status} /></div>
                    <div className="flex-none w-[120px] px-4 py-3 text-gray-600">{record.rolledOverBy || '-'}</div>
                    <div className="flex-none w-[160px] px-4 py-3 text-gray-600">
                      {record.rolledOverAt ? new Date(record.rolledOverAt).toLocaleString('zh-TW') : '-'}
                    </div>
                    <div className="flex-none w-[100px] px-4 py-3 text-right text-gray-600">{record.inventoryCount}</div>
                    <div className="flex-none w-[100px] px-4 py-3 text-right text-gray-600">{record.balanceCount}</div>
                    <div className="flex-none w-[120px] px-4 py-3 text-right font-medium text-gray-800">
                      {record.retainedEarnings != null ? formatCurrency(record.retainedEarnings) : '-'}
                    </div>
                    <div className="flex-1 px-4 py-3 text-center">
                      {record.status === '已完成' && (
                        <button className="text-xs text-violet-600 hover:text-violet-800 underline">
                          {expandedId === record.id ? '收合' : '展開詳情'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedId === record.id && (
                    <div className="border-t border-violet-100 bg-violet-50/30 px-6 py-4">
                      {detailLoading && (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600"></div>
                          <span className="ml-2 text-gray-500 text-sm">載入詳情...</span>
                        </div>
                      )}

                      {detailData && (
                        <div>
                          {/* Tabs */}
                          <div className="flex flex-wrap gap-1 mb-4 border-b border-violet-200">
                            {[
                              { key: 'inventory', label: '庫存快照', statementId: null },
                              { key: 'balance', label: '帳戶餘額', statementId: null },
                              ...detailData.financialStatements.map(s => ({
                                key: `statement-${s.id}`,
                                label: s.statementType,
                                statementId: s.id
                              }))
                            ].map(tab => (
                              <button
                                key={tab.key}
                                onClick={(e) => { e.stopPropagation(); setDetailTab(tab.key); }}
                                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                  detailTab === tab.key
                                    ? 'border-violet-600 text-violet-700'
                                    : 'border-transparent text-gray-500 hover:text-violet-600'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Tab content: Inventory */}
                          {detailTab === 'inventory' && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead className="sticky top-0 z-10 bg-violet-100">
                                  <tr className="bg-violet-100/50">
                                    <th className="text-left p-2 border border-violet-200">商品代碼</th>
                                    <th className="text-left p-2 border border-violet-200">商品名稱</th>
                                    <th className="text-right p-2 border border-violet-200">成本單價</th>
                                    <th className="text-right p-2 border border-violet-200">結存數量</th>
                                    <th className="text-right p-2 border border-violet-200">結存金額</th>
                                    <th className="text-center p-2 border border-violet-200">狀態</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailData.inventorySnapshots.length === 0 ? (
                                    <tr><td colSpan={6} className="p-4 text-center text-gray-500">無庫存快照資料</td></tr>
                                  ) : (
                                    detailData.inventorySnapshots.map((item) => (
                                      <tr key={item.id} className={`hover:bg-gray-50 ${item.isNegative ? 'bg-red-50' : ''}`}>
                                        <td className="p-2 border border-gray-200 font-mono text-xs">{item.productCode}</td>
                                        <td className="p-2 border border-gray-200">{item.productName}</td>
                                        <td className="text-right p-2 border border-gray-200">{formatCurrency(item.costPrice)}</td>
                                        <td className="text-right p-2 border border-gray-200">{formatNumber(item.closingQuantity)}</td>
                                        <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(item.closingValue)}</td>
                                        <td className="text-center p-2 border border-gray-200">
                                          {item.isNegative ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                              </svg>
                                              調整歸零
                                            </span>
                                          ) : (
                                            <span className="text-green-600 text-xs">正常</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                              {detailData.inventorySnapshots.length > 0 && (
                                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                                  <span>共 {detailData.inventorySnapshots.length} 項商品</span>
                                  <span>
                                    總值: {formatCurrency(detailData.inventorySnapshots.reduce((s, i) => s + i.closingValue, 0))}
                                  </span>
                                  <span>
                                    負庫存: {detailData.inventorySnapshots.filter(i => i.isNegative).length} 項
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tab content: Balance */}
                          {detailTab === 'balance' && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead className="sticky top-0 z-10 bg-violet-100">
                                  <tr className="bg-violet-100/50">
                                    <th className="text-left p-2 border border-violet-200">帳戶名稱</th>
                                    <th className="text-left p-2 border border-violet-200">帳戶類型</th>
                                    <th className="text-right p-2 border border-violet-200">期末餘額</th>
                                    <th className="text-right p-2 border border-violet-200">下年度期初</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailData.balanceRecords.length === 0 ? (
                                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">無帳戶餘額資料</td></tr>
                                  ) : (
                                    detailData.balanceRecords.map((rec) => (
                                      <tr key={rec.id} className="hover:bg-gray-50">
                                        <td className="p-2 border border-gray-200">{rec.accountName}</td>
                                        <td className="p-2 border border-gray-200">{rec.accountType || '-'}</td>
                                        <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(rec.closingBalance)}</td>
                                        <td className="text-right p-2 border border-gray-200 font-medium text-violet-600">{formatCurrency(rec.nextYearOpeningBalance)}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                              {detailData.balanceRecords.length > 0 && (
                                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                                  <span>共 {detailData.balanceRecords.length} 個帳戶</span>
                                  <span>
                                    餘額合計: {formatCurrency(detailData.balanceRecords.reduce((s, r) => s + r.closingBalance, 0))}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tab content: Financial statements */}
                          {detailData.financialStatements.map(statement => (
                            detailTab === `statement-${statement.id}` && (
                              <div key={statement.id} className="overflow-x-auto">
                                {renderStatementContent(statement, selectedYear)}
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
