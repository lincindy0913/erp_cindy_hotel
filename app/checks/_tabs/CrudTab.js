'use client';

import { formatNum } from '@/lib/format-utils';
import CheckTable from './CheckTable';

export default function CrudTab({
  type,
  suppliers,
  filterStatus, setFilterStatus,
  filterDateFrom, setFilterDateFrom,
  filterDateTo, setFilterDateTo,
  filterSupplierId, setFilterSupplierId,
  sortedPayableCrud, chkPayk, chkPayd, chkPayt,
  sortedReceivableCrud, chkReck, chkRecd, chkRect,
  selectedIds, setSelectedIds, toggleSelectId,
  deletingCheckId, reissueLoading,
  openClear, openVoid, openEdit,
  handleDelete, handleReissue,
  resetAddForm, setAddForm, setShowAddModal,
}) {
  const filtered = type === 'payable' ? sortedPayableCrud : sortedReceivableCrud;
  const crudSortKey = type === 'payable' ? chkPayk : chkReck;
  const crudSortDir = type === 'payable' ? chkPayd : chkRecd;
  const crudToggle = type === 'payable' ? chkPayt : chkRect;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
        <div>
          <label htmlFor="f-9" className="block text-sm text-gray-500 mb-1">狀態</label>
          <select id="f-9" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-base">
            <option value="">全部</option>
            <option value="pending">待處理</option>
            <option value="due">到期</option>
            <option value="cleared">已兌現</option>
            <option value="bounced">退票</option>
            <option value="void">作廢</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-10" className="block text-sm text-gray-500 mb-1">到期日起</label>
          <input id="f-10" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-base" />
        </div>
        <div>
          <label htmlFor="f-11" className="block text-sm text-gray-500 mb-1">到期日迄</label>
          <input id="f-11" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-base" />
        </div>
        {type === 'payable' && (
          <div>
            <label htmlFor="f-12" className="block text-sm text-gray-500 mb-1">供應商</label>
            <select id="f-12" value={filterSupplierId} onChange={e => setFilterSupplierId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-base">
              <option value="">全部</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <button onClick={() => { setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterSupplierId(''); }}
          className="px-3 py-1.5 text-base text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">
          清除篩選
        </button>
        <div className="flex-1"></div>
        <button onClick={() => { resetAddForm(); setAddForm(f => ({ ...f, checkType: type })); setShowAddModal(true); }}
          className="px-4 py-1.5 text-base bg-violet-600 text-white rounded-lg hover:bg-violet-700">
          + 新增{type === 'payable' ? '應付' : '應收'}支票
        </button>
      </div>

      {/* Summary row */}
      <div className="flex gap-4 text-base">
        <span className="text-gray-500">共 {filtered.length} 筆</span>
        <span className="text-gray-500">
          總金額: <span className="font-bold text-gray-800">${formatNum(filtered.reduce((s, c) => s + Number(c.amount), 0))}</span>
        </span>
        <span className="text-gray-500">
          未兌現: <span className="font-bold text-orange-600">
            ${formatNum(filtered.filter(c => c.status === 'pending' || c.status === 'due').reduce((s, c) => s + Number(c.amount), 0))}
          </span>
        </span>
      </div>

      <CheckTable data={filtered} showActions={true} showSelect={false}
        sortKey={crudSortKey} sortDir={crudSortDir} toggleSort={crudToggle}
        selectedIds={selectedIds} setSelectedIds={setSelectedIds} toggleSelectId={toggleSelectId}
        deletingCheckId={deletingCheckId} reissueLoading={reissueLoading}
        openClear={openClear} openVoid={openVoid} openEdit={openEdit}
        handleDelete={handleDelete} handleReissue={handleReissue} />
    </div>
  );
}
