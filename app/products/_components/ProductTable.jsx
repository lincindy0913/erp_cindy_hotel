'use client';

export default function ProductTable({ currentProducts, totalCount, searchKeyword, isLoggedIn, handleEdit, handleDelete }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">編碼</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名稱</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">類別</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">單位</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">成本價</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">數量</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">列入庫存</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">倉庫位置</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計科目</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">存貨科目</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {currentProducts.length === 0 ? (
            <tr>
              <td colSpan="12" className="px-4 py-8 text-center text-gray-500">
                {totalCount === 0 ? (searchKeyword ? '找不到符合條件的產品' : '尚無產品資料') : '此頁無資料'}
              </td>
            </tr>
          ) : (
            currentProducts.map((product, index) => (
              <tr key={product.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-3 text-sm">{product.id}</td>
                <td className="px-4 py-3 text-sm">{product.code}</td>
                <td className="px-4 py-3 text-sm">{product.name}</td>
                <td className="px-4 py-3 text-sm">{product.category}</td>
                <td className="px-4 py-3 text-sm">{product.unit}</td>
                <td className="px-4 py-3 text-sm">NT$ {product.costPrice}</td>
                <td className="px-4 py-3 text-sm">{product.salesPrice}</td>
                <td className="px-4 py-3 text-sm">{product.isInStock ? '是' : '否'}</td>
                <td className="px-4 py-3 text-sm">{product.warehouseLocation || '-'}</td>
                <td className="px-4 py-3 text-sm">{product.accountingSubject || '-'}</td>
                <td className="px-4 py-3 text-sm">{product.inventorySubject || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {isLoggedIn && (
                      <>
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          刪除
                        </button>
                      </>
                    )}
                    <a
                      href={`/products/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      詳情
                    </a>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
