'use client';

export default function AddAdvanceForm({ addForm, setAddForm, handleAdd, onCancel, warehousesList, expenseCategories }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>手動新增代墊款</h3>
      <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div>
          <label htmlFor="f" style={{ fontSize: 15, color: '#6b7280' }}>代墊員工 *</label>
          <input id="f" value={addForm.employeeName} onChange={e => setAddForm(f => ({ ...f, employeeName: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }} />
        </div>
        <div>
          <label htmlFor="f-2" style={{ fontSize: 15, color: '#6b7280' }}>代墊方式</label>
          <select id="f-2" value={addForm.paymentMethod} onChange={e => setAddForm(f => ({ ...f, paymentMethod: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }}>
            <option value="現金">現金</option>
            <option value="信用卡">信用卡</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-3" style={{ fontSize: 15, color: '#6b7280' }}>金額 *</label>
          <input id="f-3" type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }} />
        </div>
        <div>
          <label htmlFor="f-4" style={{ fontSize: 15, color: '#6b7280' }}>費用名稱</label>
          <select id="f-4" value={addForm.expenseName} onChange={e => setAddForm(f => ({ ...f, expenseName: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }}>
            <option value="">選填</option>
            {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-13" style={{ fontSize: 15, color: '#6b7280' }}>摘要</label>
          <input id="f-13" value={addForm.summary} onChange={e => setAddForm(f => ({ ...f, summary: e.target.value }))} placeholder="選填" style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }} />
        </div>
        <div>
          <label htmlFor="f-14" style={{ fontSize: 15, color: '#6b7280' }}>說明</label>
          <input id="f-14" value={addForm.sourceDescription} onChange={e => setAddForm(f => ({ ...f, sourceDescription: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }} />
        </div>
        <div>
          <label htmlFor="f-15" style={{ fontSize: 15, color: '#6b7280' }}>館別</label>
          <select id="f-15" value={addForm.warehouse} onChange={e => setAddForm(f => ({ ...f, warehouse: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }}>
            <option value="">選填</option>
            {warehousesList.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-16" style={{ fontSize: 15, color: '#6b7280' }}>備註</label>
          <input id="f-16" value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 16 }} />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
          <button type="submit" style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>新增</button>
          <button type="button" onClick={onCancel} style={{ padding: '8px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>取消</button>
        </div>
      </form>
    </div>
  );
}
