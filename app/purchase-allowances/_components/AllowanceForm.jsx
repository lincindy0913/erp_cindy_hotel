'use client';

const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' };
const labelStyle = { fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: 4 };

export default function AllowanceForm({
  formMode, editingId,
  form, setForm, formSaving,
  purchaseSearch, setPurchaseSearch,
  purchaseFilterDateFrom, setPurchaseFilterDateFrom,
  purchaseFilterDateTo, setPurchaseFilterDateTo,
  purchaseFilterSupplierId, setPurchaseFilterSupplierId,
  purchaseFilterWarehouse, setPurchaseFilterWarehouse,
  purchaseFilterPaidOnly, setPurchaseFilterPaidOnly,
  purchaseListResults, purchaseListTruncated,
  purchaseListLoading, purchaseListSearched,
  selectedPurchase,
  purchaseItems,
  suppliers, warehouses,
  searchPurchaseList, selectPurchase, resetForm, setShowForm,
  addDetailLine, updateDetail, removeDetail, updateAmountField,
  togglePurchaseItem, updatePurchaseItemReturnQty,
  handleSave,
}) {
  return (
    <div style={{ background: formMode === '全額退貨' ? '#fef2f2' : '#fffbeb', border: `1px solid ${formMode === '全額退貨' ? '#fca5a5' : '#fbbf24'}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
          {editingId ? '編輯' : '新增'}{formMode === '全額退貨' ? '全額退貨退款單' : '退貨單'}
        </h3>
        <span style={{
          padding: '2px 10px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 600,
          background: formMode === '全額退貨' ? '#fee2e2' : '#fef3c7',
          color: formMode === '全額退貨' ? '#dc2626' : '#92400e',
        }}>
          {formMode === '全額退貨' ? '全額退貨 — 將作廢原發票/付款單/進貨單' : '部分退貨'}
        </span>
      </div>

      {/* Purchase Search Section */}
      {!editingId && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>
              Step 1: 搜尋「已出納」進貨單，勾選後自動帶入表單
              {formMode === '全額退貨' && <span style={{ color: '#dc2626', marginLeft: 8 }}>— 確認後將全額退款並作廢原單據</span>}
            </label>
            {selectedPurchase && (
              <button type="button" onClick={() => { resetForm(); setShowForm(true); }}
                style={{ padding: '2px 10px', fontSize: '0.75rem', background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 4, cursor: 'pointer' }}>
                清除選取
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>進貨日期起</div>
              <input type="date" value={purchaseFilterDateFrom} onChange={e => setPurchaseFilterDateFrom(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>進貨日期迄</div>
              <input type="date" value={purchaseFilterDateTo} onChange={e => setPurchaseFilterDateTo(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>廠商</div>
              <select value={purchaseFilterSupplierId} onChange={e => setPurchaseFilterSupplierId(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                <option value="">全部廠商</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>館別</div>
              <select value={purchaseFilterWarehouse} onChange={e => setPurchaseFilterWarehouse(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                <option value="">全部館別</option>
                {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>付款狀態</div>
              <select value={purchaseFilterPaidOnly} onChange={e => setPurchaseFilterPaidOnly(e.target.value)}
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }}>
                <option value="all">全部</option>
                <option value="paid">僅已付款</option>
                <option value="unpaid">未付款</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 3 }}>關鍵字（單號/品名）</div>
              <input value={purchaseSearch} onChange={e => setPurchaseSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchPurchaseList()}
                placeholder="進貨單號 / 品名..."
                style={{ ...inputStyle, fontSize: '0.875rem', padding: '6px 8px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={searchPurchaseList} disabled={purchaseListLoading}
                style={{ width: '100%', padding: '7px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, cursor: purchaseListLoading ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 600, opacity: purchaseListLoading ? 0.7 : 1 }}>
                {purchaseListLoading ? '查詢中...' : '查詢進貨單'}
              </button>
            </div>
          </div>

          {purchaseListTruncated && (
            <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 6, fontSize: '0.8rem', color: '#92400e', marginBottom: 6 }}>
              結果超過 200 筆，僅顯示最新 200 筆。請縮小日期範圍或加入其他篩選條件。
            </div>
          )}
          {purchaseListSearched && !purchaseListLoading && (
            purchaseListResults.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.875rem', color: '#9ca3af', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                查無符合條件的已出納進貨單
              </div>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ background: '#fef3c7' }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>進貨單號</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb' }}>廠商</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb' }}>館別</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>進貨日期</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>金額</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>付款單號</th>
                      <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: '#92400e', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>選取</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseListResults.map((p, idx) => {
                      const isSelected = selectedPurchase?.purchaseId === p.purchaseId;
                      return (
                        <tr key={p.purchaseId} onClick={() => selectPurchase(p)}
                          style={{ cursor: 'pointer', background: isSelected ? '#fef9c3' : idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fffbeb'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa'; }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1d4ed8', fontFamily: 'monospace' }}>{p.purchaseNo}</td>
                          <td style={{ padding: '8px 10px', color: '#ea580c', fontWeight: 600 }}>{p.supplierName}</td>
                          <td style={{ padding: '8px 10px', color: '#374151' }}>{p.warehouse || '-'}</td>
                          <td style={{ padding: '8px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{p.purchaseDate || '-'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>NT$ {Number(p.totalAmount).toLocaleString()}</td>
                          <td style={{ padding: '8px 10px', color: '#b45309', fontSize: '0.75rem', fontFamily: 'monospace' }}>{p.paymentOrderNo || '-'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {isSelected
                              ? <span style={{ fontSize: '1rem', color: '#f59e0b' }}>✓</span>
                              : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>選取</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {selectedPurchase && (
            <div style={{ marginTop: 10, background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>✓ 已帶入：</span>
                <span style={{ fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedPurchase.purchaseNo}</span>
                <span style={{ color: '#ea580c', fontWeight: 600, fontSize: '0.875rem' }}>{selectedPurchase.supplierName}</span>
                <span style={{ color: '#374151', fontSize: '0.875rem' }}>{selectedPurchase.warehouse}</span>
                <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.875rem' }}>NT$ {Number(selectedPurchase.totalAmount).toLocaleString()}</span>
                {selectedPurchase.invoiceNo && <span style={{ fontSize: '0.75rem', color: '#7c3aed' }}>發票: {selectedPurchase.invoiceNo}</span>}
                {selectedPurchase.paymentOrderNo && <span style={{ fontSize: '0.75rem', color: '#b45309' }}>付款單: {selectedPurchase.paymentOrderNo}</span>}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: 4 }}>表單欄位已自動填寫，您仍可手動修改任何欄位</div>
            </div>
          )}

          {!purchaseListSearched && (
            <div style={{ marginTop: 8, fontSize: '0.875rem', color: '#9ca3af' }}>
              設定條件後按「查詢進貨單」，也可跳過直接手動填寫
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="f" style={labelStyle}>退貨日期 *</label>
            <input id="f" type="date" value={form.allowanceDate} onChange={e => setForm(f => ({ ...f, allowanceDate: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="f-2" style={labelStyle}>供應商名稱</label>
            <select id="f-2" value={form.supplierName} onChange={e => { const s = suppliers.find(s => s.name === e.target.value); setForm(f => ({ ...f, supplierName: e.target.value, supplierId: s?.id || null })); }} style={inputStyle}>
              <option value="">選擇供應商</option>
              {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              {form.supplierName && !suppliers.some(s => s.name === form.supplierName) && <option value={form.supplierName}>{form.supplierName}</option>}
            </select>
          </div>
          <div>
            <label htmlFor="f-10" style={labelStyle}>館別</label>
            <select id="f-10" value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))} style={inputStyle}>
              <option value="">選擇館別</option>
              {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>原進貨單號 {selectedPurchase && form.purchaseNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
            <input value={form.purchaseNo} onChange={e => setForm(f => ({ ...f, purchaseNo: e.target.value }))} placeholder="選填"
              style={{ ...inputStyle, ...(selectedPurchase && form.purchaseNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
          </div>
          <div>
            <label style={labelStyle}>原發票號碼 {selectedPurchase && form.invoiceNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
            <input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="選填"
              style={{ ...inputStyle, ...(selectedPurchase && form.invoiceNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
          </div>
          <div>
            <label style={labelStyle}>原付款單號 {selectedPurchase && form.paymentOrderNo && <span style={{ color: '#059669', fontSize: '0.75rem' }}>✓ 已連動</span>}</label>
            <input value={form.paymentOrderNo} onChange={e => setForm(f => ({ ...f, paymentOrderNo: e.target.value }))} placeholder="選填"
              style={{ ...inputStyle, ...(selectedPurchase && form.paymentOrderNo ? { background: '#f0fdf4', borderColor: '#86efac' } : {}) }} />
          </div>
        </div>

        {/* Detail lines */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: '1rem', fontWeight: 600 }}>
              退貨明細
              {selectedPurchase && purchaseItems.length > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                  勾選要退貨的品項，可調整退貨數量
                </span>
              )}
            </label>
            {!selectedPurchase && (
              <button type="button" onClick={addDetailLine} style={{ padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' }}>+ 新增項目</button>
            )}
          </div>

          {selectedPurchase && purchaseItems.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fef9c3' }}>
                <tr style={{ background: '#fef9c3' }}>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'center', width: 50, borderBottom: '1px solid #e5e7eb' }}>退貨</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>品名</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 80, borderBottom: '1px solid #e5e7eb' }}>原數量</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 110, borderBottom: '1px solid #e5e7eb' }}>退貨數量</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'center', width: 60, borderBottom: '1px solid #e5e7eb' }}>單位</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 110, borderBottom: '1px solid #e5e7eb' }}>單價</th>
                  <th style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', width: 120, borderBottom: '1px solid #e5e7eb' }}>退貨小計</th>
                </tr>
              </thead>
              <tbody>
                {purchaseItems.map((item, idx) => (
                  <tr key={idx} style={{ background: item.selected ? '#f0fdf4' : '#f9fafb', borderBottom: '1px solid #f3f4f6', opacity: item.selected ? 1 : 0.55 }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <input type="checkbox" checked={item.selected} onChange={() => togglePurchaseItem(idx)}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#16a34a' }} />
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '0.875rem', fontWeight: item.selected ? 600 : 400, color: item.selected ? '#111827' : '#6b7280' }}>
                      {item.productName}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right', color: '#6b7280' }}>{item.quantity}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <input type="number" min="0" max={item.quantity} step="1" value={item.returnQty} disabled={!item.selected}
                        onChange={e => updatePurchaseItemReturnQty(idx, e.target.value)}
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right', background: item.selected ? '#fff' : '#f3f4f6', cursor: item.selected ? 'text' : 'not-allowed' }} />
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: '0.75rem', textAlign: 'center', color: '#6b7280' }}>{item.unit}</td>
                    <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right' }}>NT$ {Number(item.unitPrice).toLocaleString()}</td>
                    <td style={{ padding: '6px 10px', fontSize: '0.875rem', textAlign: 'right', fontWeight: 700, color: item.selected ? '#dc2626' : '#9ca3af' }}>
                      NT$ {Math.round((parseFloat(item.returnQty) || 0) * item.unitPrice).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fef3c7' }}>
                  <td colSpan={6} style={{ padding: '7px 10px', fontSize: '0.875rem', textAlign: 'right', fontWeight: 600 }}>
                    已勾選 {purchaseItems.filter(i => i.selected).length} / {purchaseItems.length} 項，退貨小計
                  </td>
                  <td style={{ padding: '7px 10px', fontSize: '1rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                    NT$ {purchaseItems.filter(i => i.selected).reduce((s, i) => s + Math.round((parseFloat(i.returnQty) || 0) * i.unitPrice), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            form.details.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fef9c3' }}>
                  <tr style={{ background: '#fef9c3' }}>
                    <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'left' }}>品名</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 80 }}>數量</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 100 }}>單價</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'right', width: 100 }}>小計</th>
                    <th style={{ padding: '6px 8px', fontSize: '0.875rem', textAlign: 'left' }}>原因</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.details.map((d, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 6px' }}>
                        <input value={d.productName} onChange={e => updateDetail(idx, 'productName', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" value={d.quantity} onChange={e => updateDetail(idx, 'quantity', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" value={d.unitPrice} onChange={e => updateDetail(idx, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" value={d.subtotal} onChange={e => updateDetail(idx, 'subtotal', e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem', textAlign: 'right', background: '#f9fafb' }} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input value={d.reason} onChange={e => updateDetail(idx, 'reason', e.target.value)} placeholder="產品瑕疵/數量不符" style={{ width: '100%', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }} />
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <button type="button" onClick={() => removeDetail(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
          {formMode === '全額退貨' && selectedPurchase && (
            <div style={{ gridColumn: '1 / -1', background: '#fee2e2', padding: '6px 12px', borderRadius: 6, fontSize: '0.875rem', color: '#991b1b', marginBottom: 4 }}>
              全額退貨模式：金額已鎖定為原進貨單全額，不可修改
            </div>
          )}
          <div>
            <label htmlFor="f-3" style={labelStyle}>{formMode === '全額退貨' ? '退貨金額（未稅）' : '退貨金額（未稅）*'}</label>
            <input id="f-3" type="number" value={form.amount}
              onChange={e => updateAmountField('amount', e.target.value)}
              readOnly={formMode === '全額退貨' && !!selectedPurchase}
              style={{ ...inputStyle, textAlign: 'right', ...(formMode === '全額退貨' && selectedPurchase ? { background: '#f3f4f6', cursor: 'not-allowed' } : {}) }} />
          </div>
          <div>
            <label htmlFor="f-4" style={labelStyle}>稅額</label>
            <input id="f-4" type="number" value={form.tax}
              onChange={e => updateAmountField('tax', e.target.value)}
              readOnly={formMode === '全額退貨' && !!selectedPurchase}
              style={{ ...inputStyle, textAlign: 'right', ...(formMode === '全額退貨' && selectedPurchase ? { background: '#f3f4f6', cursor: 'not-allowed' } : {}) }} />
          </div>
          <div>
            <label htmlFor="f-5" style={labelStyle}>{formMode === '全額退貨' ? '退貨總額（含稅）' : '退貨總額（含稅）*'}</label>
            <input id="f-5" type="number" value={form.totalAmount}
              onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
              readOnly={formMode === '全額退貨' && !!selectedPurchase}
              style={{ ...inputStyle, border: `2px solid ${formMode === '全額退貨' ? '#dc2626' : '#f59e0b'}`, fontSize: '1rem', fontWeight: 700, textAlign: 'right',
                background: formMode === '全額退貨' && selectedPurchase ? '#fee2e2' : '#fffbeb',
                ...(formMode === '全額退貨' && selectedPurchase ? { cursor: 'not-allowed' } : {}),
              }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="f-6" style={labelStyle}>廠商折讓單號</label>
          <input id="f-6" value={form.creditNoteNo || ''} onChange={e => setForm(f => ({ ...f, creditNoteNo: e.target.value }))}
            placeholder="廠商開立的折讓單號碼（選填，申報進項用）" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="f-7" style={labelStyle}>退貨原因 *</label>
            <textarea id="f-7" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="產品瑕疵 / 數量不符 / 價格錯誤..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label htmlFor="f-8" style={labelStyle}>備註</label>
            <textarea id="f-8" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="選填" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>

        {formMode === '全額退貨' && selectedPurchase && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: '1rem', color: '#991b1b' }}>
            <strong>全額退貨確認後將執行：</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.8 }}>
              <li>建立退款收入交易 NT$ {form.totalAmount ? Number(form.totalAmount).toLocaleString() : '0'}</li>
              {form.purchaseNo && <li>原進貨單 {form.purchaseNo} 標記為「已退貨」</li>}
              {form.invoiceNo && <li>原發票 {form.invoiceNo} 標記為「已退貨」</li>}
              {form.paymentOrderNo && <li>原付款單 {form.paymentOrderNo} 標記為「已退貨」</li>}
              <li>沖銷原出納付款交易</li>
              <li>回沖損益表及月度彙總</li>
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={formSaving} style={{
            padding: '8px 24px', color: '#fff', border: 'none', borderRadius: 6, cursor: formSaving ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 600,
            background: formMode === '全額退貨' ? '#dc2626' : '#ea580c', opacity: formSaving ? 0.7 : 1,
          }}>
            {formSaving ? '儲存中...' : `${editingId ? '更新' : '建立'}退貨單（草稿）`}
          </button>
          <button type="button" onClick={() => { setShowForm(false); resetForm(); }} disabled={formSaving} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: formSaving ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>取消</button>
        </div>
      </form>
    </div>
  );
}
