'use client';

export default function ManualEntryModal({
  showManualEntryModal,
  setShowManualEntryModal,
  editingManualEntry,
  manualMonth,
  manualEntryForm,
  setManualEntryForm,
  setError,
  setSuccess,
  fetchManualEntries,
}) {
  if (!showManualEntryModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{editingManualEntry ? '編輯代訂記錄' : '新增代訂中心記錄'}（{manualMonth || '請選月份'}）</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="f-9" className="block text-gray-600 mb-1">代訂中心名稱 *</label>
            <input id="f-9" value={manualEntryForm.agencyName} onChange={e => setManualEntryForm(f => ({ ...f, agencyName: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 林董代訂(湯總)" />
          </div>
          <div>
            <label htmlFor="f-10" className="block text-gray-600 mb-1">本月房租總額 *</label>
            <input id="f-10" type="number" step="0.01" value={manualEntryForm.totalRoomRent} onChange={e => { const v = e.target.value; setManualEntryForm(f => ({ ...f, totalRoomRent: v })); }} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label htmlFor="f-11" className="block text-gray-600 mb-1">房晚數</label>
            <input id="f-11" type="number" value={manualEntryForm.roomNights} onChange={e => setManualEntryForm(f => ({ ...f, roomNights: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label htmlFor="f-12" className="block text-gray-600 mb-1">佣金 %</label>
            <input id="f-12" type="number" step="0.01" value={manualEntryForm.commissionPercentage} onChange={e => setManualEntryForm(f => ({ ...f, commissionPercentage: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label htmlFor="f-13" className="block text-gray-600 mb-1">應收/應付</label>
            <select id="f-13" value={manualEntryForm.arOrAp} onChange={e => setManualEntryForm(f => ({ ...f, arOrAp: e.target.value }))} className="w-full border rounded px-3 py-2">
              <option value="AP">AP（應付）</option>
              <option value="AR">AR（應收）</option>
              <option value="NONE">NONE</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-14" className="block text-gray-600 mb-1">備註</label>
            <input id="f-14" value={manualEntryForm.remarks} onChange={e => setManualEntryForm(f => ({ ...f, remarks: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setShowManualEntryModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
          <button type="button" onClick={async () => {
            if (!manualMonth || manualMonth.length !== 6) { setError('請填寫結算月份（格式 202603）'); return; }
            if (!manualEntryForm.agencyName.trim()) { setError('請填寫代訂中心名稱'); return; }
            const totalRoomRent = parseFloat(manualEntryForm.totalRoomRent) || 0;
            const pct = parseFloat(manualEntryForm.commissionPercentage) || 0;
            const commissionAmount = Math.round(totalRoomRent * (pct / 100) * 100) / 100;
            try {
              if (editingManualEntry) {
                const r = await fetch(`/api/pms-income/monthly-manual-commission/${editingManualEntry.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    agencyName: manualEntryForm.agencyName.trim(),
                    agencyCode: manualEntryForm.agencyCode.trim() || null,
                    totalRoomRent,
                    roomNights: parseInt(manualEntryForm.roomNights, 10) || 0,
                    commissionPercentage: pct,
                    commissionAmount,
                    arOrAp: manualEntryForm.arOrAp,
                    remarks: manualEntryForm.remarks.trim() || null,
                  }),
                });
                if (r.ok) { setShowManualEntryModal(false); setSuccess('已更新'); fetchManualEntries(); }
                else setError((await r.json())?.error?.message || '更新失敗');
              } else {
                const r = await fetch('/api/pms-income/monthly-manual-commission', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    settlementMonth: manualMonth,
                    agencyName: manualEntryForm.agencyName.trim(),
                    agencyCode: manualEntryForm.agencyCode.trim() || null,
                    totalRoomRent,
                    roomNights: parseInt(manualEntryForm.roomNights, 10) || 0,
                    commissionPercentage: pct,
                    commissionAmount,
                    arOrAp: manualEntryForm.arOrAp,
                    remarks: manualEntryForm.remarks.trim() || null,
                  }),
                });
                if (r.ok) { setShowManualEntryModal(false); setSuccess('已新增'); fetchManualEntries(); }
                else setError((await r.json())?.error?.message || '新增失敗');
              }
            } catch (e) { setError(e.message); }
          }} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">儲存</button>
        </div>
      </div>
    </div>
  );
}
