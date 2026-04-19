'use client';

export default function PmsIncomeTravelAgencyTab({
  loading,
  travelAgencyConfigs,
  setError,
  fetchTravelAgencyConfigs,
  setEditingTravelAgency,
  setTravelAgencyForm,
  setShowTravelAgencyModal,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">旅行社／代訂中心佣金配置</h3>
          <button
            type="button"
            onClick={() => {
              setEditingTravelAgency(null);
              setTravelAgencyForm({
                companyName: '',
                agencyCode: '',
                commissionPercentage: '',
                paymentType: 'NONE',
                dataSource: 'AUTO',
                paymentDueDay: '',
                paymentMethod: '',
                isActive: true,
              });
              setShowTravelAgencyModal(true);
            }}
            className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            ＋ 新增
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">設定應收(AR)／應付(AP)／無(NONE)，以及數據源：自動提取(AUTO)或每月手動輸入(MANUAL)。</p>
        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-medium">公司名稱</th>
                <th className="px-3 py-2 font-medium">代碼</th>
                <th className="px-3 py-2 font-medium">佣金%</th>
                <th className="px-3 py-2 font-medium">應收/應付</th>
                <th className="px-3 py-2 font-medium">數據源</th>
                <th className="px-3 py-2 font-medium text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {travelAgencyConfigs.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{c.companyName}</td>
                  <td className="px-3 py-2 text-gray-600">{c.agencyCode || '—'}</td>
                  <td className="px-3 py-2">{Number(c.commissionPercentage)}%</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        c.paymentType === 'AR' ? 'bg-teal-100 text-teal-800' : c.paymentType === 'AP' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {c.paymentType === 'AR' ? 'AR(應收)' : c.paymentType === 'AP' ? 'AP(應付)' : 'NONE'}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.dataSource === 'MANUAL' ? '手動' : '自動'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTravelAgency(c);
                        setTravelAgencyForm({
                          companyName: c.companyName,
                          agencyCode: c.agencyCode || '',
                          commissionPercentage: String(c.commissionPercentage),
                          paymentType: c.paymentType,
                          dataSource: c.dataSource,
                          paymentDueDay: c.paymentDueDay != null ? String(c.paymentDueDay) : '',
                          paymentMethod: c.paymentMethod || '',
                          isActive: c.isActive,
                        });
                        setShowTravelAgencyModal(true);
                      }}
                      className="text-teal-600 hover:underline text-xs"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('確定刪除？')) return;
                        try {
                          const r = await fetch(`/api/pms-income/travel-agency-config/${c.id}`, { method: 'DELETE' });
                          if (r.ok) fetchTravelAgencyConfigs();
                          else setError((await r.json())?.error?.message || '刪除失敗');
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                      className="ml-2 text-red-500 hover:underline text-xs"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
