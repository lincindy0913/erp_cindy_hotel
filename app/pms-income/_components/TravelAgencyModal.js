'use client';

export default function TravelAgencyModal({
  showTravelAgencyModal,
  setShowTravelAgencyModal,
  editingTravelAgency,
  travelAgencyForm,
  setTravelAgencyForm,
  paymentConfigAccounts,
  setError,
  setSuccess,
  fetchTravelAgencyConfigs,
}) {
  if (!showTravelAgencyModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{editingTravelAgency ? '編輯旅行社配置' : '新增旅行社配置'}</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label htmlFor="f" className="block text-gray-600 mb-1">公司名稱 *</label>
            <input id="f" value={travelAgencyForm.companyName} onChange={e => setTravelAgencyForm(f => ({ ...f, companyName: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 booking.com" />
          </div>
          <div>
            <label htmlFor="f-2" className="block text-gray-600 mb-1">代碼</label>
            <input id="f-2" value={travelAgencyForm.agencyCode} onChange={e => setTravelAgencyForm(f => ({ ...f, agencyCode: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="如 TA-01" />
          </div>
          <div>
            <label htmlFor="f-3" className="block text-gray-600 mb-1">佣金 % *</label>
            <input id="f-3" type="number" step="0.01" value={travelAgencyForm.commissionPercentage} onChange={e => setTravelAgencyForm(f => ({ ...f, commissionPercentage: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label htmlFor="f-4" className="block text-gray-600 mb-1">應收/應付</label>
            <select id="f-4" value={travelAgencyForm.paymentType} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentType: e.target.value }))} className="w-full border rounded px-3 py-2">
              <option value="NONE">NONE（無佣金）</option>
              <option value="AR">AR（應收）</option>
              <option value="AP">AP（應付）</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-5" className="block text-gray-600 mb-1">數據源</label>
            <select id="f-5" value={travelAgencyForm.dataSource} onChange={e => setTravelAgencyForm(f => ({ ...f, dataSource: e.target.value }))} className="w-full border rounded px-3 py-2">
              <option value="AUTO">AUTO（自動提取）</option>
              <option value="MANUAL">MANUAL（每月手動輸入）</option>
            </select>
          </div>
          {travelAgencyForm.paymentType === 'AP' && (
            <>
              <div>
                <label htmlFor="f-6" className="block text-gray-600 mb-1">應付日（每月幾號）</label>
                <input id="f-6" type="number" min="1" max="28" value={travelAgencyForm.paymentDueDay} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentDueDay: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="5" />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">支付帳戶</label>
                {paymentConfigAccounts.length > 0 ? (
                  <select
                    value={travelAgencyForm.paymentMethod || ''}
                    onChange={e => setTravelAgencyForm(f => ({ ...f, paymentMethod: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">未設定</option>
                    {paymentConfigAccounts.map(a => (
                      <option key={a.id} value={a.name}>{a.name}（{a.type}）</option>
                    ))}
                    {travelAgencyForm.paymentMethod && !paymentConfigAccounts.some(a => a.name === travelAgencyForm.paymentMethod) && (
                      <option value={travelAgencyForm.paymentMethod}>{travelAgencyForm.paymentMethod}（原始值）</option>
                    )}
                  </select>
                ) : (
                  <input value={travelAgencyForm.paymentMethod} onChange={e => setTravelAgencyForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded px-3 py-2" placeholder="銀行轉帳" />
                )}
              </div>
            </>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setShowTravelAgencyModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">取消</button>
          <button type="button" onClick={async () => {
            if (!travelAgencyForm.companyName.trim()) { setError('請填寫公司名稱'); return; }
            try {
              const url = editingTravelAgency ? `/api/pms-income/travel-agency-config/${editingTravelAgency.id}` : '/api/pms-income/travel-agency-config';
              const method = editingTravelAgency ? 'PUT' : 'POST';
              const body = { ...travelAgencyForm, commissionPercentage: parseFloat(travelAgencyForm.commissionPercentage) || 0, paymentDueDay: travelAgencyForm.paymentDueDay ? parseInt(travelAgencyForm.paymentDueDay, 10) : null };
              const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              if (r.ok) { setShowTravelAgencyModal(false); setSuccess('已儲存'); fetchTravelAgencyConfigs(); }
              else setError((await r.json())?.error?.message || '儲存失敗');
            } catch (e) { setError(e.message); }
          }} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">儲存</button>
        </div>
      </div>
    </div>
  );
}
