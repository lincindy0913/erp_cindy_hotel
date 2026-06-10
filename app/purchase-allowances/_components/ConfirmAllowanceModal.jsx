'use client';

export default function ConfirmAllowanceModal({
  confirmingId, records, bankAccounts,
  confirmDate, setConfirmDate,
  confirmAccountId, setConfirmAccountId,
  confirmSaving, handleConfirm,
  onClose,
}) {
  if (!confirmingId) return null;

  const rec = records.find(r => r.id === confirmingId);
  if (!rec) return null;

  const isFullReturn = rec.allowanceType === '全額退貨';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 480 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, color: isFullReturn ? '#dc2626' : '#374151' }}>
          {isFullReturn ? '確認全額退貨退款' : '確認退貨退款'}
        </h3>

        <div style={{ background: isFullReturn ? '#fef2f2' : '#f0fdf4', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><strong>退貨單：</strong>{rec.allowanceNo}</div>
            <span style={{
              padding: '2px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
              background: isFullReturn ? '#fee2e2' : '#fef3c7',
              color: isFullReturn ? '#dc2626' : '#92400e',
            }}>{rec.allowanceType === '折讓' ? '退貨' : (rec.allowanceType || '退貨')}</span>
          </div>
          <div><strong>供應商：</strong>{rec.supplierName || '-'}</div>
          {rec.invoiceNo && <div><strong>原發票：</strong>{rec.invoiceNo}</div>}
          {rec.paymentOrderNo && <div><strong>原付款單：</strong>{rec.paymentOrderNo}</div>}
          <div style={{ marginTop: 8 }}>
            <strong>退款金額：</strong>
            <span style={{ color: isFullReturn ? '#dc2626' : '#059669', fontWeight: 700, fontSize: '1.25rem' }}>NT$ {rec.totalAmount.toLocaleString()}</span>
          </div>
          {rec.reason && <div style={{ marginTop: 4 }}><strong>原因：</strong>{rec.reason}</div>}
        </div>

        <div style={{ background: isFullReturn ? '#fef2f2' : '#eff6ff', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: '0.875rem', color: isFullReturn ? '#991b1b' : '#1d4ed8' }}>
          確認後系統將自動：
          <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
            <li>建立退款收入交易 NT$ {rec.totalAmount.toLocaleString()}</li>
            <li>更新帳戶餘額</li>
            <li>回沖損益表（DepartmentExpense）及月度彙總</li>
            {isFullReturn && rec.paymentOrderNo && <li style={{ fontWeight: 600 }}>原付款單 {rec.paymentOrderNo} 標記「已退貨」</li>}
            {isFullReturn && rec.invoiceNo && <li style={{ fontWeight: 600 }}>原發票 {rec.invoiceNo} 標記「已退貨」</li>}
            {isFullReturn && <li style={{ fontWeight: 600 }}>原進貨單標記「已退貨」</li>}
            {isFullReturn && <li style={{ fontWeight: 600 }}>沖銷原出納付款交易</li>}
          </ul>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="f-9" style={{ fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款入帳帳戶 *</label>
          <select id="f-9" value={confirmAccountId} onChange={e => setConfirmAccountId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem' }}>
            <option value="">選擇帳戶</option>
            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="f-11" style={{ fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: 4, fontWeight: 600 }}>退款日期</label>
          <input id="f-11" type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '1rem', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={confirmSaving} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: confirmSaving ? 'not-allowed' : 'pointer', fontSize: '1rem' }}>取消</button>
          <button onClick={handleConfirm} disabled={confirmSaving} style={{ padding: '8px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: confirmSaving ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 600, opacity: confirmSaving ? 0.7 : 1 }}>
            {confirmSaving ? '處理中...' : '確認退款入帳'}
          </button>
        </div>
      </div>
    </div>
  );
}
