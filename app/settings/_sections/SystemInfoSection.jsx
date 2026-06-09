'use client';

import { useConfirm } from '@/context/ConfirmContext';

export default function SystemInfoSection({ systemInfo, showToast, fetchAllData, auditInfo }) {
  const confirm = useConfirm();
  const dbOk = systemInfo.dbStatus === '正常';

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

  const dataGroups = [
    {
      label: '商品與供應商',
      items: [
        { label: '產品數量',   value: systemInfo.productCount },
        { label: '廠商數量',   value: systemInfo.supplierCount },
        { label: '館別數量',   value: systemInfo.warehouseCount },
        { label: '部門數量',   value: systemInfo.departmentCount },
      ],
    },
    {
      label: '交易與財務',
      items: [
        { label: '進貨單數量',     value: systemInfo.purchaseCount },
        { label: '發票數量',       value: systemInfo.invoiceCount },
        { label: '支出記錄數',     value: systemInfo.expenseCount },
        { label: '現金交易筆數',   value: systemInfo.cashTransactionCount },
        { label: '現金帳戶數',     value: systemInfo.cashAccountCount },
        { label: '貸款筆數',       value: systemInfo.loanCount },
      ],
    },
    {
      label: '系統',
      items: [
        { label: '使用者數量', value: systemInfo.userCount },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* DB status banner */}
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${dbOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        <span className={`text-xl mt-0.5 ${dbOk ? 'text-emerald-500' : 'text-red-500'}`}>{dbOk ? '✅' : '❌'}</span>
        <div>
          <p className={`text-sm font-semibold ${dbOk ? 'text-emerald-800' : 'text-red-800'}`}>
            資料庫狀態：{systemInfo.dbStatus || '載入中...'}
          </p>
          {!dbOk && systemInfo.dbError && (
            <p className="text-xs text-red-600 mt-1 font-mono">{systemInfo.dbError}</p>
          )}
          {dbOk && (
            <p className="text-xs text-emerald-600 mt-0.5">PostgreSQL 連線正常，資料查詢成功</p>
          )}
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">系統版本</p>
          <p className="text-sm font-bold text-gray-700">{systemInfo.version || '—'}</p>
        </div>
      </div>

      {/* Data counts by group */}
      {dataGroups.map(group => (
        <div key={group.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{group.label}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.items.map(item => (
              <div key={item.label} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-sm text-gray-500">{item.label}</span>
                <span className="text-sm font-semibold text-gray-800">
                  {dbOk ? (item.value ?? 0).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">環境資訊</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-sm text-gray-500">框架</span>
            <span className="text-sm font-medium text-gray-700">Next.js 14 (App Router)</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-sm text-gray-500">ORM</span>
            <span className="text-sm font-medium text-gray-700">Prisma</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-sm text-gray-500">資料庫</span>
            <span className="text-sm font-medium text-gray-700">PostgreSQL</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-sm text-gray-500">UI 框架</span>
            <span className="text-sm font-medium text-gray-700">Tailwind CSS</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-700">資料庫維護</h3>
            <p className="text-sm text-gray-400 mt-1">重新整理系統快取及資料庫統計資訊</p>
          </div>
          <button
            onClick={() => {
              fetchAllData();
              showToast('系統資訊已重新載入');
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors border border-gray-300"
          >
            重新載入
          </button>
        </div>
        {renderAuditTrail('system-info')}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-700">回填廠商資料</h3>
            <p className="text-sm text-gray-400 mt-1">將現金流交易記錄中遺漏的廠商資訊（出納付款、支票兌現）補齊，執行一次即可</p>
          </div>
          <button
            onClick={async () => {
              if (!(await confirm('確定要執行廠商資料回填嗎？此操作不可逆，建議先備份資料。', { title: '資料回填確認', danger: true }))) return;
              try {
                const res = await fetch('/api/admin/backfill-supplier-ids', { method: 'POST' });
                const d = await res.json();
                if (res.ok) showToast(d.message || '回填完成');
                else showToast(d.error?.message || '回填失敗', 'error');
              } catch { showToast('回填失敗', 'error'); }
            }}
            className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium transition-colors border border-orange-300"
          >
            執行回填
          </button>
        </div>
      </div>
    </div>
  );
}
