'use client';

import ExportButtons from '@/components/ExportButtons';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import { SortableThInline } from '@/components/SortableTh';
import { labelStyle, inputStyle, tableStyle, thStyle, tdStyle, smallBtnStyle, PAYMENT_METHODS } from './styles';

export default function RecordsTab({
  mainTab,
  // Records state
  sortedExpenseRecords,
  recordsTotal,
  recordsLoading,
  recordFilter, setRecordFilter,
  expandedRecord, setExpandedRecord,
  expRecSortKey, expRecSortDir, toggleExpRecSort,
  // Record handlers
  handlePrintMonthlyReport,
  handleDeleteRecord,
  openEditRecord,
  fetchRecords,
  // Shared data
  warehouses,
  showToast,
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>
          {mainTab === 'purchase' ? '進銷存費用記錄' : '固定費用記錄'}
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => handlePrintMonthlyReport(sortedExpenseRecords)}
            disabled={sortedExpenseRecords.length === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              border: '1px solid #d1d5db', background: '#fff', color: '#374151',
              cursor: sortedExpenseRecords.length === 0 ? 'not-allowed' : 'pointer',
              opacity: sortedExpenseRecords.length === 0 ? 0.5 : 1,
            }}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            列印每月支出報表
          </button>
          <ExportButtons
            data={sortedExpenseRecords.map(r => ({
              recordNo: r.recordNo || '',
              templateName: r.template?.name || '',
              expenseMonth: r.expenseMonth || '',
              warehouse: r.warehouse || '',
              totalDebit: Number(r.totalDebit || 0),
              relatedNos: [r.purchaseNo, r.salesNo, r.paymentOrderNo].filter(Boolean).join(' / '),
              paymentStatus: r.paymentStatus || r.status || '',
              note: r.note || '',
            }))}
            columns={[
              { header: '記錄單號', key: 'recordNo' },
              { header: '範本', key: 'templateName' },
              { header: '月份', key: 'expenseMonth' },
              { header: '館別', key: 'warehouse' },
              { header: '金額', key: 'totalDebit', format: 'number' },
              { header: '關聯單號', key: 'relatedNos' },
              { header: '狀態', key: 'paymentStatus' },
              { header: '備註', key: 'note' },
            ]}
            exportName="費用記錄"
            period={recordFilter.month}
            title={`費用記錄 ${recordFilter.month || ''} ${recordFilter.warehouse || ''}`}
          />
          <ExcelBatchImport
            title="部門費用批次匯入"
            hint="批次建立部門費用月彙總。相同年月+部門+類別會覆蓋更新。"
            columns={[
              { key: 'year',       header: '年份',     example: String(new Date().getFullYear()), required: true,  width: 8 },
              { key: 'month',      header: '月份',     example: String(new Date().getMonth() + 1), required: true, width: 6, note: '1-12' },
              { key: 'department', header: '部門',     example: '餐飲部',  required: true,  width: 16 },
              { key: 'category',   header: '費用類別', example: '薪資',    required: true,  width: 16 },
              { key: 'amount',     header: '金額',     example: '50000',   required: true,  width: 12 },
              { key: 'tax',        header: '稅額',     example: '0',       required: false, width: 10 },
            ]}
            onImport={async rows => {
              const res = await fetch('/api/department-expenses/import-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows }),
              });
              const json = await res.json();
              if (res.ok) return json;
              throw new Error(json.error || '匯入失敗');
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="f-19" style={{ ...labelStyle, fontSize: 15 }}>月份</label>
          <input id="f-19" type="month" value={recordFilter.month}
            onChange={e => setRecordFilter(prev => ({ ...prev, month: e.target.value }))}
            style={{ ...inputStyle, width: 160 }} />
        </div>
        <div>
          <label htmlFor="f-20" style={{ ...labelStyle, fontSize: 15 }}>館別</label>
          <select id="f-20" value={recordFilter.warehouse}
            onChange={e => setRecordFilter(prev => ({ ...prev, warehouse: e.target.value }))}
            style={{ ...inputStyle, width: 120 }}>
            <option value="">全部</option>
            {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-31" style={{ ...labelStyle, fontSize: 15 }}>付款狀態</label>
          <select id="f-31" value={recordFilter.status}
            onChange={e => setRecordFilter(prev => ({ ...prev, status: e.target.value }))}
            style={{ ...inputStyle, width: 120 }}>
            <option value="">全部</option>
            <option value="待出納">待出納</option>
            <option value="已代墊">已代墊</option>
            <option value="已付款">已付款</option>
          </select>
        </div>
      </div>

      {recordsLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>載入中...</div>
      ) : sortedExpenseRecords.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          本月尚無{mainTab === 'purchase' ? '進銷存' : '固定'}費用記錄
        </div>
      ) : (
        <div className="tbl-wrap">
          <table style={tableStyle}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <SortableThInline label="記錄單號" colKey="recordNo" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <SortableThInline label="範本" colKey="templateName" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <SortableThInline label="月份" colKey="expenseMonth" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <SortableThInline label="館別" colKey="warehouse" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <SortableThInline label="金額" colKey="totalDebit" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={{ ...thStyle, textAlign: 'right' }} align="right" />
                <SortableThInline label="關聯單號" colKey="relatedNos" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <SortableThInline label="狀態" colKey="paymentStatus" sortKey={expRecSortKey} sortDir={expRecSortDir} onSort={toggleExpRecSort} thStyle={thStyle} />
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenseRecords.map(r => {
                const ps = r.paymentStatus;
                return (
                  <tr key={r.id} style={{ background: '#fff' }}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{r.recordNo}</span>
                    </td>
                    <td style={tdStyle}>{r.template?.name || '-'}</td>
                    <td style={tdStyle}>{r.expenseMonth}</td>
                    <td style={tdStyle}>{r.warehouse}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                      {Number(r.totalDebit).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 15 }}>
                        {r.purchaseNo && <div>進貨: <span style={{ color: '#1a73e8' }}>{r.purchaseNo}</span></div>}
                        {r.salesNo && <div>發票: <span style={{ color: '#1a73e8' }}>{r.salesNo}</span></div>}
                        {r.paymentOrderNo && <div>付款: <span style={{ color: '#1a73e8' }}>{r.paymentOrderNo}</span></div>}
                        {!r.purchaseNo && !r.salesNo && !r.paymentOrderNo && '-'}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 15,
                        background: ps === '已付款' ? '#d4edda' : ps === '待出納' ? '#fff3cd' : ps === '已代墊' ? '#f3e8ff' : '#e2e3e5',
                        color: ps === '已付款' ? '#155724' : ps === '待出納' ? '#856404' : ps === '已代墊' ? '#6d28d9' : '#383d41'
                      }}>
                        {ps || r.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => setExpandedRecord(expandedRecord === r.id ? null : r.id)}
                          style={smallBtnStyle}>
                          {expandedRecord === r.id ? '收起' : '明細'}
                        </button>
                        {mainTab === 'fixed' && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/export/expense-record', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  credentials: 'include',
                                  body: JSON.stringify({ recordId: r.id }),
                                });
                                if (!res.ok) { showToast('PDF 產生失敗', 'error'); return; }
                                const blob = await res.blob();
                                window.open(URL.createObjectURL(blob), '_blank');
                              } catch { showToast('PDF 產生失敗', 'error'); }
                            }}
                            style={{ ...smallBtnStyle, color: '#6d28d9', borderColor: '#6d28d9' }}>
                            傳票PDF
                          </button>
                        )}
                        {(ps === '待出納' || ps === '已代墊') && (
                          <>
                            <button onClick={() => openEditRecord(r)}
                              style={{ ...smallBtnStyle, color: '#1a73e8' }}>編輯</button>
                            <button onClick={() => handleDeleteRecord(r.id)}
                              style={{ ...smallBtnStyle, color: '#dc3545' }}>刪除</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedExpenseRecords.map(r => expandedRecord === r.id && (
                <tr key={`detail-${r.id}`}>
                  <td colSpan={8} style={{ padding: 16, background: '#fafbfc' }}>
                    <div style={{ fontSize: 16 }}>
                      <div style={{ marginBottom: 8 }}>
                        <strong>建立者:</strong> {r.createdBy} | <strong>建立時間:</strong> {r.createdAt?.split('T')[0]}
                        {r.confirmedBy && <> | <strong>確認者:</strong> {r.confirmedBy}</>}
                        {r.note && <> | <strong>備註:</strong> {r.note}</>}
                      </div>
                      {r.entryLines && r.entryLines.length > 0 && (
                        <table style={{ ...tableStyle, fontSize: 15 }}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, padding: '4px 8px' }}>費用名稱</th>
                              <th style={{ ...thStyle, padding: '4px 8px' }}>會計代碼</th>
                              <th style={{ ...thStyle, padding: '4px 8px', textAlign: 'right' }}>金額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.entryLines.filter(l => l.entryType === 'debit').map((line, i) => (
                              <tr key={i}>
                                <td style={{ ...tdStyle, padding: '4px 8px' }}>{line.accountingName}</td>
                                <td style={{ ...tdStyle, padding: '4px 8px' }}>{line.accountingCode}</td>
                                <td style={{ ...tdStyle, padding: '4px 8px', textAlign: 'right' }}>{Number(line.amount).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 16, color: '#888' }}>
        共 {recordsTotal} 筆記錄
      </div>
    </div>
  );
}
