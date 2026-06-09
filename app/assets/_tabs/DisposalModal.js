'use client';

import React from 'react';

export function DisposalModal({
  showDisposalModal,
  setShowDisposalModal,
  editingDisposal,
  disposalSaving,
  disposalForm,
  setDisposalForm,
  saveDisposal,
}) {
  if (!showDisposalModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !disposalSaving && setShowDisposalModal(false)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-800 mb-4">{editingDisposal ? '編輯處分記錄' : '新增處分記錄'}</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-gray-600 block mb-1">處分日期 *</label>
            <input type="date" className="w-full border rounded px-3 py-2"
              value={disposalForm.disposalDate}
              onChange={e => setDisposalForm(f => ({ ...f, disposalDate: e.target.value }))} />
          </div>
          <div>
            <label className="text-gray-600 block mb-1">成交價格（選填）</label>
            <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
              value={disposalForm.salePrice}
              onChange={e => setDisposalForm(f => ({ ...f, salePrice: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-600 block mb-1">印花稅</label>
              <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
                value={disposalForm.stampTax}
                onChange={e => setDisposalForm(f => ({ ...f, stampTax: e.target.value }))} />
            </div>
            <div>
              <label className="text-gray-600 block mb-1">土地增值稅</label>
              <input type="text" inputMode="decimal" placeholder="NT$" className="w-full border rounded px-3 py-2"
                value={disposalForm.landValueIncrementTax}
                onChange={e => setDisposalForm(f => ({ ...f, landValueIncrementTax: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-gray-600 block mb-1">備註</label>
            <textarea className="w-full border rounded px-3 py-2" rows={2}
              value={disposalForm.notes}
              onChange={e => setDisposalForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button disabled={disposalSaving} onClick={() => setShowDisposalModal(false)}
            className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
          <button disabled={disposalSaving} onClick={saveDisposal}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
            {disposalSaving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
