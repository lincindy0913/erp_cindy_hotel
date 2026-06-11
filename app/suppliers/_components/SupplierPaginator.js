'use client';

export default function SupplierPaginator({ totalCount, currentPage, itemsPerPage, setItemsPerPage, fetchSuppliers, filterKeyword }) {
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  if (totalPages <= 0) return null;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
    }
    return pages;
  };

  return (
    <div className="flex justify-center items-center gap-4 mt-6">
      <button onClick={() => fetchSuppliers(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
        className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">&lt; Prev</button>
      {totalPages > 5 && currentPage > 3 && (<>
        <button onClick={() => fetchSuppliers(1)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">1</button>
        <span className="px-2 text-gray-500">...</span>
      </>)}
      {getPageNumbers().map(p => (
        <button key={p} onClick={() => fetchSuppliers(p)}
          className={`px-4 py-2 rounded-lg ${p === currentPage ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'}`}>{p}</button>
      ))}
      {totalPages > 5 && currentPage < totalPages - 2 && (<>
        <span className="px-2 text-gray-500">...</span>
        <button onClick={() => fetchSuppliers(totalPages)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">{totalPages}</button>
      </>)}
      <button onClick={() => fetchSuppliers(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
        className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">Next &gt;</button>
      <span className="ml-4 text-sm text-gray-600">每頁</span>
      <select value={itemsPerPage} onChange={(e) => { const n = Number(e.target.value); setItemsPerPage(n); fetchSuppliers(1, n); }}
        className="px-2 py-1 border rounded">
        <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
      </select>
      <span className="text-sm text-gray-600">筆</span>
      <span className="ml-2 text-sm text-gray-600">(共 {totalCount} 筆{filterKeyword ? `，搜尋 "${filterKeyword}"` : ''}，第 {currentPage} / {totalPages} 頁)</span>
    </div>
  );
}
