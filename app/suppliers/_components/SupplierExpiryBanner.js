'use client';

export default function SupplierExpiryBanner({ expiredItems, soonItems, onDismiss }) {
  return (
    <div className="bg-red-50 border-l-4 border-red-500 rounded p-3 mb-4 flex items-start justify-between gap-3">
      <div className="text-sm text-red-700">
        <span className="font-semibold">⚠️ 合約到期警告：</span>
        {expiredItems.length > 0 && (
          <span>已過期 <b>{expiredItems.length}</b> 家（{expiredItems.map(s => s.name).join('、')}）。</span>
        )}
        {soonItems.length > 0 && (
          <span>30 天內到期 <b>{soonItems.length}</b> 家（{soonItems.map(s => s.name).join('、')}）。</span>
        )}
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0">×</button>
    </div>
  );
}
