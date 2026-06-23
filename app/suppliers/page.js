'use client';

import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import SupplierForm from '@/components/suppliers/SupplierForm';
import { useSuppliers } from './_hooks/useSuppliers';
import SupplierExpiryBanner from './_components/SupplierExpiryBanner';
import SupplierSearchBar from './_components/SupplierSearchBar';
import SupplierTableHeader from './_components/SupplierTableHeader';
import SupplierTableRow from './_components/SupplierTableRow';
import SupplierPaginator from './_components/SupplierPaginator';

export default function SuppliersPage() {
  const h = useSuppliers();

  if (h.loading) {
    return (
      <div className="min-h-screen page-bg-suppliers flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-suppliers">
      <Navigation borderColor="border-teal-500" />

      <main className="max-w-full mx-auto px-4 py-8">
        {!h.bannerDismissed && h.expiringItems.length > 0 && (
          <SupplierExpiryBanner
            expiredItems={h.expiredItems}
            soonItems={h.soonItems}
            onDismiss={() => h.setBannerDismissed(true)}
          />
        )}

        {h.suppliersError && (
          <FetchErrorBanner
            message={h.suppliersError}
            onRetry={() => h.fetchSuppliers(1, h.itemsPerPage, h.filterKeyword)}
          />
        )}

        <ModuleGuideCard
          title="廠商管理流程指引"
          color="blue"
          storageKey="guide-suppliers"
          steps={[
            { label: '新增廠商', desc: '填寫廠商名稱、統一編號、付款條件等基本資料' },
            { label: '上傳合約', desc: '可上傳廠商合約附件，並設定到期提醒日期' },
            { label: '關聯進貨', desc: '廠商設定完成後，進貨單即可選擇此廠商' },
            { label: '追蹤到期合約', desc: '系統自動提醒即將到期的廠商合約' },
          ]}
        />

        <SupplierSearchBar
          filterKeyword={h.filterKeyword}
          setFilterKeyword={h.setFilterKeyword}
          searchTimer={h.searchTimer}
          setSearchTimer={h.setSearchTimer}
          fetchSuppliers={h.fetchSuppliers}
          itemsPerPage={h.itemsPerPage}
          showDateFilterMenu={h.showDateFilterMenu}
          setShowDateFilterMenu={h.setShowDateFilterMenu}
          dateFilterType={h.dateFilterType}
          setDateFilterType={h.setDateFilterType}
          customDateRange={h.customDateRange}
          setCustomDateRange={h.setCustomDateRange}
          handleDateFilterChange={h.handleDateFilterChange}
          handleCustomDateChange={h.handleCustomDateChange}
          getDateFilterLabel={h.getDateFilterLabel}
          applySortAndFilter={h.applySortAndFilter}
          allSuppliers={h.allSuppliers}
          sortType={h.sortType}
          setShowAddForm={h.setShowAddForm}
          showAddForm={h.showAddForm}
        />

        {h.showAddForm && (
          <SupplierForm
            formData={h.formData}
            setFormData={h.setFormData}
            editingSupplier={h.editingSupplier}
            supplierSaving={h.supplierSaving}
            paymentTermsOptions={h.paymentTermsOptions}
            contracts={h.contracts}
            uploadingContract={h.uploadingContract}
            handleUploadContract={h.handleUploadContract}
            handleDeleteContract={h.handleDeleteContract}
            formatFileSize={h.formatFileSize}
            onSubmit={h.handleSubmit}
            onCancel={h.handleCancelForm}
          />
        )}

        {/* 廠商列表 */}
        <div className="bg-white rounded-lg shadow-sm">
          <table className="w-full table-fixed">
            <SupplierTableHeader
              showSortMenu={h.showSortMenu}
              setShowSortMenu={h.setShowSortMenu}
              sortType={h.sortType}
              filterKeyword={h.filterKeyword}
              setFilterKeyword={h.setFilterKeyword}
              handleSortChange={h.handleSortChange}
              handleFilterChange={h.handleFilterChange}
              setSortType={h.setSortType}
              applySortAndFilter={h.applySortAndFilter}
              allSuppliers={h.allSuppliers}
            />
            <tbody className="divide-y divide-gray-200">
              {h.suppliers.length === 0 ? (
                <tr>
                  <td colSpan="16" className="px-2 py-8 text-center text-gray-500">
                    尚無廠商資料
                  </td>
                </tr>
              ) : (
                h.suppliers.map((supplier, index) => (
                  <SupplierTableRow
                    key={supplier.id}
                    supplier={supplier}
                    index={index}
                    getExpiryStatus={h.getExpiryStatus}
                    onEdit={h.handleEdit}
                    onDelete={h.handleDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <SupplierPaginator
          totalCount={h.totalCount}
          currentPage={h.currentPage}
          itemsPerPage={h.itemsPerPage}
          setItemsPerPage={h.setItemsPerPage}
          fetchSuppliers={h.fetchSuppliers}
          filterKeyword={h.filterKeyword}
        />
      </main>
    </div>
  );
}
