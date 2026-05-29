'use client';

import Link from 'next/link';

const PROPERTY_STATUSES = [
  { value: 'available',    label: '空置' },
  { value: 'rented',       label: '已出租' },
  { value: 'maintenance',  label: '維護中' },
  { value: 'renovation',   label: '裝修中' },
  { value: 'pending',      label: '洽談中' },
  { value: 'inactive',     label: '停用' },
];

/**
 * 共用物業編輯 Modal（assets + rentals 兩頁共用）
 *
 * Props:
 *   mode              'assets' | 'rentals'
 *   open              boolean
 *   onClose           () => void
 *   form              object  (propForm / propertyForm)
 *   setForm           fn
 *   editingProperty   object | null
 *   accounts          array
 *   saving            boolean
 *   onSave            () => void
 *   onDelete?         () => void   — 顯示「刪除物業」按鈕（rentals）
 *   onOpenRentFiling? () => void   — 公益出租人區塊的「開啟租金申報」連結（rentals）
 */
export default function PropertyModal({
  mode,
  open,
  onClose,
  form,
  setForm,
  editingProperty,
  accounts,
  saving,
  onSave,
  onDelete,
  onOpenRentFiling,
}) {
  if (!open) return null;

  const isEditing      = !!editingProperty;
  const isLinkedAsset  = !!(editingProperty?.asset?.id || editingProperty?.asset);
  const linkedAssetId  = editingProperty?.asset?.id;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          {/* ── Title ─────────────────────────────────────────────── */}
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {mode === 'assets'
              ? (isEditing ? `編輯物業：${editingProperty.name}` : '新增物業')
              : '租屋營運設定'}
          </h3>

          {mode === 'rentals' && (
            <p className="text-xs text-gray-500 mb-3">
              名稱與地址以「資產管理」主檔為準（儲存後會同步至租屋物業）；此處為大樓／戶別、收租帳戶、公益出租與備註等營運欄位。
            </p>
          )}

          {/* ── Linked asset notice ───────────────────────────────── */}
          {isLinkedAsset && (
            <div className="text-xs bg-teal-50 border border-teal-100 rounded px-3 py-2 mb-3 text-teal-800">
              已連結資產主檔，名稱與地址由資產端管理。
              {mode === 'rentals' && linkedAssetId && (
                <Link href={`/assets?id=${linkedAssetId}`} className="font-medium underline ml-1">
                  編輯名稱與地址
                </Link>
              )}
            </div>
          )}

          <div className="space-y-3 text-sm">
            {/* 名稱 / 狀態 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-name" className="text-gray-600">名稱 *</label>
                <input
                  id="pm-name"
                  className={`w-full border rounded px-3 py-2 mt-1 ${isLinkedAsset ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                  value={form.name || ''}
                  disabled={isLinkedAsset}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="pm-status" className="text-gray-600">狀態</label>
                <select
                  id="pm-status"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.status || 'available'}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  {PROPERTY_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 地址 */}
            <div>
              <label htmlFor="pm-address" className="text-gray-600">地址</label>
              <input
                id="pm-address"
                className={`w-full border rounded px-3 py-2 mt-1 ${isLinkedAsset ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                value={form.address || ''}
                disabled={isLinkedAsset}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>

            {/* 大樓名稱 / 戶別 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-building" className="text-gray-600">大樓名稱</label>
                <input
                  id="pm-building"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.buildingName || ''}
                  onChange={e => setForm(f => ({ ...f, buildingName: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="pm-unitNo" className="text-gray-600">戶別</label>
                <input
                  id="pm-unitNo"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.unitNo || ''}
                  onChange={e => setForm(f => ({ ...f, unitNo: e.target.value }))}
                />
              </div>
            </div>

            {/* 分類 / 序號 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-category" className="text-gray-600">分類</label>
                <select
                  id="pm-category"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.category || ''}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="公司">公司</option>
                  <option value="湯三姐">湯三姐</option>
                </select>
              </div>
              <div>
                <label htmlFor="pm-sortOrder" className="text-gray-600">序號</label>
                <input
                  id="pm-sortOrder"
                  type="number"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.sortOrder ?? ''}
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>

            {/* 所有權人 / 房屋稅稅籍編號 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-ownerName" className="text-gray-600">所有權人</label>
                <input
                  id="pm-ownerName"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.ownerName || ''}
                  placeholder="建物登記所有權人"
                  onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="pm-houseTax" className="text-gray-600">房屋稅稅籍編號</label>
                <input
                  id="pm-houseTax"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.houseTaxRegistrationNo || ''}
                  placeholder="對應房屋稅單"
                  onChange={e => setForm(f => ({ ...f, houseTaxRegistrationNo: e.target.value }))}
                />
              </div>
            </div>

            {/* 收租帳戶 / 押金帳戶 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pm-rentAccount" className="text-gray-600">收租帳戶</label>
                <select
                  id="pm-rentAccount"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.rentCollectAccountId || ''}
                  onChange={e => setForm(f => ({ ...f, rentCollectAccountId: e.target.value }))}
                >
                  <option value="">無</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pm-depositAccount" className="text-gray-600">押金帳戶</label>
                <select
                  id="pm-depositAccount"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.depositAccountId || ''}
                  onChange={e => setForm(f => ({ ...f, depositAccountId: e.target.value }))}
                >
                  <option value="">無</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {/* 備註 */}
            <div>
              <label htmlFor="pm-note" className="text-gray-600">備註</label>
              <textarea
                id="pm-note"
                className="w-full border rounded px-3 py-2 mt-1"
                rows={2}
                value={form.note || ''}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>

            {/* 收水電費 */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pm-collectUtility"
                checked={!!form.collectUtilityFee}
                onChange={e => setForm(f => ({ ...f, collectUtilityFee: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="pm-collectUtility" className="text-sm text-gray-700">
                需向租客收取水電費
              </label>
              {mode === 'rentals' && (
                <span className="text-xs text-gray-400">（勾選後收租工作台將顯示電費欄）</span>
              )}
            </div>

            {/* 公益出租人 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="pm-publicInterest"
                  checked={!!form.publicInterestLandlord}
                  onChange={e => setForm(f => ({ ...f, publicInterestLandlord: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="pm-publicInterest" className="text-sm text-gray-700 font-medium">
                  是否為公益出租人
                </label>
              </div>

              {form.publicInterestLandlord && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                  {mode === 'rentals' && (
                    <p className="text-xs text-green-800">
                      <strong>公益出租</strong>之申報金額、預估房屋稅請至「租金申報」分頁依<strong>所得年度</strong>填寫同一張總表。
                    </p>
                  )}
                  {mode === 'rentals' && onOpenRentFiling && (
                    <button
                      type="button"
                      onClick={onOpenRentFiling}
                      className="text-xs text-teal-700 underline font-medium"
                    >
                      開啟租金申報 →
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pm-piApplicant" className="text-xs text-green-700 font-medium block mb-1">申請人名稱</label>
                      <input
                        id="pm-piApplicant"
                        type="text"
                        value={form.publicInterestApplicant || ''}
                        onChange={e => setForm(f => ({ ...f, publicInterestApplicant: e.target.value }))}
                        placeholder="申請公益出租人之人名"
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="pm-piRent" className="text-xs text-green-700 font-medium block mb-1">公益月租金</label>
                      <input
                        id="pm-piRent"
                        type="number"
                        min="0"
                        step="1"
                        value={form.publicInterestRent || ''}
                        onChange={e => setForm(f => ({ ...f, publicInterestRent: e.target.value }))}
                        placeholder="0"
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pm-piStart" className="text-xs text-green-700 font-medium block mb-1">租約開始日期</label>
                      <input
                        id="pm-piStart"
                        type="date"
                        value={form.publicInterestStartDate || ''}
                        onChange={e => setForm(f => ({ ...f, publicInterestStartDate: e.target.value }))}
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="pm-piEnd" className="text-xs text-green-700 font-medium block mb-1">租約結束日期</label>
                      <input
                        id="pm-piEnd"
                        type="date"
                        value={form.publicInterestEndDate || ''}
                        onChange={e => setForm(f => ({ ...f, publicInterestEndDate: e.target.value }))}
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pm-piNote" className="text-xs text-green-700 font-medium block mb-1">公益出租人備註</label>
                    <textarea
                      id="pm-piNote"
                      value={form.publicInterestNote || ''}
                      onChange={e => setForm(f => ({ ...f, publicInterestNote: e.target.value }))}
                      placeholder="申請相關備註"
                      className="w-full border border-green-300 rounded px-2 py-1.5 text-sm bg-white"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────── */}
          <div className="flex justify-between items-center gap-2 mt-6 flex-wrap">
            <div>
              {onDelete && isEditing && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                >
                  刪除物業
                </button>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                onClick={onSave}
              >
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
