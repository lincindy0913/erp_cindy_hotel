'use client';

export default function EditAdvanceModal({ editingAdvance, editForm, setEditForm, handleEditSave, onClose, warehousesList, expenseCategories }) {
  if (!editingAdvance) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, width: 500, maxHeight: '80vh', overflow: 'auto' }}>
        <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 16 }}>編輯代墊款 — {editingAdvance.advanceNo}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label htmlFor="f-9" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>代墊員工 *</label>
            <input id="f-9" value={editForm.employeeName} onChange={e => setEditForm(f => ({ ...f, employeeName: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="f-10" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>付款方式</label>
            <select id="f-10" value={editForm.paymentMethod} onChange={e => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }}>
              <option value="現金">現金</option>
              <option value="信用卡">信用卡</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-11" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>金額 *</label>
            <input id="f-11" type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box', textAlign: 'right' }} />
          </div>
          <div>
            <label htmlFor="f-12" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>費用名稱</label>
            <select id="f-12" value={editForm.expenseName} onChange={e => setEditForm(f => ({ ...f, expenseName: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }}>
              <option value="">選填</option>
              {expenseCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              {editForm.expenseName && !expenseCategories.some(c => c.name === editForm.expenseName) && <option value={editForm.expenseName}>{editForm.expenseName} (舊值)</option>}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="f-19" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>摘要</label>
            <input id="f-19" value={editForm.summary} onChange={e => setEditForm(f => ({ ...f, summary: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="f-20" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>來源說明</label>
            <input id="f-20" value={editForm.sourceDescription} onChange={e => setEditForm(f => ({ ...f, sourceDescription: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="f-21" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>館別</label>
            <select id="f-21" value={editForm.warehouse} onChange={e => setEditForm(f => ({ ...f, warehouse: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }}>
              <option value="">選填</option>
              {warehousesList.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
              {editForm.warehouse && !warehousesList.some(w => w.name === editForm.warehouse) && <option value={editForm.warehouse}>{editForm.warehouse} (舊值)</option>}
            </select>
          </div>
          <div>
            <label htmlFor="f-22" style={{ fontSize: 15, color: '#6b7280', display: 'block', marginBottom: 4 }}>備註</label>
            <input id="f-22" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 17, boxSizing: 'border-box' }} />
          </div>
        </div>
        {editingAdvance.paymentOrderNo && (
          <div style={{ marginTop: 12, padding: 8, background: '#f3f4f6', borderRadius: 6, fontSize: 15, color: '#6b7280' }}>
            關聯付款單：{editingAdvance.paymentOrderNo}（修改金額會同步更新付款單和費用記錄）
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>取消</button>
          <button onClick={handleEditSave} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>儲存</button>
        </div>
      </div>
    </div>
  );
}
