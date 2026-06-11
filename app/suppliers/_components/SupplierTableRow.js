'use client';

export default function SupplierTableRow({ supplier, index, getExpiryStatus, onEdit, onDelete }) {
  const expiryStatus = getExpiryStatus(supplier.contractEndDate);
  return (
    <tr key={supplier.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${expiryStatus === 'expired' ? 'bg-red-50' : expiryStatus === 'warning' ? 'bg-yellow-50' : ''}`}>
      <td className="px-2 py-2 text-xs font-medium">{supplier.id}</td>
      <td className="px-2 py-2 text-xs" title={supplier.name}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1 flex-wrap">
            {supplier.isBlacklisted && (
              <span className="px-1 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold shrink-0" title={supplier.blacklistReason || '黑名單'}>🚫</span>
            )}
            <span className="truncate">{supplier.name}</span>
          </div>
          {supplier.rating && (
            <span className="text-yellow-400 text-xs leading-none">{'★'.repeat(supplier.rating)}{'☆'.repeat(5 - supplier.rating)}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs">{supplier.taxId || '-'}</td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.contact}>{supplier.contact || '-'}</td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.personInCharge}>{supplier.personInCharge || '-'}</td>
      <td className="px-2 py-2 text-xs">{supplier.phone || '-'}</td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.address || ''}>{supplier.address || '-'}</td>
      <td className="px-2 py-2 text-xs">{supplier.paymentTerms || '-'}</td>
      <td className="px-2 py-2 text-xs">{supplier.contractDate ? supplier.contractDate.split('T')[0] : '-'}</td>
      <td className="px-2 py-2 text-xs">
        <div className="flex items-center gap-1">
          <span>{supplier.contractEndDate ? supplier.contractEndDate.split('T')[0] : '-'}</span>
          {expiryStatus === 'expired' && (
            <span className="text-red-600 font-bold" title="合約已過期">!!</span>
          )}
          {expiryStatus === 'warning' && (
            <span className="text-yellow-600 font-bold" title="合約即將到期（2個月內）">!</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs">
        <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${
          supplier.paymentStatus === '已付款' ? 'bg-green-100 text-green-700' :
          supplier.paymentStatus === '部分付款' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {supplier.paymentStatus || '未付款'}
        </span>
      </td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.checkPayee || ''}>{supplier.checkPayee || '-'}</td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.industryCategory || ''}>{supplier.industryCategory || '-'}</td>
      <td className="px-2 py-2 text-xs text-center">{supplier.sortOrder != null ? supplier.sortOrder : '-'}</td>
      <td className="px-2 py-2 text-xs truncate" title={supplier.remarks || ''}>
        {supplier.remarks || '-'}
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <button onClick={() => onEdit(supplier)} className="text-blue-600 hover:underline text-xs">
            編輯
          </button>
          <button onClick={() => onDelete(supplier.id)} className="text-red-600 hover:underline text-xs">
            刪除
          </button>
        </div>
      </td>
    </tr>
  );
}
