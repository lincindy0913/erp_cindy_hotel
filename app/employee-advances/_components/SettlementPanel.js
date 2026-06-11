'use client';

export default function SettlementPanel({
  selectedIds, selectedAdvances, selectedTotal,
  settleAccountId, setSettleAccountId,
  settleDate, setSettleDate,
  settleNote, setSettleNote,
  settling, handleSettle,
  billTotal, setBillTotal,
  privateAmount, privateAccountId, setPrivateAccountId,
  bankAccounts, toggleSelect,
}) {
  return (
    <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: 19, fontWeight: 700, color: '#065f46', marginBottom: 12 }}>結算明細 — 已選 {selectedIds.size} 筆</h3>

      {/* Selected items detail table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#ecfdf5' }}>
          <tr style={{ background: '#ecfdf5' }}>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>代墊單號</th>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>代墊員工</th>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>費用名稱</th>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #d1fae5' }}>摘要</th>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #d1fae5' }}>金額</th>
            <th style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid #d1fae5' }}>取消</th>
          </tr>
        </thead>
        <tbody>
          {selectedAdvances.map(a => (
            <tr key={a.id}>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace' }}>{a.advanceNo}</td>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{a.employeeName}</td>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6' }}>{a.expenseName || '-'}</td>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6' }}>{a.summary || a.sourceDescription || '-'}</td>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>NT$ {Number(a.amount).toLocaleString()}</td>
              <td style={{ padding: '6px 12px', fontSize: '1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                <button onClick={() => toggleSelect(a.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#ecfdf5' }}>
            <td colSpan={4} style={{ padding: '8px 12px', fontSize: '1rem', fontWeight: 700 }}>代墊公費合計</td>
            <td style={{ padding: '8px 12px', fontSize: '1.1rem', fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>NT$ {selectedTotal.toLocaleString()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      {/* Settlement form fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <div>
          <label htmlFor="f-6" style={{ fontSize: 16, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>付款帳戶 *</label>
          <select id="f-6" value={settleAccountId} onChange={e => setSettleAccountId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 17 }}>
            <option value="">選擇帳戶</option>
            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-17" style={{ fontSize: 16, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>結算日期 *</label>
          <input id="f-17" type="date" value={settleDate} onChange={e => setSettleDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 17, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="f-18" style={{ fontSize: 16, color: '#065f46', display: 'block', marginBottom: 4, fontWeight: 600 }}>備註</label>
          <input id="f-18" value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="選填" style={{ width: '100%', padding: '8px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 17, boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Credit card bill section */}
      <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 8, padding: 16, marginBottom: 12 }}>
        <h4 style={{ fontSize: 17, fontWeight: 700, color: '#7c3aed', marginBottom: 8 }}>信用卡帳單拆帳（選填）</h4>
        <p style={{ fontSize: 15, color: '#6b7280', marginBottom: 12 }}>
          若信用卡帳單包含老闆私帳，請輸入帳單總額，系統會自動計算私帳金額並建立「股東往來」交易記錄。
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
          <div>
            <label htmlFor="f-7" style={{ fontSize: 16, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>信用卡帳單總額</label>
            <input id="f-7" type="number" value={billTotal} onChange={e => setBillTotal(e.target.value)} placeholder="留空則不拆帳" style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8b4fe', borderRadius: 6, fontSize: 17, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 16, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>老闆私帳金額（自動計算）</label>
            <div style={{ padding: '8px 10px', background: '#ede9fe', borderRadius: 6, fontSize: 18, fontWeight: 700, color: billTotal && privateAmount > 0 ? '#7c3aed' : '#9ca3af' }}>
              {billTotal ? `NT$ ${privateAmount.toLocaleString()}` : '—'}
            </div>
          </div>
          <div>
            <label htmlFor="f-8" style={{ fontSize: 16, color: '#7c3aed', display: 'block', marginBottom: 4, fontWeight: 600 }}>私帳入帳科目</label>
            <select id="f-8" value={privateAccountId} onChange={e => setPrivateAccountId(e.target.value)} disabled={!billTotal || privateAmount <= 0} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d8b4fe', borderRadius: 6, fontSize: 17, opacity: billTotal && privateAmount > 0 ? 1 : 0.5 }}>
              <option value="">股東往來（預設）</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
          </div>
        </div>
        {billTotal && parseFloat(billTotal) < selectedTotal && (
          <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 16, color: '#dc2626' }}>
            帳單總額不能小於代墊公費合計 NT$ {selectedTotal.toLocaleString()}
          </div>
        )}
        {billTotal && privateAmount > 0 && (
          <div style={{ marginTop: 8, padding: 8, background: '#f5f3ff', borderRadius: 6, fontSize: 16, color: '#5b21b6' }}>
            帳單總額 NT$ {parseFloat(billTotal).toLocaleString()} = 代墊公費 NT$ {selectedTotal.toLocaleString()} + 老闆私帳 NT$ {privateAmount.toLocaleString()}
          </div>
        )}
      </div>

      {/* Summary and settle button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #86efac' }}>
        <div style={{ fontSize: 17, color: '#065f46' }}>
          <span style={{ fontWeight: 600 }}>付款總額：</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>NT$ {(billTotal && privateAmount > 0 ? parseFloat(billTotal) : selectedTotal).toLocaleString()}</span>
          {billTotal && privateAmount > 0 && (
            <span style={{ fontSize: 16, color: '#6b7280', marginLeft: 8 }}>
              （公費 {selectedTotal.toLocaleString()} + 私帳 {privateAmount.toLocaleString()}）
            </span>
          )}
        </div>
        <button onClick={handleSettle} disabled={settling} style={{ padding: '10px 28px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: settling ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 700, opacity: settling ? 0.6 : 1 }}>
          {settling ? '結算中...' : '確認結算'}
        </button>
      </div>
    </div>
  );
}
