'use client';

import ExcelBatchImport from '@/components/ExcelBatchImport';
import { labelStyle, inputStyle, tableStyle, thStyle, tdStyle, smallBtnStyle, PAYMENT_METHODS } from './styles';

export default function TemplatesTab({
  mainTab,
  // Template list
  filteredTemplates,
  // Template form state
  showTemplateForm,
  editingTemplate,
  templateForm, setTemplateForm,
  templateSaving,
  // Template handlers
  resetTemplateForm,
  handleEditTemplate,
  addEntryLineSingle,
  removeEntryLine,
  updateEntryLine,
  updateEntryLineAccounting,
  addPurchaseItem,
  removePurchaseItem,
  updatePurchaseItem,
  getPurchaseTotal,
  handleSaveTemplate,
  handleDeleteTemplate,
  handleToggleTemplateActive,
  // Shared data
  warehouses,
  categories,
  suppliers,
  products,
  cashAccounts,
  // Import handler
  onImportTemplates,
}) {
  const getSupplierName = (id) => {
    const s = suppliers.find(s => s.id === parseInt(id));
    return s?.name || id;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          {mainTab === 'purchase' ? '進銷存費用範本' : '固定費用範本'}
        </h2>
        <button onClick={() => { resetTemplateForm(); }}
          style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
          + 新增範本
        </button>
      </div>

      {/* Template Form */}
      {showTemplateForm && (
        <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 20, marginBottom: 20, background: '#fafbfc' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            {editingTemplate ? '編輯範本' : '新增範本'}
          </h3>

          {/* Common fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="f" style={labelStyle}>範本名稱 *</label>
              <input id="f" value={templateForm.name}
                onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                style={inputStyle} placeholder="例: 每月OO廠商進貨" />
            </div>
            <div>
              <label htmlFor="f-2" style={labelStyle}>館別</label>
              <select id="f-2" value={templateForm.warehouse}
                onChange={e => setTemplateForm(prev => ({ ...prev, warehouse: e.target.value }))}
                style={inputStyle}>
                <option value="">不限</option>
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-23" style={labelStyle}>分類</label>
              <select id="f-23" value={templateForm.categoryId}
                onChange={e => setTemplateForm(prev => ({ ...prev, categoryId: e.target.value }))}
                style={inputStyle}>
                <option value="">無分類</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="f-24" style={labelStyle}>說明</label>
              <input id="f-24" value={templateForm.description}
                onChange={e => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                style={inputStyle} placeholder="範本說明..." />
            </div>
          </div>

          {/* Purchase-type specific: product items */}
          {mainTab === 'purchase' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="f-3" style={labelStyle}>付款條件</label>
                  <input id="f-3" value={templateForm.paymentMethod}
                    onChange={e => setTemplateForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    style={inputStyle} placeholder="月結" />
                </div>
                <div>
                  <label htmlFor="f-4" style={labelStyle}>預設稅別</label>
                  <select id="f-4" value={templateForm.defaultTaxType}
                    onChange={e => setTemplateForm(prev => ({ ...prev, defaultTaxType: e.target.value }))}
                    style={inputStyle}>
                    <option value="">不指定</option>
                    <option value="應稅">應稅</option>
                    <option value="免稅">免稅</option>
                    <option value="零稅率">零稅率</option>
                  </select>
                </div>
              </div>

              <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>預設進貨品項</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>商品</th>
                    <th style={{ ...thStyle, width: 80 }}>數量</th>
                    <th style={{ ...thStyle, width: 100 }}>單價</th>
                    <th style={{ ...thStyle, width: 100 }}>小計</th>
                    <th style={thStyle}>備註</th>
                    <th style={{ ...thStyle, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {templateForm.purchaseItems.map((item, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>
                        <select value={item.productId}
                          onChange={e => updatePurchaseItem(idx, 'productId', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">選擇商品</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={item.quantity}
                          onChange={e => updatePurchaseItem(idx, 'quantity', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, width: '100%' }} min="1" />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={item.unitPrice}
                          onChange={e => updatePurchaseItem(idx, 'unitPrice', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, width: '100%' }} step="0.01" />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        <input value={item.note}
                          onChange={e => updatePurchaseItem(idx, 'note', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }} />
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => removePurchaseItem(idx)}
                          style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{getPurchaseTotal().toLocaleString()}</td>
                    <td colSpan={2} style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
              <button onClick={addPurchaseItem}
                style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                + 新增品項
              </button>
            </div>
          )}

          {/* Fixed-type: 費用項目 */}
          {mainTab === 'fixed' && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>費用項目（每筆需選擇館別、付款方式）</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 110 }}>費用名稱 *</th>
                    <th style={{ ...thStyle, width: 80 }}>會計代碼</th>
                    <th style={{ ...thStyle, width: 100 }}>摘要</th>
                    <th style={{ ...thStyle, width: 110 }}>廠商</th>
                    <th style={{ ...thStyle, width: 80 }}>館別 *</th>
                    <th style={{ ...thStyle, width: 80 }}>付款方式 *</th>
                    <th style={{ ...thStyle, width: 120 }}>轉帳／開票存簿</th>
                    <th style={{ ...thStyle, width: 100 }}>備註</th>
                    <th style={{ ...thStyle, width: 80 }}>預設金額</th>
                    <th style={{ ...thStyle, width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {templateForm.entryLines.map((line, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>
                        <input value={line.accountingName}
                          onChange={e => updateEntryLineAccounting(idx, e.target.value, false)}
                          style={{ ...inputStyle, marginBottom: 0 }} placeholder="例: 薪資" />
                      </td>
                      <td style={tdStyle}>
                        <input value={line.accountingCode}
                          onChange={e => updateEntryLineAccounting(idx, e.target.value, true)}
                          style={{ ...inputStyle, marginBottom: 0 }} placeholder="選填" />
                      </td>
                      <td style={tdStyle}>
                        <input value={line.summary}
                          onChange={e => updateEntryLine(idx, 'summary', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }} placeholder="摘要" />
                      </td>
                      <td style={tdStyle}>
                        <select value={line.supplierId}
                          onChange={e => {
                            const s = suppliers.find(s => s.id === parseInt(e.target.value));
                            updateEntryLine(idx, 'supplierId', e.target.value);
                            updateEntryLine(idx, 'supplierName', s?.name || '');
                          }}
                          style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">不指定</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <select value={line.warehouse}
                          onChange={e => updateEntryLine(idx, 'warehouse', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">選擇館別</option>
                          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <select value={line.paymentMethod}
                          onChange={e => {
                            updateEntryLine(idx, 'paymentMethod', e.target.value);
                            if (e.target.value !== '轉帳' && e.target.value !== '匯款' && e.target.value !== '支票') {
                              updateEntryLine(idx, 'accountId', '');
                            }
                          }}
                          style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">選擇</option>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        {(line.paymentMethod === '轉帳' || line.paymentMethod === '匯款' || line.paymentMethod === '支票') ? (
                          <select value={line.accountId}
                            onChange={e => updateEntryLine(idx, 'accountId', e.target.value)}
                            style={{ ...inputStyle, marginBottom: 0 }}>
                            <option value="">{line.paymentMethod === '支票' ? '開票帳戶' : '選擇存簿'}</option>
                            {cashAccounts.filter(a => a.warehouse === line.warehouse || !a.warehouse).map(a => (
                              <option key={a.id} value={a.id}>{a.name} {a.warehouse ? `(${a.warehouse})` : ''}</option>
                            ))}
                          </select>
                        ) : (line.paymentMethod === '信用卡' || line.paymentMethod === '員工代付') ? (
                          <input value={line.advancedBy || ''}
                            onChange={e => updateEntryLine(idx, 'advancedBy', e.target.value)}
                            style={{ ...inputStyle, marginBottom: 0 }} placeholder="代墊員工" />
                        ) : <span style={{ fontSize: 15, color: '#999' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <input value={line.note}
                          onChange={e => updateEntryLine(idx, 'note', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }} placeholder="備註" />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={line.defaultAmount}
                          onChange={e => updateEntryLine(idx, 'defaultAmount', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, textAlign: 'right' }} step="0.01" placeholder="0" />
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => removeEntryLine(idx)}
                          style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={addEntryLineSingle}
                  style={{ padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                  + 新增費用
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={resetTemplateForm}
              style={{ padding: '8px 16px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 6, cursor: 'pointer' }}>
              取消
            </button>
            <button onClick={handleSaveTemplate} disabled={templateSaving}
              style={{ padding: '8px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: templateSaving ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: templateSaving ? 0.7 : 1 }}>
              {templateSaving ? '儲存中...' : (editingTemplate ? '更新' : '儲存')}
            </button>
          </div>
        </div>
      )}

      {/* Template List */}
      {filteredTemplates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          尚無{mainTab === 'purchase' ? '進銷存' : '固定'}費用範本
        </div>
      ) : (
        <div className="tbl-wrap">
          <table style={tableStyle}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={thStyle}>名稱</th>
                <th style={thStyle}>摘要</th>
                <th style={thStyle}>分類</th>
                <th style={thStyle}>館別</th>
                <th style={thStyle}>{mainTab === 'purchase' ? '預設廠商' : '付款方式'}</th>
                <th style={thStyle}>{mainTab === 'purchase' ? '品項數' : '費用項目數'}</th>
                <th style={thStyle}>{mainTab === 'purchase' ? '預估金額' : '預設金額'}</th>
                <th style={thStyle}>狀態</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map(tmpl => {
                const itemCount = mainTab === 'purchase'
                  ? (Array.isArray(tmpl.purchaseItems) ? tmpl.purchaseItems.length : 0)
                  : (tmpl.entryLines?.filter(l => l.entryType === 'debit').length || 0);
                const totalAmt = mainTab === 'purchase'
                  ? (Array.isArray(tmpl.purchaseItems) ? tmpl.purchaseItems.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0) : 0)
                  : (tmpl.entryLines?.filter(l => l.entryType === 'debit').reduce((s, l) => s + (Number(l.defaultAmount) || 0), 0) || 0);
                return (
                  <tr key={tmpl.id} style={{ opacity: tmpl.isActive ? 1 : 0.5 }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{tmpl.name}</div>
                      {tmpl.description && <div style={{ fontSize: 15, color: '#888' }}>{tmpl.description}</div>}
                    </td>
                    <td style={tdStyle}>{tmpl.summary || '-'}</td>
                    <td style={tdStyle}>{tmpl.category?.name || '-'}</td>
                    <td style={tdStyle}>{tmpl.warehouse || '不限'}</td>
                    <td style={tdStyle}>
                      {mainTab === 'purchase'
                        ? (tmpl.defaultSupplierId ? getSupplierName(tmpl.defaultSupplierId) : '-')
                        : (tmpl.paymentMethod || '-')}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{itemCount}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{totalAmt > 0 ? totalAmt.toLocaleString() : '-'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 15,
                        background: tmpl.isActive ? '#d4edda' : '#f8d7da',
                        color: tmpl.isActive ? '#155724' : '#721c24'
                      }}>
                        {tmpl.isActive ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => handleEditTemplate(tmpl)}
                          style={smallBtnStyle}>編輯</button>
                        <button onClick={() => handleToggleTemplateActive(tmpl)}
                          style={{ ...smallBtnStyle, color: tmpl.isActive ? '#dc3545' : '#28a745' }}>
                          {tmpl.isActive ? '停用' : '啟用'}
                        </button>
                        <button onClick={() => handleDeleteTemplate(tmpl.id)}
                          style={{ ...smallBtnStyle, color: '#dc3545' }}>刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
