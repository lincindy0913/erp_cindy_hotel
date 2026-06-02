'use client';

export default function MasterDataSection({ masterDataCounts, auditInfo }) {
  const masterDataItems = [
    {
      icon: '📦',
      name: '產品資料',
      count: masterDataCounts.products,
      href: '/products',
      description: '管理所有產品品項、規格與庫存設定',
    },
    {
      icon: '🏢',
      name: '廠商管理',
      count: masterDataCounts.suppliers,
      href: '/suppliers',
      description: '管理供應商資訊、聯絡方式與付款條件',
    },
    {
      icon: '📊',
      name: '會計科目',
      count: masterDataCounts.accountingSubjects,
      href: '/accounting-subjects',
      description: '管理會計科目代碼、分類與傳票對應',
    },
    {
      icon: '🏨',
      name: '館別 / 部門',
      count: masterDataCounts.warehouses,
      href: '/warehouse-departments',
      description: '管理館別、部門組織架構設定',
    },
  ];

  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">主資料快速連結</h3>
        <p className="text-sm text-gray-500 mb-6">管理系統的基礎主檔資料，包含產品、廠商、會計科目與組織架構。</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {masterDataItems.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="group block p-5 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-400 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">{item.name}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-gray-600">{item.count.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-end">
                <span className="text-xs text-gray-400 group-hover:text-gray-600 font-medium transition-colors">
                  前往管理 →
                </span>
              </div>
            </a>
          ))}
        </div>
        {renderAuditTrail('master-data')}
      </div>
    </div>
  );
}
