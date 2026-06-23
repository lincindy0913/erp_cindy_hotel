'use client';

import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { usePurchaseAllowances } from './_hooks/usePurchaseAllowances';
import AllowanceForm from './_components/AllowanceForm';
import ConfirmAllowanceModal from './_components/ConfirmAllowanceModal';

const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '1rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: '1rem' };

export default function PurchaseAllowancesPage() {
  const h = usePurchaseAllowances();

  if (h.loading) return (
    <>
      <Navigation borderColor="border-orange-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>載入中...</div>
      </div>
    </>
  );

  return (
    <>
      <Navigation borderColor="border-orange-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {h.fetchError && <FetchErrorBanner message={h.fetchError} onRetry={h.fetchAll} />}

        <ModuleGuideCard
          title="進貨折讓／退貨流程指引"
          color="amber"
          storageKey="guide-purchase-allowances"
          steps={[
            { label: '選擇廠商與商品', desc: '選擇廠商，挑選要退貨或折讓的進貨明細' },
            { label: '建立退貨／折讓單', desc: '填寫退貨數量或折讓金額，儲存為草稿' },
            { label: '確認核銷', desc: '草稿確認後系統自動調整應付金額與庫存' },
            { label: '現金流歸帳', desc: '若廠商退款，可連結現金流入帳記錄' },
          ]}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>進貨退貨管理</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { h.setFormMode('折讓'); h.resetForm(); h.setShowForm(v => h.formMode !== '折讓' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '1rem' }}>
              + 新增退貨單
            </button>
            <button onClick={() => { h.setFormMode('全額退貨'); h.resetForm(); h.setShowForm(v => h.formMode !== '全額退貨' ? true : !v); }}
              style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '1rem' }}>
              + 全額退貨退款
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fff7ed', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#9a3412' }}>草稿件數</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#9a3412' }}>{h.draftRecords.length}</div>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#92400e' }}>草稿金額</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#92400e' }}>NT$ {h.draftRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#065f46' }}>已退款金額</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>NT$ {h.confirmedRecords.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {h.showForm && (
          <AllowanceForm
            formMode={h.formMode}
            editingId={h.editingId}
            form={h.form} setForm={h.setForm} formSaving={h.formSaving}
            purchaseSearch={h.purchaseSearch} setPurchaseSearch={h.setPurchaseSearch}
            purchaseFilterDateFrom={h.purchaseFilterDateFrom} setPurchaseFilterDateFrom={h.setPurchaseFilterDateFrom}
            purchaseFilterDateTo={h.purchaseFilterDateTo} setPurchaseFilterDateTo={h.setPurchaseFilterDateTo}
            purchaseFilterSupplierId={h.purchaseFilterSupplierId} setPurchaseFilterSupplierId={h.setPurchaseFilterSupplierId}
            purchaseFilterWarehouse={h.purchaseFilterWarehouse} setPurchaseFilterWarehouse={h.setPurchaseFilterWarehouse}
            purchaseFilterPaidOnly={h.purchaseFilterPaidOnly} setPurchaseFilterPaidOnly={h.setPurchaseFilterPaidOnly}
            purchaseListResults={h.purchaseListResults}
            purchaseListTruncated={h.purchaseListTruncated}
            purchaseListLoading={h.purchaseListLoading}
            purchaseListSearched={h.purchaseListSearched}
            selectedPurchase={h.selectedPurchase}
            purchaseItems={h.purchaseItems}
            suppliers={h.suppliers} warehouses={h.warehouses}
            searchPurchaseList={h.searchPurchaseList}
            selectPurchase={h.selectPurchase}
            resetForm={h.resetForm}
            setShowForm={h.setShowForm}
            addDetailLine={h.addDetailLine}
            updateDetail={h.updateDetail}
            removeDetail={h.removeDetail}
            updateAmountField={h.updateAmountField}
            togglePurchaseItem={h.togglePurchaseItem}
            updatePurchaseItemReturnQty={h.updatePurchaseItemReturnQty}
            handleSave={h.handleSave}
          />
        )}

        {/* Tabs + Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb' }}>
            {h.TABS.map(tab => (
              <button key={tab.key} onClick={() => h.setActiveTab(tab.key)} style={{
                padding: '10px 20px', border: 'none', borderBottom: h.activeTab === tab.key ? '3px solid #ea580c' : '3px solid transparent',
                background: 'none', fontSize: '1rem', fontWeight: h.activeTab === tab.key ? 600 : 400,
                color: h.activeTab === tab.key ? '#ea580c' : '#6b7280', cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={h.handlePrint} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>列印</button>
            <button onClick={h.handleExportExcel} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>匯出 Excel</button>
            <input value={h.filterKeyword} onChange={e => h.setFilterKeyword(e.target.value)} placeholder="篩選退貨單..."
              style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', width: 200 }} />
          </div>
        </div>

        {/* Draft Tab */}
        {h.activeTab === 'draft' && (
          h.filteredDraft.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有草稿退貨單</div>
          ) : (
            <div className="tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }}>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>單號</th>
                    <th style={thStyle}>類型</th>
                    <th style={thStyle}>日期</th>
                    <th style={thStyle}>供應商</th>
                    <th style={thStyle}>館別</th>
                    <th style={thStyle}>原發票/付款單</th>
                    <th style={thStyle}>原因</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {h.filteredDraft.map(r => (
                    <tr key={r.id} style={{ background: r.allowanceType === '全額退貨' ? '#fef2f2' : undefined }}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{r.allowanceNo}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#fef3c7', color: r.allowanceType === '全額退貨' ? '#dc2626' : '#92400e' }}>
                          {r.allowanceType === '折讓' ? '退貨' : (r.allowanceType || '退貨')}
                        </span>
                      </td>
                      <td style={tdStyle}>{r.allowanceDate}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                      <td style={tdStyle}>{r.warehouse || '-'}</td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '0.875rem' }}>
                          {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                          {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                          {!r.invoiceNo && !r.paymentOrderNo && '-'}
                        </div>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{r.reason?.substring(0, 20) || '-'}{r.reason?.length > 20 ? '...' : ''}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { h.setConfirmingId(r.id); h.setConfirmDate(r.allowanceDate); }} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#fff', background: '#059669', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>確認退款</button>
                          <button onClick={() => h.openEdit(r)} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#2563eb', background: 'none', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer' }}>編輯</button>
                          <button onClick={() => h.handleDelete(r)} style={{ padding: '4px 10px', fontSize: '0.875rem', color: '#dc2626', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {h.filteredDraft.length} 筆</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {h.filteredDraft.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</td>
                    <td style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {/* Confirmed Tab */}
        {h.activeTab === 'confirmed' && (
          h.filteredConfirmed.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無已確認退貨紀錄</div>
          ) : (
            <div className="tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }}>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>單號</th>
                    <th style={thStyle}>類型</th>
                    <th style={thStyle}>日期</th>
                    <th style={thStyle}>供應商</th>
                    <th style={thStyle}>館別</th>
                    <th style={thStyle}>原發票/付款單</th>
                    <th style={thStyle}>原因</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>退款金額</th>
                    <th style={thStyle}>退款交易</th>
                    <th style={thStyle}>確認者</th>
                  </tr>
                </thead>
                <tbody>
                  {h.filteredConfirmed.map(r => (
                    <tr key={r.id} style={{ background: r.allowanceType === '全額退貨' ? '#fef2f2' : undefined }}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{r.allowanceNo}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, background: r.allowanceType === '全額退貨' ? '#fee2e2' : '#d1fae5', color: r.allowanceType === '全額退貨' ? '#dc2626' : '#065f46' }}>
                          {r.allowanceType === '折讓' ? '退貨' : (r.allowanceType || '退貨')}
                        </span>
                      </td>
                      <td style={tdStyle}>{r.allowanceDate}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.supplierName || '-'}</td>
                      <td style={tdStyle}>{r.warehouse || '-'}</td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '0.875rem' }}>
                          {r.invoiceNo && <div>發票: {r.invoiceNo}</div>}
                          {r.paymentOrderNo && <div style={{ color: '#6b7280' }}>付款: {r.paymentOrderNo}</div>}
                          {!r.invoiceNo && !r.paymentOrderNo && '-'}
                        </div>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{r.reason?.substring(0, 30) || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {r.totalAmount.toLocaleString()}</td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#059669' }}>{r.cashTransactionNo || '-'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: '0.875rem' }}>{r.confirmedBy || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {h.filteredConfirmed.length} 筆</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#059669' }}>NT$ {h.filteredConfirmed.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</td>
                    <td colSpan={2} style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}
      </div>

      <ConfirmAllowanceModal
        confirmingId={h.confirmingId}
        records={h.records}
        bankAccounts={h.bankAccounts}
        confirmDate={h.confirmDate} setConfirmDate={h.setConfirmDate}
        confirmAccountId={h.confirmAccountId} setConfirmAccountId={h.setConfirmAccountId}
        confirmSaving={h.confirmSaving}
        handleConfirm={h.handleConfirm}
        onClose={() => { h.setConfirmingId(null); h.setConfirmAccountId(''); }}
      />
    </>
  );
}
