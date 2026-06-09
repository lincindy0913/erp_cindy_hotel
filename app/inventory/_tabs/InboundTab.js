'use client';

export function InboundTab({
  pendingInbound, inboundLoading, inboundUpdating, inboundWarehouseEdits, setInboundWarehouseEdits,
  inboundWareFilter, setInboundWareFilter, inboundSearch, setInboundSearch,
  inboundDateFrom, setInboundDateFrom, inboundDateTo, setInboundDateTo,
  inboundSelected, setInboundSelected, batchConfirming, storageLocations,
  confirmInbound, batchConfirmInbound, fetchPendingInbound,
}) {
  const filteredInbound = pendingInbound.filter(row => {
    if (inboundWareFilter && row.purchaseWarehouse !== inboundWareFilter) return false;
    if (inboundSearch) {
      const q = inboundSearch.toLowerCase();
      if (!row.productName?.toLowerCase().includes(q) &&
          !row.supplierName?.toLowerCase().includes(q) &&
          !row.purchaseNo?.toLowerCase().includes(q)) return false;
    }
    if (inboundDateFrom && row.purchaseDate < inboundDateFrom) return false;
    if (inboundDateTo && row.purchaseDate > inboundDateTo) return false;
    return true;
  });
  const totalQty = filteredInbound.reduce((s, r) => s + Number(r.quantity), 0);
  const totalAmt = filteredInbound.reduce((s, r) => s + Number(r.quantity) * Number(r.unitPrice || 0), 0);
  const uniqueWarehouses = [...new Set(pendingInbound.map(r => r.purchaseWarehouse).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-blue-600">待入庫筆數</p>
          <p className="text-2xl font-bold text-blue-700">{filteredInbound.length}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
          <p className="text-xs text-indigo-600">待入庫數量</p>
          <p className="text-2xl font-bold text-indigo-700">{totalQty}</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-center">
          <p className="text-xs text-violet-600">待入庫金額</p>
          <p className="text-2xl font-bold text-violet-700">NT$ {totalAmt.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="ib-search" className="block text-xs text-gray-500 mb-1">關鍵字（商品/廠商/單號）</label>
            <input id="ib-search" type="text" value={inboundSearch} onChange={e => setInboundSearch(e.target.value)}
              placeholder="搜尋..." className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label htmlFor="ib-ware" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="ib-ware" value={inboundWareFilter} onChange={e => setInboundWareFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">全部館別</option>
              {uniqueWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ib-from" className="block text-xs text-gray-500 mb-1">進貨日期起</label>
            <input id="ib-from" type="date" value={inboundDateFrom} onChange={e => setInboundDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="ib-to" className="block text-xs text-gray-500 mb-1">進貨日期迄</label>
              <input id="ib-to" type="date" value={inboundDateTo} onChange={e => setInboundDateTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <button onClick={() => { setInboundSearch(''); setInboundWareFilter(''); setInboundDateFrom(''); setInboundDateTo(''); }}
              className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">清除</button>
          </div>
        </div>
      </div>

      {/* Batch action bar */}
      {inboundSelected.size > 0 && (
        <div className="bg-blue-700 text-white rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium">已勾選 {inboundSelected.size} 筆</span>
          <div className="flex gap-2">
            <button onClick={() => setInboundSelected(new Set())}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg">
              取消選取
            </button>
            <button onClick={() => batchConfirmInbound(filteredInbound)} disabled={batchConfirming}
              className="px-4 py-1.5 bg-green-400 hover:bg-green-300 text-gray-900 text-xs font-bold rounded-lg disabled:opacity-60">
              {batchConfirming ? '處理中…' : `批次確認入庫（${inboundSelected.size} 筆）`}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-4 py-3 bg-blue-50 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-blue-800">待入庫商品</h3>
            <p className="text-xs text-blue-600 mt-0.5">勾選多筆後可批次確認入庫；或逐筆按「確認入庫」</p>
          </div>
          <button onClick={fetchPendingInbound} className="text-xs text-blue-600 hover:underline">重新整理</button>
        </div>
        {inboundLoading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : filteredInbound.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">📥</div>
            <p>{pendingInbound.length === 0 ? '目前沒有待入庫商品' : '無符合篩選條件的商品'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                <tr>
                  <th className="px-3 py-2 text-center w-8">
                    <input type="checkbox"
                      checked={filteredInbound.length > 0 && filteredInbound.every(r => inboundSelected.has(`${r.purchaseId}-${r.detailId}`))}
                      onChange={e => {
                        if (e.target.checked) {
                          setInboundSelected(new Set(filteredInbound.map(r => `${r.purchaseId}-${r.detailId}`)));
                        } else {
                          setInboundSelected(new Set());
                        }
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">進貨單號</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">進貨日期</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">廠商</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">商品</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">數量</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">單價</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">備註</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">入庫倉庫 *</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredInbound.map((row) => {
                  const key = `${row.purchaseId}-${row.detailId}`;
                  const currentLoc = inboundWarehouseEdits[key] ?? row.inventoryWarehouse ?? '';
                  const isUpdating = !!inboundUpdating[key];
                  const isChecked = inboundSelected.has(key);
                  return (
                    <tr key={key} className={`hover:bg-blue-50/30 ${isChecked ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={isChecked}
                          onChange={e => {
                            setInboundSelected(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(key) : next.delete(key);
                              return next;
                            });
                          }}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-blue-700 text-xs">{row.purchaseNo}</td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{row.purchaseWarehouse || '-'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{row.purchaseDate}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs">{row.supplierName || '-'}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.productName || `#${row.productId}`}</td>
                      <td className="px-4 py-2.5 text-center font-medium">{row.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 text-xs">NT$ {Number(row.unitPrice || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{row.note || '-'}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={currentLoc}
                          onChange={e => setInboundWarehouseEdits(prev => ({ ...prev, [key]: e.target.value }))}
                          className={`w-full px-2 py-1 border rounded text-xs focus:ring-1 focus:ring-blue-500 ${
                            currentLoc ? 'bg-white border-gray-300' : 'bg-yellow-50 border-yellow-300'
                          }`}
                        >
                          <option value="">⚠ 請選擇倉庫</option>
                          {storageLocations.length > 0
                            ? storageLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)
                            : ['格-地下室','格-2F辦公室','格-備品室','軒-B2小倉庫','軒-辦公室','軒-備品室','海-樓梯下','海-備品室','花-備品室','格-B2F','管理部','工程部'].map(loc => <option key={loc} value={loc}>{loc}</option>)
                          }
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => {
                            if (!currentLoc) { return; }
                            confirmInbound(row);
                          }}
                          disabled={isUpdating || !currentLoc}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isUpdating ? '處理中…' : '確認入庫'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
