'use client';

const PROJECT_STATUS = ['進行中', '已結案', '暫停'];

export default function ProjectFormModal({
  isOpen, editingProject, projectForm, setProjectForm,
  projectSaving, warehouseDepartments, onClose, onSave,
}) {
  if (!isOpen) return null;

  const warehouseList = (warehouseDepartments?.list || []).filter(w => w.type === 'building');
  const selectedWh = warehouseList.find(w => w.id === parseInt(projectForm.warehouseId));
  const deptList = selectedWh?.departments || [];

  const inp = 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 outline-none';

  function handleWarrantyStart(s) {
    const months = parseInt(projectForm.warrantyMonths || 0);
    setProjectForm(f => ({
      ...f,
      warrantyStartDate: s,
      warrantyEndDate: s && months
        ? new Date(new Date(s).setMonth(new Date(s).getMonth() + months)).toISOString().slice(0, 10)
        : f.warrantyEndDate,
    }));
  }

  function handleWarrantyMonths(m) {
    const s = projectForm.warrantyStartDate;
    setProjectForm(f => ({
      ...f,
      warrantyMonths: m,
      warrantyEndDate: s && m
        ? new Date(new Date(s).setMonth(new Date(s).getMonth() + parseInt(m))).toISOString().slice(0, 10)
        : f.warrantyEndDate,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{editingProject ? '編輯工程案' : '新增工程案'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-code" className="block text-xs text-gray-500 mb-1">工程代碼 *</label>
              <input id="pf-code" value={projectForm.code} onChange={e => setProjectForm(f => ({ ...f, code: e.target.value }))} className={inp} placeholder="例：PRJ-001" disabled={!!editingProject} />
            </div>
            <div>
              <label htmlFor="pf-name" className="block text-xs text-gray-500 mb-1">名稱 *</label>
              <input id="pf-name" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-client" className="block text-xs text-gray-500 mb-1">業主／客戶</label>
              <input id="pf-client" value={projectForm.clientName} onChange={e => setProjectForm(f => ({ ...f, clientName: e.target.value }))} className={inp} />
            </div>
            <div>
              <label htmlFor="pf-amt" className="block text-xs text-gray-500 mb-1">業主合約金額（收款總額）</label>
              <input id="pf-amt" type="number" value={projectForm.clientContractAmount} onChange={e => setProjectForm(f => ({ ...f, clientContractAmount: e.target.value }))} className={inp} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-start" className="block text-xs text-gray-500 mb-1">開始日期</label>
              <input id="pf-start" type="date" value={projectForm.startDate} onChange={e => setProjectForm(f => ({ ...f, startDate: e.target.value }))} className={inp} />
            </div>
            <div>
              <label htmlFor="pf-end" className="block text-xs text-gray-500 mb-1">結束日期</label>
              <input id="pf-end" type="date" value={projectForm.endDate} onChange={e => setProjectForm(f => ({ ...f, endDate: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-budget" className="block text-xs text-gray-500 mb-1">預算</label>
              <input id="pf-budget" type="number" value={projectForm.budget} onChange={e => setProjectForm(f => ({ ...f, budget: e.target.value }))} className={inp} step="0.01" />
            </div>
            <div>
              <label htmlFor="pf-status" className="block text-xs text-gray-500 mb-1">狀態</label>
              <select id="pf-status" value={projectForm.status} onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                {PROJECT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-wh" className="block text-xs text-gray-500 mb-1">館別</label>
              <select id="pf-wh" value={projectForm.warehouseId} onChange={e => setProjectForm(f => ({ ...f, warehouseId: e.target.value, departmentId: '' }))} className={inp}>
                <option value="">請選擇</option>
                {warehouseList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pf-dept" className="block text-xs text-gray-500 mb-1">部門</label>
              <select id="pf-dept" value={projectForm.departmentId} onChange={e => setProjectForm(f => ({ ...f, departmentId: e.target.value }))} className={inp}>
                <option value="">請選擇</option>
                {deptList.map(d => typeof d === 'object' && d.id != null
                  ? <option key={d.id} value={d.id}>{d.name}</option>
                  : <option key={d} value={d}>{d}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pf-loc" className="block text-xs text-gray-500 mb-1">工程地點</label>
            <input id="pf-loc" value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-bldg" className="block text-xs text-gray-500 mb-1">建造號碼</label>
              <input id="pf-bldg" value={projectForm.buildingNo} onChange={e => setProjectForm(f => ({ ...f, buildingNo: e.target.value }))} className={inp} />
            </div>
            <div>
              <label htmlFor="pf-permit" className="block text-xs text-gray-500 mb-1">使造號碼</label>
              <input id="pf-permit" value={projectForm.permitNo} onChange={e => setProjectForm(f => ({ ...f, permitNo: e.target.value }))} className={inp} />
            </div>
          </div>
          <div>
            <label htmlFor="pf-note" className="block text-xs text-gray-500 mb-1">備註</label>
            <textarea id="pf-note" value={projectForm.note} onChange={e => setProjectForm(f => ({ ...f, note: e.target.value }))} className={inp} rows={2} />
          </div>

          {/* 保固期設定 */}
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-purple-700 mb-2">保固期設定</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">保固開始日</label>
                <input type="date" value={projectForm.warrantyStartDate} onChange={e => handleWarrantyStart(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">保固月數</label>
                <input type="number" min="1" max="120" value={projectForm.warrantyMonths} onChange={e => handleWarrantyMonths(e.target.value)} className={inp} placeholder="例：24" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">保固結束日</label>
                <input type="date" value={projectForm.warrantyEndDate} onChange={e => setProjectForm(f => ({ ...f, warrantyEndDate: e.target.value }))} className={inp} />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs text-gray-500 mb-1">保固備註</label>
              <input value={projectForm.warrantyNote} onChange={e => setProjectForm(f => ({ ...f, warrantyNote: e.target.value }))} className={inp} placeholder="例：結構防水 2 年、其他 1 年" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm" disabled={projectSaving}>取消</button>
          <button onClick={onSave} disabled={projectSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">
            {projectSaving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
