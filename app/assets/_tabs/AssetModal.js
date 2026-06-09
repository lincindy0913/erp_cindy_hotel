'use client';

import React from 'react';

const ASSET_TYPE_OPTIONS = [
  { value: 'BUILDING', label: '建物' },
  { value: 'LAND', label: '土地' },
  { value: 'MIXED', label: '混合' },
  { value: 'OTHER', label: '其他' },
];

export function AssetModal({
  showModal,
  setShowModal,
  editing,
  saving,
  form,
  setForm,
  propertyOptions,
  properties,
  saveModal,
  deleteAsset,
}) {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !saving && setShowModal(false)}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-800 mb-4">{editing ? '編輯資產' : '新增資產'}</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="f" className="text-gray-600">名稱 *</label>
            <input id="f" className="w-full border rounded px-3 py-2 mt-1" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-2" className="text-gray-600">序號</label>
              <input id="f-2" className="w-full border rounded px-3 py-2 mt-1" placeholder="例：A001" value={form.serialNo}
                onChange={e => setForm(f => ({ ...f, serialNo: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="f-3" className="text-gray-600">類別</label>
              <input id="f-3" className="w-full border rounded px-3 py-2 mt-1" placeholder="例：住宅、商業" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
          </div>
          <div>
            <label htmlFor="f-4" className="text-gray-600">資產類型</label>
            <select id="f-4" className="w-full border rounded px-3 py-2 mt-1" value={form.assetType}
              onChange={e => setForm(f => ({ ...f, assetType: e.target.value }))}>
              {ASSET_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-16" className="text-gray-600">地址</label>
            <input id="f-16" className="w-full border rounded px-3 py-2 mt-1" value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            {editing && form.rentalPropertyId && (() => {
              const linkedProp = properties.find(p => String(p.id) === String(form.rentalPropertyId));
              if (linkedProp?.address && linkedProp.address !== form.address) {
                return <p className="text-xs text-amber-600 mt-1">⚠ 與綁定物業地址不同（物業：{linkedProp.address}）</p>;
              }
              return null;
            })()}
          </div>
          <div>
            <label htmlFor="f-5" className="text-gray-600">面積（㎡）</label>
            <input id="f-5" type="text" inputMode="decimal" className="w-full border rounded px-3 py-2 mt-1" value={form.areaSqm}
              onChange={e => setForm(f => ({ ...f, areaSqm: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="f-6" className="text-gray-600">取得日期（選填）</label>
            <input id="f-6" type="date" className="w-full border rounded px-3 py-2 mt-1" value={form.acquisitionDate}
              onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} />
          </div>
          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-gray-700 font-medium mb-2">出租與稅費標記</p>
            <div className="space-y-2">
              {[
                { key: 'isAvailableForRental', label: '可出租' },
                { key: 'hasHouseTax', label: '有房屋稅' },
                { key: 'hasLandTax', label: '有地價稅' },
                { key: 'hasMaintenanceFee', label: '有維修費' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[item.key]}
                    onChange={e => setForm(f => ({ ...f, [item.key]: e.target.checked }))} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="border-t pt-3 mt-1">
            <p className="text-xs font-medium text-gray-500 mb-2">所有權資訊</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="f-19" className="text-gray-600">所有權人</label>
                <input id="f-19" className="w-full border rounded px-3 py-2 mt-1" placeholder="登記所有權人姓名" value={form.ownerName}
                  onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="f-20" className="text-gray-600">建物登記所有權人</label>
                <input id="f-20" className="w-full border rounded px-3 py-2 mt-1" placeholder="建物謄本所載所有權人" value={form.registeredOwner}
                  onChange={e => setForm(f => ({ ...f, registeredOwner: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="f-21" className="text-gray-600">房屋稅稅籍編號</label>
                <input id="f-21" className="w-full border rounded px-3 py-2 mt-1" placeholder="稅籍編號" value={form.houseTaxRegistrationNo}
                  onChange={e => setForm(f => ({ ...f, houseTaxRegistrationNo: e.target.value }))} />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="f-17" className="text-gray-600">綁定租屋物業</label>
            <select id="f-17" className="w-full border rounded px-3 py-2 mt-1" value={form.rentalPropertyId}
              onChange={e => setForm(f => ({ ...f, rentalPropertyId: e.target.value }))}>
              <option value="">不綁定</option>
              {propertyOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.buildingName ? `${p.buildingName} · ` : ''}{p.name}{p.unitNo ? `（${p.unitNo}）` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-18" className="text-gray-600">備註</label>
            <textarea id="f-18" className="w-full border rounded px-3 py-2 mt-1" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-between items-center gap-2 mt-6">
          <div>
            {editing && (
              <button type="button" disabled={saving}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                onClick={() => { setShowModal(false); deleteAsset(editing); }}>
                刪除資產
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => setShowModal(false)}>取消</button>
            <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" onClick={saveModal}>
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
