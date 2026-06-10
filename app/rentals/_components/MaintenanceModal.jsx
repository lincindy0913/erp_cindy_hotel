'use client';

const MAINTENANCE_CATEGORIES = ['一般維修', '水電', '電梯', '清潔', '管理費', '保全', '消防', '空調', '其他'];

export default function MaintenanceModal({
  showMaintenanceModal, setShowMaintenanceModal,
  editingMaintenance, setEditingMaintenance,
  maintenanceForm, setMaintenanceForm,
  maintenanceSaving, saveMaintenance,
  properties, accountingSubjects, accounts,
}) {
  if (!showMaintenanceModal) return null;

  function close() { setShowMaintenanceModal(false); setEditingMaintenance(null); }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={close}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">{editingMaintenance ? '編輯維護紀錄' : '新增維護紀錄'}</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="f-58" className="text-sm text-gray-600">物業 *</label>
              <select id="f-58" value={maintenanceForm.propertyId} onChange={e => setMaintenanceForm(f => ({ ...f, propertyId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" disabled={!!editingMaintenance}>
                <option value="">選擇物業</option>
                {properties.map(p => {
                  const suffix = p.asset?.hasMaintenanceFee ? ' [維護費]' : '';
                  return <option key={p.id} value={p.id}>{p.name}{suffix}</option>;
                })}
              </select>
              {maintenanceForm.propertyId && !editingMaintenance && (() => {
                const p = properties.find(x => String(x.id) === String(maintenanceForm.propertyId));
                if (p?.asset && !p.asset.hasMaintenanceFee) {
                  return <p className="text-xs text-amber-600 mt-1">⚠ 此物業資產主檔未標記「有維修費」，請確認</p>;
                }
                return null;
              })()}
            </div>
            <div>
              <label htmlFor="f-90" className="text-sm text-gray-600">日期 *</label>
              <input id="f-90" type="date" value={maintenanceForm.maintenanceDate} onChange={e => setMaintenanceForm(f => ({ ...f, maintenanceDate: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-59" className="text-sm text-gray-600">類別 *</label>
              <select id="f-59" value={maintenanceForm.category} onChange={e => setMaintenanceForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-91" className="text-sm text-gray-600">金額 *</label>
              <input id="f-91" type="number" value={maintenanceForm.amount} onChange={e => setMaintenanceForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="f-92" className="text-sm text-gray-600">會計科目 *</label>
              <select id="f-92" value={maintenanceForm.accountingSubjectId} onChange={e => setMaintenanceForm(f => ({ ...f, accountingSubjectId: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                <option value="">請選擇會計科目</option>
                {accountingSubjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </select>
            </div>
            {!editingMaintenance && (
              <div>
                <label htmlFor="f-93" className="text-sm text-gray-600">支出戶頭 *</label>
                <select id="f-93" value={maintenanceForm.accountId} onChange={e => setMaintenanceForm(f => ({ ...f, accountId: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">請選擇（存檔後同步至出納待出納）</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>)}
                </select>
              </div>
            )}
            <div className="border-t pt-3 mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={maintenanceForm.isEmployeeAdvance}
                  onChange={e => setMaintenanceForm(f => ({ ...f, isEmployeeAdvance: e.target.checked, advancedBy: e.target.checked ? f.advancedBy : '', advancePaymentMethod: '現金' }))} />
                <span className="font-medium text-gray-700">員工代墊款</span>
              </label>
              {maintenanceForm.isEmployeeAdvance && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label htmlFor="f-94" className="text-xs text-gray-500">代墊員工 *</label>
                    <input id="f-94" value={maintenanceForm.advancedBy} onChange={e => setMaintenanceForm(f => ({ ...f, advancedBy: e.target.value }))}
                      placeholder="員工姓名" className="w-full border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="f-60" className="text-xs text-gray-500">代墊方式</label>
                    <select id="f-60" value={maintenanceForm.advancePaymentMethod} onChange={e => setMaintenanceForm(f => ({ ...f, advancePaymentMethod: e.target.value }))}
                      className="w-full border rounded px-3 py-1.5 text-sm">
                      <option value="現金">現金</option>
                      <option value="信用卡">信用卡</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t pt-3 mt-2">
              <p className="text-xs text-gray-500 mb-2">費用性質（影響年度費用分析）</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={maintenanceForm.isCapitalized}
                    onChange={e => setMaintenanceForm(f => ({ ...f, isCapitalized: e.target.checked }))} />
                  <span className="text-gray-700">資本化支出</span>
                  <span className="text-xs text-gray-400">（設備改良、工程等）</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={maintenanceForm.isRecurring}
                    onChange={e => setMaintenanceForm(f => ({ ...f, isRecurring: e.target.checked }))} />
                  <span className="text-gray-700">例行性費用</span>
                  <span className="text-xs text-gray-400">（電梯年檢、定期保養）</span>
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="f-61" className="text-sm text-gray-600">備註</label>
              <textarea id="f-61" value={maintenanceForm.note} onChange={e => setMaintenanceForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={close} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
            <button onClick={saveMaintenance} disabled={maintenanceSaving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
              {maintenanceSaving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
