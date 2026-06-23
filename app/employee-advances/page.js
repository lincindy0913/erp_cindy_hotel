'use client';

import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import { SortableThInline } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';
import { useEmployeeAdvances } from './_hooks/useEmployeeAdvances';
import AddAdvanceForm from './_components/AddAdvanceForm';
import SettlementPanel from './_components/SettlementPanel';
import EditAdvanceModal from './_components/EditAdvanceModal';

const thStyle = { padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: 18, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 18 };

export default function EmployeeAdvancesPage() {
  const adv = useEmployeeAdvances();

  if (adv.loading) return (
    <>
      <Navigation borderColor="border-green-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>載入中...</div>
      </div>
    </>
  );

  return (
    <>
      <Navigation borderColor="border-green-500" />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>

        <ModuleGuideCard
          title="員工代墊款流程指引"
          color="green"
          storageKey="guide-employee-advances"
          steps={[
            { label: '登記代墊款', desc: '手動新增或批次匯入員工代墊費用記錄' },
            { label: '查看待結算', desc: '查看各員工待結算金額，追蹤未報帳項目' },
            { label: '執行結算', desc: '核對無誤後標記結算，可連結付款單出帳' },
            { label: '彙總報表', desc: '查看各員工代墊總金額與歷史結算紀錄' },
          ]}
        />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 26, fontWeight: 700 }}>員工代墊款管理</h2>
          <button onClick={() => adv.setShowAddForm(v => !v)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 17 }}>
            + 手動新增代墊款
          </button>
        </div>
        {adv.fetchError && <FetchErrorBanner message={adv.fetchError} onRetry={adv.fetchAll} />}

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 15, color: '#92400e' }}>待結算筆數</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#92400e' }}>{adv.pendingAdvances.length}</div>
          </div>
          <div style={{ background: '#fee2e2', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 15, color: '#991b1b' }}>待結算金額</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#991b1b' }}>NT$ {adv.pendingAdvances.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</div>
          </div>
          <div style={{ background: '#d1fae5', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 15, color: '#065f46' }}>已結算筆數</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#065f46' }}>{adv.settledAdvances.length}</div>
          </div>
          <div style={{ background: '#e0e7ff', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 15, color: '#3730a3' }}>代墊員工數</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#3730a3' }}>{adv.employeeSummaryList.length}</div>
          </div>
        </div>

        {/* Add form */}
        {adv.showAddForm && (
          <AddAdvanceForm
            addForm={adv.addForm} setAddForm={adv.setAddForm}
            handleAdd={adv.handleAdd} onCancel={() => adv.setShowAddForm(false)}
            warehousesList={adv.warehousesList} expenseCategories={adv.expenseCategories}
          />
        )}

        {/* Tabs + Print/Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb' }}>
            {adv.TABS.map(tab => (
              <button key={tab.key} onClick={() => adv.setActiveTab(tab.key)} style={{
                padding: '10px 20px', border: 'none', borderBottom: adv.activeTab === tab.key ? '3px solid #2563eb' : '3px solid transparent',
                background: 'none', fontSize: 17, fontWeight: adv.activeTab === tab.key ? 600 : 400,
                color: adv.activeTab === tab.key ? '#2563eb' : '#6b7280', cursor: 'pointer',
              }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => adv.handlePrint(adv.activeTab, adv.filteredPending, adv.settledAdvances)} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#374151' }}>列印</button>
            <button onClick={() => adv.handleExportExcel(adv.activeTab, adv.filteredPending, adv.settledAdvances)} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#374151' }}>匯出 Excel</button>
            <ExcelBatchImport
              title="員工代墊批次匯入"
              hint="批次建立員工代墊記錄，狀態預設為「待結算」。"
              columns={[
                { key: 'date',          header: '日期',     example: todayStr(), required: false, width: 14, note: 'YYYY-MM-DD，空白用今天' },
                { key: 'employeeName',  header: '員工姓名', example: '王小明',   required: true,  width: 14 },
                { key: 'amount',        header: '代墊金額', example: '2500',     required: true,  width: 12 },
                { key: 'description',   header: '費用說明', example: '採購材料', required: false, width: 20 },
                { key: 'paymentMethod', header: '付款方式', example: '現金',     required: false, width: 10, note: '現金/信用卡' },
              ]}
              onImport={async rows => {
                const res = await fetch('/api/employee-advances/import-excel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rows }),
                });
                const json = await res.json();
                if (res.ok) { adv.fetchAll(); return json; }
                throw new Error(json.error || '匯入失敗');
              }}
              buttonClass="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 flex items-center gap-1"
            />
          </div>
        </div>

        {/* Pending Tab */}
        {adv.activeTab === 'pending' && (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div>
                <label htmlFor="f-5" style={{ fontSize: 16, color: '#6b7280', marginRight: 4 }}>篩選員工：</label>
                <select id="f-5" value={adv.filterEmployee} onChange={e => { adv.setFilterEmployee(e.target.value); adv.setSelectedIds(new Set()); }} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17 }}>
                  <option value="">全部</option>
                  {adv.employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {adv.selectedIds.size > 0 && (
              <SettlementPanel
                selectedIds={adv.selectedIds} selectedAdvances={adv.selectedAdvances} selectedTotal={adv.selectedTotal}
                settleAccountId={adv.settleAccountId} setSettleAccountId={adv.setSettleAccountId}
                settleDate={adv.settleDate} setSettleDate={adv.setSettleDate}
                settleNote={adv.settleNote} setSettleNote={adv.setSettleNote}
                settling={adv.settling} handleSettle={adv.handleSettle}
                billTotal={adv.billTotal} setBillTotal={adv.setBillTotal}
                privateAmount={adv.privateAmount} privateAccountId={adv.privateAccountId} setPrivateAccountId={adv.setPrivateAccountId}
                bankAccounts={adv.bankAccounts} toggleSelect={adv.toggleSelect}
              />
            )}

            {adv.filteredPending.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>目前沒有待結算的代墊款</div>
            ) : (
              <div className="tbl-wrap"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }}>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}><input type="checkbox" checked={adv.selectedIds.size === adv.filteredPending.length && adv.filteredPending.length > 0} onChange={adv.toggleSelectAll} /></th>
                    <SortableThInline label="代墊單號" colKey="advanceNo" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="代墊員工" colKey="employeeName" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="代墊方式" colKey="paymentMethod" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="來源" colKey="source" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="費用名稱" colKey="expenseName" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="摘要" colKey="summary" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <SortableThInline label="金額" colKey="amount" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="建立日期" colKey="createdAt" sortKey={adv.advPenKey} sortDir={adv.advPenDir} onSort={adv.toggleAdvPen} thStyle={thStyle} />
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {adv.sortedFilteredPending.map(a => (
                    <tr key={a.id} style={{ background: adv.selectedIds.has(a.id) ? '#eff6ff' : 'transparent' }}>
                      <td style={tdStyle}><input type="checkbox" checked={adv.selectedIds.has(a.id)} onChange={() => adv.toggleSelect(a.id)} /></td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 17 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 16, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 17, color: '#6b7280' }}>{a.sourceType === 'maintenance' ? '維護費' : a.sourceType === 'expense' ? '費用' : '其他'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 17 }}>{a.expenseName || '-'}</span></td>
                      <td style={tdStyle}><span style={{ fontSize: 17 }}>{a.summary || a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}><span style={{ fontSize: 17, color: '#6b7280' }}>{a.createdAt?.substring(0, 10)}</span></td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => adv.openEditAdvance(a)} style={{ padding: '4px 10px', fontSize: 16, color: '#2563eb', background: 'none', border: '1px solid #2563eb', borderRadius: 4, cursor: 'pointer' }}>編輯</button>
                          <button onClick={() => adv.handleDeleteAdvance(a)} style={{ padding: '4px 10px', fontSize: 16, color: '#dc2626', background: 'none', border: '1px solid #dc2626', borderRadius: 4, cursor: 'pointer' }}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>合計 {adv.filteredPending.length} 筆</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>NT$ {adv.filteredPending.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}</td>
                    <td colSpan={2} style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table></div>
            )}
          </div>
        )}

        {/* Settled Tab */}
        {adv.activeTab === 'settled' && (
          <div>
            {adv.settledAdvances.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無已結算紀錄</div>
            ) : (
              <div className="tbl-wrap"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }}>
                  <tr style={{ background: '#f9fafb' }}>
                    <SortableThInline label="代墊單號" colKey="advanceNo" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊員工" colKey="employeeName" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊方式" colKey="paymentMethod" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="說明" colKey="description" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="代墊金額" colKey="amount" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="結算日期" colKey="settledDate" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                    <SortableThInline label="結算交易" colKey="settlementTxNo" sortKey={adv.advSetKey} sortDir={adv.advSetDir} onSort={adv.toggleAdvSet} thStyle={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {adv.sortedSettledAdvances.map(a => (
                    <tr key={a.id}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 17 }}>{a.advanceNo}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employeeName}</span></td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 16, background: a.paymentMethod === '信用卡' ? '#dbeafe' : '#f3f4f6', color: a.paymentMethod === '信用卡' ? '#1d4ed8' : '#374151' }}>
                          {a.paymentMethod}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 17 }}>{a.sourceDescription || '-'}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>NT$ {Number(a.amount).toLocaleString()}</td>
                      <td style={tdStyle}>{a.settledDate || '-'}</td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: 17, color: '#059669' }}>{a.settlementTxNo || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )}

        {/* Employees Tab */}
        {adv.activeTab === 'employees' && (
          <div>
            {adv.employeeSummaryList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>尚無代墊款紀錄</div>
            ) : (
              <div className="tbl-wrap"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f9fafb' }}>
                  <tr style={{ background: '#f9fafb' }}>
                    <SortableThInline label="員工" colKey="name" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={thStyle} />
                    <SortableThInline label="待結算筆數" colKey="pending" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <SortableThInline label="待結算金額" colKey="pendingAmount" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="已結算筆數" colKey="settled" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <SortableThInline label="已結算金額" colKey="settledAmount" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                    <SortableThInline label="總筆數" colKey="total" sortKey={adv.advEmpKey} sortDir={adv.advEmpDir} onSort={adv.toggleAdvEmp} thStyle={{ ...thStyle, textAlign: 'center' }} align="center" />
                    <th style={thStyle}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {adv.sortedEmployeeSummary.map(emp => (
                    <tr key={emp.name}>
                      <td style={tdStyle}><span style={{ fontWeight: 600, fontSize: 17 }}>{emp.name}</span></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {emp.pending > 0 ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 12px', borderRadius: 12, fontSize: 17, fontWeight: 600 }}>{emp.pending}</span> : <span style={{ color: '#9ca3af' }}>0</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: emp.pendingAmount > 0 ? 700 : 400, color: emp.pendingAmount > 0 ? '#dc2626' : '#9ca3af' }}>
                        NT$ {emp.pendingAmount.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>{emp.settled}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>NT$ {emp.settledAmount.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.total}</td>
                      <td style={tdStyle}>
                        {emp.pending > 0 && (
                          <button onClick={() => { adv.setActiveTab('pending'); adv.setFilterEmployee(emp.name); }} style={{ padding: '4px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 15 }}>
                            去結算
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditAdvanceModal
        editingAdvance={adv.editingAdvance} editForm={adv.editForm} setEditForm={adv.setEditForm}
        handleEditSave={adv.handleEditSave} onClose={() => adv.setEditingAdvance(null)}
        warehousesList={adv.warehousesList} expenseCategories={adv.expenseCategories}
      />
    </>
  );
}
