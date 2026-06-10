'use client';

export default function ProductPagination({
  totalPages,
  currentPage,
  totalCount,
  searchKeyword,
  itemsPerPage,
  setItemsPerPage,
  fetchProducts,
  getPageNumbers,
}) {
  if (totalPages <= 0) return null;

  return (
    <div className="flex justify-center items-center gap-4 mt-6">
      <button
        onClick={() => fetchProducts(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        &lt; Prev
      </button>

      {totalPages > 5 && currentPage > 3 && (
        <>
          <button
            onClick={() => fetchProducts(1)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100"
          >
            1
          </button>
          <span className="px-2 text-gray-500">...</span>
        </>
      )}

      {getPageNumbers().map((pageNum) => (
        <button
          key={pageNum}
          onClick={() => fetchProducts(pageNum)}
          className={`px-4 py-2 rounded-lg ${
            pageNum === currentPage
              ? 'bg-blue-600 text-white'
              : 'border hover:bg-gray-100'
          }`}
        >
          {pageNum}
        </button>
      ))}

      {totalPages > 5 && currentPage < totalPages - 2 && (
        <>
          <span className="px-2 text-gray-500">...</span>
          <button
            onClick={() => fetchProducts(totalPages)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => fetchProducts(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="px-4 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next &gt;
      </button>

      <span className="ml-4 text-sm text-gray-600">每頁顯示</span>
      <select
        value={itemsPerPage}
        onChange={(e) => {
          const newLimit = Number(e.target.value);
          setItemsPerPage(newLimit);
          fetchProducts(1, newLimit);
        }}
        className="px-2 py-1 border rounded"
      >
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
      <span className="text-sm text-gray-600">筆</span>
      <span className="ml-2 text-sm text-gray-600">
        (共 {totalCount} 筆{searchKeyword ? `，搜尋 "${searchKeyword}"` : ''}，第 {currentPage} / {totalPages} 頁)
      </span>
    </div>
  );
}
