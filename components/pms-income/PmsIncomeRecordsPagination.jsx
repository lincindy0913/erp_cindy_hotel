'use client';

export default function PmsIncomeRecordsPagination({ recordsTotal, recordsLimit, recordsPage, setRecordsPage }) {
  const totalPages = Math.ceil(recordsTotal / recordsLimit);
  if (totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, recordsPage - 2);
  const end = Math.min(totalPages, recordsPage + 2);
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="flex items-center justify-between mt-4">
      <span className="text-sm text-gray-600">
        共 {recordsTotal} 筆，第 {recordsPage}/{totalPages} 頁
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setRecordsPage(1)}
          disabled={recordsPage === 1}
          className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100"
        >
          首頁
        </button>
        <button
          type="button"
          onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
          disabled={recordsPage === 1}
          className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100"
        >
          上一頁
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setRecordsPage(p)}
            className={`px-3 py-1 text-xs border rounded ${
              p === recordsPage ? 'bg-teal-600 text-white border-teal-600' : 'hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRecordsPage((p) => Math.min(totalPages, p + 1))}
          disabled={recordsPage === totalPages}
          className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100"
        >
          下一頁
        </button>
        <button
          type="button"
          onClick={() => setRecordsPage(totalPages)}
          disabled={recordsPage === totalPages}
          className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-100"
        >
          末頁
        </button>
      </div>
    </div>
  );
}
