'use client';

import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useProducts } from './_hooks/useProducts';
import ProductForm from './_components/ProductForm';
import ProductTable from './_components/ProductTable';
import ProductPagination from './_components/ProductPagination';

export default function ProductsPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;

  const {
    products,
    loading,
    productsError,
    productSaving,
    showAddForm,
    setShowAddForm,
    editingProduct,
    accountingSearch,
    setAccountingSearch,
    showAccountingDropdown,
    setShowAccountingDropdown,
    inventorySubjectSearch,
    setInventorySubjectSearch,
    showInventorySubjectDropdown,
    setShowInventorySubjectDropdown,
    currentPage,
    itemsPerPage,
    setItemsPerPage,
    totalCount,
    searchKeyword,
    setSearchKeyword,
    searchTimer,
    setSearchTimer,
    warehouseOptions,
    newWarehouse,
    setNewWarehouse,
    showWarehouseManager,
    setShowWarehouseManager,
    formData,
    setFormData,
    filteredAccounting,
    filteredInventorySubjects,
    totalPages,
    currentProducts,
    getPageNumbers,
    fetchProducts,
    handleSubmit,
    handleEdit,
    handleDelete,
    handleImport,
    addWarehouseOption,
    removeWarehouseOption,
    cancelForm,
  } = useProducts();

  if (loading) {
    return (
      <div className="min-h-screen page-bg-products flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-products">
      <Navigation borderColor="border-purple-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">產品主檔管理</h2>
          {isLoggedIn && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ➕ 新增產品
            </button>
          )}
        </div>

        {productsError && <FetchErrorBanner message={productsError} onRetry={() => fetchProducts(1, itemsPerPage, searchKeyword)} />}

        {showAddForm && (
          <ProductForm
            editingProduct={editingProduct}
            formData={formData}
            setFormData={setFormData}
            productSaving={productSaving}
            accountingSearch={accountingSearch}
            setAccountingSearch={setAccountingSearch}
            showAccountingDropdown={showAccountingDropdown}
            setShowAccountingDropdown={setShowAccountingDropdown}
            inventorySubjectSearch={inventorySubjectSearch}
            setInventorySubjectSearch={setInventorySubjectSearch}
            showInventorySubjectDropdown={showInventorySubjectDropdown}
            setShowInventorySubjectDropdown={setShowInventorySubjectDropdown}
            filteredAccounting={filteredAccounting}
            filteredInventorySubjects={filteredInventorySubjects}
            warehouseOptions={warehouseOptions}
            newWarehouse={newWarehouse}
            setNewWarehouse={setNewWarehouse}
            showWarehouseManager={showWarehouseManager}
            setShowWarehouseManager={setShowWarehouseManager}
            addWarehouseOption={addWarehouseOption}
            removeWarehouseOption={removeWarehouseOption}
            handleSubmit={handleSubmit}
            cancelForm={cancelForm}
          />
        )}

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="搜尋產品（代碼、名稱、類別）..."
              value={searchKeyword}
              onChange={(e) => {
                const val = e.target.value;
                setSearchKeyword(val);
                if (searchTimer) clearTimeout(searchTimer);
                setSearchTimer(setTimeout(() => {
                  fetchProducts(1, itemsPerPage, val);
                }, 400));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (searchTimer) clearTimeout(searchTimer);
                  fetchProducts(1, itemsPerPage, searchKeyword);
                }
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => {
                if (searchKeyword) {
                  setSearchKeyword('');
                  if (searchTimer) clearTimeout(searchTimer);
                  fetchProducts(1, itemsPerPage, '');
                }
              }}
              className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
            >
              {searchKeyword ? '清除' : '搜尋'}
            </button>
            <ExportButtons
              data={products.map(p => ({
                ...p,
                isInStockLabel: p.isInStock ? '是' : '否',
              }))}
              columns={EXPORT_CONFIGS.products.columns}
              exportName={EXPORT_CONFIGS.products.filename}
              title="產品主檔管理"
              sheetName="產品主檔"
            />
            {isLoggedIn && (
              <button
                onClick={handleImport}
                className="px-4 py-2 text-blue-600 hover:underline"
              >
                匯入
              </button>
            )}
          </div>
        </div>

        <ProductTable
          currentProducts={currentProducts}
          totalCount={totalCount}
          searchKeyword={searchKeyword}
          isLoggedIn={isLoggedIn}
          handleEdit={handleEdit}
          handleDelete={handleDelete}
        />

        <ProductPagination
          totalPages={totalPages}
          currentPage={currentPage}
          totalCount={totalCount}
          searchKeyword={searchKeyword}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
          fetchProducts={fetchProducts}
          getPageNumbers={getPageNumbers}
        />
      </main>
    </div>
  );
}
