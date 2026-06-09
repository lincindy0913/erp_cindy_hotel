'use client';

import { labelStyle, inputStyle, tableStyle, thStyle, tdStyle, smallBtnStyle, PAYMENT_METHODS } from './styles';

export default function ExecuteTab({
  mainTab,
  // Execute state
  selectedTemplateId,
  executeForm, setExecuteForm,
  duplicateWarning,
  submitting,
  // Execute handlers
  handleSelectTemplate,
  updateExecuteLine,
  updateExecuteItem,
  addExecuteItem,
  removeExecuteItem,
  getExecutePurchaseTotal,
  handleExecute,
  // Shared data
  activeTemplates,
  warehouses,
  suppliers,
  products,
  cashAccounts,
}) {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
        快速執行 - {mainTab === 'purchase' ? '進銷存每月費用' : '固定費用'}
      </h2>

      {/* Template selection and basic info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label htmlFor="f-5" style={labelStyle}>選擇範本 *</label>
          <select id="f-5" value={selectedTemplateId}
            onChange={e => handleSelectTemplate(e.target.value)}
            style={inputStyle}>
            <option value="">-- 選擇範本 --</option>
            {activeTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {mainTab === 'purchase' && (
          <div>
            <label htmlFor="f-25" style={labelStyle}>館別 *</label>
            <select id="f-25" value={executeForm.warehouse}
              onChange={e => setExecuteForm(prev => ({ ...prev, warehouse: e.target.value }))}
              style={inputStyle}>
              <option value="">選擇館別</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-26" style={labelStyle}>費用月份 *</label>
          <input id="f-26" type="month" value={executeForm.expenseMonth}
            onChange={e => setExecuteForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
            style={inputStyle} />
        </div>
      </div>

      {selectedTemplateId && (
        <>
          {/* Purchase-type execution */}
          {mainTab === 'purchase' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label htmlFor="f-6" style={labelStyle}>廠商 *</label>
                  <select id="f-6" value={executeForm.supplierId}
                    onChange={e => {
                      const s = suppliers.find(s => s.id === parseInt(e.target.value));
                      setExecuteForm(prev => ({
                        ...prev,
                        supplierId: e.target.value,
                        supplierName: s?.name || ''
                      }));
                    }}
                    style={inputStyle}>
                    <option value="">選擇廠商</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-27" style={labelStyle}>付款條件</label>
                  <input id="f-27" value={executeForm.paymentTerms}
                    onChange={e => setExecuteForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                    style={inputStyle} placeholder="月結" />
                </div>
                <div>
                  <label htmlFor="f-28" style={labelStyle}>稅別</label>
                  <select id="f-28" value={executeForm.taxType}
                    onChange={e => setExecuteForm(prev => ({ ...prev, taxType: e.target.value }))}
                    style={inputStyle}>
                    <option value="">不指定</option>
                    <option value="應稅">應稅</option>
                    <option value="免稅">免稅</option>
                    <option value="零稅率">零稅率</option>
                  </select>
                </div>
              </div>

              <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>進貨品項</h4>
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
                  {executeForm.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>
                        <select value={item.productId}
                          onChange={e => updateExecuteItem(idx, 'productId', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }}>
                          <option value="">選擇商品</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={item.quantity}
                          onChange={e => updateExecuteItem(idx, 'quantity', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, width: '100%' }} min="1" />
                      </td>
                      <td style={tdStyle}>
                        <input type="number" value={item.unitPrice}
                          onChange={e => updateExecuteItem(idx, 'unitPrice', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0, width: '100%' }} step="0.01" />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                        {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toLocaleString()}
                      </td>
                      <td style={tdStyle}>
                        <input value={item.note}
                          onChange={e => updateExecuteItem(idx, 'note', e.target.value)}
                          style={{ ...inputStyle, marginBottom: 0 }} />
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => removeExecuteItem(idx)}
                          style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 18 }}>
                      {getExecutePurchaseTotal().toLocaleString()}
                    </td>
                    <td colSpan={2} style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
              <button onClick={addExecuteItem}
                style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                + 新增品項
              </button>

              {/* Invoice section */}
              <div style={{ marginTop: 20, padding: 16, background: '#f0f7ff', borderRadius: 8, border: '1px solid #bee5eb' }}>
                <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, color: '#0c5460' }}>
                  發票資訊 (選填 - 填寫後會同時建立發票記錄)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="f-7" style={labelStyle}>發票號碼</label>
                    <input id="f-7" value={executeForm.invoiceNo}
                      onChange={e => setExecuteForm(prev => ({ ...prev, invoiceNo: e.target.value }))}
                      style={inputStyle} placeholder="例: AB-12345678" />
                  </div>
                  <div>
                    <label htmlFor="f-8" style={labelStyle}>發票日期</label>
                    <input id="f-8" type="date" value={executeForm.invoiceDate}
                      onChange={e => setExecuteForm(prev => ({ ...prev, invoiceDate: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label htmlFor="f-9" style={labelStyle}>發票抬頭</label>
                    <input id="f-9" value={executeForm.invoiceTitle}
                      onChange={e => setExecuteForm(prev => ({ ...prev, invoiceTitle: e.target.value }))}
                      style={inputStyle} placeholder="公司名稱" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fixed-type execution */}
          {mainTab === 'fixed' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label htmlFor="f-10" style={labelStyle}>費用月份 *</label>
                  <input id="f-10" type="month" value={executeForm.expenseMonth}
                    onChange={e => setExecuteForm(prev => ({ ...prev, expenseMonth: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="f-11" style={labelStyle}>付款方式</label>
                  <select id="f-11" value={executeForm.paymentMethod}
                    onChange={e => setExecuteForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    style={inputStyle}>
                    <option value="月結">月結</option>
                    <option value="現金">現金</option>
                    <option value="匯款">匯款</option>
                    <option value="支票">支票</option>
                    <option value="信用卡">信用卡</option>
                    <option value="員工代付">員工代付</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-12" style={labelStyle}>廠商</label>
                  <select id="f-12" value={executeForm.supplierId}
                    onChange={e => {
                      const s = suppliers.find(s => s.id === parseInt(e.target.value));
                      setExecuteForm(prev => ({
                        ...prev,
                        supplierId: e.target.value,
                        supplierName: s?.name || ''
                      }));
                    }}
                    style={inputStyle}>
                    <option value="">不指定</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 老闆信用卡代墊模式 */}
              <div style={{ background: executeForm.creditCardAdvanceMode ? '#f3e8ff' : '#f8f9fa', border: `1px solid ${executeForm.creditCardAdvanceMode ? '#8b5cf6' : '#dee2e6'}`, borderRadius: 8, padding: 12, marginBottom: 12, transition: 'all 0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 17, fontWeight: 600, color: executeForm.creditCardAdvanceMode ? '#6d28d9' : '#495057' }}>
                  <input type="checkbox" checked={!!executeForm.creditCardAdvanceMode}
                    onChange={e => {
                      const checked = e.target.checked;
                      setExecuteForm(prev => {
                        const updated = { ...prev, creditCardAdvanceMode: checked };
                        if (checked) {
                          updated.creditCardAdvanceName = prev.creditCardAdvanceName || '老闆';
                          updated.entryLines = prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, paymentMethod: '信用卡', advancedBy: prev.creditCardAdvanceName || '老闆' } : l);
                        } else {
                          updated.entryLines = prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, paymentMethod: '', advancedBy: '' } : l);
                        }
                        return updated;
                      });
                    }}
                    style={{ width: 18, height: 18, accentColor: '#6d28d9' }} />
                  老闆信用卡代墊模式
                </label>
                {executeForm.creditCardAdvanceMode && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #c4b5fd' }}>
                    <div style={{ fontSize: 15, color: '#6d28d9', marginBottom: 8, lineHeight: 1.6 }}>
                      開啟後，所有費用項目將自動建立<strong>員工代墊記錄</strong>（不會進入出納待付清單）。<br/>
                      出納繳信用卡帳單時，到「員工預支」頁面勾選結算即可。
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label htmlFor="f-29" style={{ fontSize: 15, color: '#6d28d9', fontWeight: 500, whiteSpace: 'nowrap' }}>代墊人</label>
                      <input id="f-29" value={executeForm.creditCardAdvanceName || ''}
                        onChange={e => {
                          const name = e.target.value;
                          setExecuteForm(prev => ({
                            ...prev,
                            creditCardAdvanceName: name,
                            entryLines: prev.entryLines.map(l => l.entryType === 'debit' ? { ...l, advancedBy: name } : l)
                          }));
                        }}
                        placeholder="老闆" style={{ ...inputStyle, marginBottom: 0, borderColor: '#c4b5fd', background: '#fff', width: 150 }} />
                    </div>
                  </div>
                )}
              </div>

              {/* 當無逐筆分錄且付款方式為信用卡/員工代付時，顯示整批代墊員工欄位 */}
              {!executeForm.creditCardAdvanceMode && (!executeForm.entryLines || executeForm.entryLines.length === 0) &&
                (executeForm.paymentMethod === '信用卡' || executeForm.paymentMethod === '員工代付') && (
                <div style={{ background: '#f3e8ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#6d28d9', marginBottom: 8 }}>員工代墊資訊（存檔後自動連動代墊款管理）</div>
                  <div>
                    <label htmlFor="f-13" style={{ fontSize: 14, color: '#6d28d9' }}>代墊員工 *</label>
                    <input id="f-13" value={executeForm.advancedBy || ''}
                      onChange={e => setExecuteForm(prev => ({ ...prev, advancedBy: e.target.value }))}
                      placeholder="員工姓名" style={{ ...inputStyle, borderColor: '#c4b5fd', background: '#fff' }} />
                  </div>
                </div>
              )}

              {/* 支票資訊 */}
              {(executeForm.paymentMethod === '支票' ||
                executeForm.entryLines?.some((l) => l.entryType === 'debit' && l.paymentMethod === '支票')) && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#b45309', marginBottom: 8 }}>支票資訊（存檔後連動支票管理）</div>
                  <p style={{ fontSize: 13, color: '#92400e', marginBottom: 10 }}>
                    請將該筆費用列的「付款方式」設為「支票」後，於該列「付款帳戶」選擇開票帳戶；若僅使用上方「付款方式」選支票而未改各列，請於下方選擇開票帳戶。
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label htmlFor="f-14" style={{ fontSize: 14, color: '#b45309' }}>付款(開票)日期 *</label>
                      <input id="f-14" type="date" value={executeForm.checkIssueDate || ''}
                        onChange={e => setExecuteForm(prev => ({ ...prev, checkIssueDate: e.target.value }))}
                        style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                    </div>
                    <div>
                      <label htmlFor="f-15" style={{ fontSize: 14, color: '#b45309' }}>支票日期(到期日) *</label>
                      <input id="f-15" type="date" value={executeForm.checkDate || ''}
                        onChange={e => setExecuteForm(prev => ({ ...prev, checkDate: e.target.value }))}
                        style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="f-16" style={{ fontSize: 14, color: '#b45309' }}>支票號碼 *</label>
                      <input id="f-16" type="text" value={executeForm.checkNo || ''}
                        onChange={e => setExecuteForm(prev => ({ ...prev, checkNo: e.target.value }))}
                        placeholder="請輸入支票號碼" style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                    </div>
                    {executeForm.paymentMethod === '支票' &&
                      !executeForm.entryLines?.some((l) => l.entryType === 'debit' && l.paymentMethod === '支票') && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label htmlFor="f-17" style={{ fontSize: 14, color: '#b45309' }}>開票帳戶 *</label>
                        <select id="f-17" value={executeForm.checkAccountId || ''}
                          onChange={e => setExecuteForm(prev => ({ ...prev, checkAccountId: e.target.value }))}
                          style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }}>
                          <option value="">請選擇</option>
                          {cashAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="f-30" style={{ fontSize: 14, color: '#b45309' }}>備註</label>
                      <input id="f-30" type="text" value={executeForm.checkNote || ''}
                        onChange={e => setExecuteForm(prev => ({ ...prev, checkNote: e.target.value }))}
                        placeholder="選填" style={{ ...inputStyle, borderColor: '#f59e0b', background: '#fff' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* 固定費用：費用項目 */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>費用項目（請填入本月金額）</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ ...tableStyle, minWidth: 1080 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th style={{ ...thStyle, width: 120 }}>費用名稱</th>
                        <th style={{ ...thStyle, width: 110 }}>會計科目</th>
                        <th style={{ ...thStyle, width: 110 }}>廠商</th>
                        <th style={{ ...thStyle, width: 90 }}>館別</th>
                        <th style={{ ...thStyle, width: 80 }}>付款方式</th>
                        <th style={{ ...thStyle, width: 150 }}>付款／開票帳戶</th>
                        <th style={{ ...thStyle, width: 110 }}>代墊員工</th>
                        <th style={{ ...thStyle, width: 130 }}>摘要</th>
                        <th style={{ ...thStyle, width: 110 }}>金額 *</th>
                        <th style={{ ...thStyle, width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {executeForm.entryLines.filter(l => l.entryType === 'debit').map((line, idx) => {
                        const realIdx = executeForm.entryLines.indexOf(line);
                        const isAdvance = line.paymentMethod === '信用卡' || line.paymentMethod === '員工代付';
                        const isTransfer = line.paymentMethod === '轉帳' || line.paymentMethod === '匯款';
                        const isCheck = line.paymentMethod === '支票';
                        const accountColEnabled = isTransfer || isCheck;
                        return (
                          <tr key={realIdx}>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>
                              <input value={line.accountingName || ''}
                                onChange={e => updateExecuteLine(realIdx, 'accountingName', e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0, fontWeight: 500 }} placeholder="費用名稱" />
                            </td>
                            <td style={tdStyle}>
                              <input value={line.accountingCode || ''}
                                onChange={e => updateExecuteLine(realIdx, 'accountingCode', e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0, fontSize: 15, color: '#555' }} placeholder="科目代碼" />
                            </td>
                            <td style={tdStyle}>
                              <select value={line.supplierId || ''}
                                onChange={e => {
                                  const s = suppliers.find(s => s.id === parseInt(e.target.value));
                                  updateExecuteLine(realIdx, 'supplierId', e.target.value);
                                  updateExecuteLine(realIdx, 'supplierName', s?.name || '');
                                }}
                                style={{ ...inputStyle, marginBottom: 0 }}>
                                <option value="">不指定</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <select value={line.warehouse || ''}
                                onChange={e => updateExecuteLine(realIdx, 'warehouse', e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0 }}>
                                <option value="">不指定</option>
                                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <select value={line.paymentMethod || ''}
                                onChange={e => {
                                  const newPm = e.target.value;
                                  setExecuteForm(prev => {
                                    const newLines = prev.entryLines.map((l, i) => {
                                      if (i !== realIdx) return l;
                                      const updated = { ...l, paymentMethod: newPm };
                                      if (newPm !== '轉帳' && newPm !== '匯款' && newPm !== '支票') updated.accountId = '';
                                      if (newPm !== '信用卡' && newPm !== '員工代付') updated.advancedBy = '';
                                      return updated;
                                    });
                                    const anyCheckDebit = newLines.some(
                                      (l) => l.entryType === 'debit' && l.paymentMethod === '支票'
                                    );
                                    const firstDebitPm =
                                      newLines.find((l) => l.entryType === 'debit')?.paymentMethod || '';
                                    return {
                                      ...prev,
                                      entryLines: newLines,
                                      paymentMethod: anyCheckDebit
                                        ? '支票'
                                        : (prev.paymentMethod === '支票' ? firstDebitPm : prev.paymentMethod),
                                      ...(!anyCheckDebit
                                        ? {
                                            checkIssueDate: '',
                                            checkDate: '',
                                            checkNo: '',
                                            checkAccountId: '',
                                            checkNote: ''
                                          }
                                        : {})
                                    };
                                  });
                                }}
                                style={{ ...inputStyle, marginBottom: 0 }}>
                                <option value="">不指定</option>
                                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <select value={line.accountId || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updateExecuteLine(realIdx, 'accountId', v);
                                  if (isCheck) {
                                    setExecuteForm((prev) => ({ ...prev, checkAccountId: v }));
                                  }
                                }}
                                disabled={!accountColEnabled}
                                style={{
                                  ...inputStyle,
                                  marginBottom: 0,
                                  opacity: accountColEnabled ? 1 : 0.4,
                                  background: accountColEnabled ? '#fff' : '#f8f9fa'
                                }}>
                                <option value="">
                                  {isTransfer ? '選擇帳戶' : isCheck ? '開票帳戶' : '—'}
                                </option>
                                {cashAccounts.map(a => (
                                  <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                                ))}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <input value={line.advancedBy || ''}
                                onChange={e => updateExecuteLine(realIdx, 'advancedBy', e.target.value)}
                                disabled={!isAdvance}
                                style={{ ...inputStyle, marginBottom: 0, opacity: isAdvance ? 1 : 0.4, background: isAdvance ? '#fff' : '#f8f9fa' }}
                                placeholder={isAdvance ? '員工姓名' : '—'} />
                            </td>
                            <td style={tdStyle}>
                              <input value={line.summary || ''}
                                onChange={e => updateExecuteLine(realIdx, 'summary', e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0 }} placeholder="摘要" />
                            </td>
                            <td style={tdStyle}>
                              <input type="number" value={line.amount}
                                onChange={e => updateExecuteLine(realIdx, 'amount', e.target.value)}
                                style={{ ...inputStyle, marginBottom: 0, textAlign: 'right' }} step="0.01" placeholder="0" />
                            </td>
                            <td style={tdStyle}>
                              <button onClick={() => {
                                setExecuteForm(prev => ({
                                  ...prev,
                                  entryLines: prev.entryLines.filter((_, i) => i !== realIdx)
                                }));
                              }}
                                style={{ color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer', fontSize: 19 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={8} style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>合計</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 18 }}>
                          {executeForm.entryLines
                            .filter(l => l.entryType === 'debit')
                            .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
                            .toLocaleString()}
                        </td>
                        <td style={tdStyle}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button onClick={() => {
                  setExecuteForm(prev => ({
                    ...prev,
                    entryLines: [...prev.entryLines, {
                      entryType: 'debit',
                      accountingCode: '',
                      accountingName: '',
                      summary: '',
                      amount: '',
                      supplierId: '',
                      supplierName: '',
                      warehouse: executeForm.warehouse || '',
                      paymentMethod: prev.creditCardAdvanceMode ? '信用卡' : (executeForm.paymentMethod || ''),
                      accountId: '',
                      advancedBy: prev.creditCardAdvanceMode ? (prev.creditCardAdvanceName || '老闆') : '',
                      sortOrder: prev.entryLines.length
                    }]
                  }));
                }}
                  style={{ marginTop: 8, padding: '4px 12px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 4, cursor: 'pointer', fontSize: 16 }}>
                  + 新增費用項目
                </button>
              </div>

              {/* Note */}
              <div style={{ marginTop: 16 }}>
                <label htmlFor="f-18" style={labelStyle}>備註</label>
                <input id="f-18" value={executeForm.note}
                  onChange={e => setExecuteForm(prev => ({ ...prev, note: e.target.value }))}
                  style={inputStyle} placeholder="選填" />
              </div>

              {/* Duplicate warning */}
              {duplicateWarning && (
                <div style={{ marginTop: 12, padding: 12, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6 }}>
                  <p style={{ marginBottom: 8, color: '#856404' }}>{duplicateWarning}</p>
                  <button onClick={() => handleExecute(true)} disabled={submitting}
                    style={{ padding: '6px 16px', background: '#ffc107', color: '#333', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
                    確定重複執行
                  </button>
                </div>
              )}

              {/* Execute button */}
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => handleExecute(false)}
                  disabled={submitting}
                  style={{
                    padding: '10px 32px',
                    background: submitting ? '#ccc' : '#28a745',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 18
                  }}>
                  {submitting ? '執行中...' : '執行'}
                </button>
              </div>

              {/* Data flow info */}
              <div style={{ marginTop: 16, padding: 12, background: '#f8f9fa', borderRadius: 6, fontSize: 16, color: '#666' }}>
                {mainTab === 'purchase' ? (
                  <div>
                    <strong>執行後資料流向：</strong>
                    <br />→ 進貨管理：自動建立進貨單 (PUR-XXXXXX)
                    {executeForm.invoiceNo && <><br />→ 發票管理：自動建立發票記錄 (INV-XXXXXX)</>}
                    <br />→ 費用記錄：建立本筆費用執行記錄 (EXP-XXXXXX)
                  </div>
                ) : (
                  <div>
                    <strong>執行後資料流向：</strong>
                    <br />→ 付款管理：自動建立付款單 (PAY-XXXXXX)
                    <br />→ 費用記錄：建立本筆費用執行記錄 (EXP-XXXXXX)
                    <br />→ 部門費用/月彙總：自動同步更新
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
