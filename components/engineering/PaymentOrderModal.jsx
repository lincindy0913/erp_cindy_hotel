'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { getActualPaid } from '@/lib/engineering/payment-utils';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const EMPTY_FORM = {
  projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '',
  amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '',
  dueDate: '', summary: '', note: '', materials: [],
};

/**
 * 工程付款單 Modal（新增 / 編輯）
 *
 * Props:
 *   isOpen            - bool
 *   editingOrder      - { id } | null
 *   initialForm       - 開啟時的預填值（不含 _editingId）
 *   contracts         - array (lookup)
 *   projects          - array (lookup)
 *   accounts          - array (lookup)
 *   paymentOrders     - array (計算剩餘應付用)
 *   paymentMethodOptions - string[]
 *   onClose           - () => void
 *   onSaved           - ({ isNew: bool }) => void
 */
export default function PaymentOrderModal({
  isOpen,
  editingOrder,
  initialForm,
  contracts,
  projects,
  accounts,
  paymentOrders,
  paymentMethodOptions,
  onClose,
  onSaved,
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ ...EMPTY_FORM, dueDate: todayStr() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM, dueDate: todayStr(), ...initialForm });
      setSaving(false);
    }
  }, [isOpen, initialForm]);

  if (!isOpen) return null;

  async function handleSave() {
    if (!form.netAmount || parseFloat(form.netAmount) <= 0) {
      showToast('請填寫應付金額', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingOrder) {
        const res = await fetch(`/api/payment-orders/${editingOrder.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: form.paymentMethod,
            netAmount: parseFloat(form.netAmount),
            amount: parseFloat(form.amount || form.netAmount),
            supplierName: form.supplierName || null,
            dueDate: form.dueDate || null,
            accountId: form.accountId || null,
            summary: form.summary || null,
            note: form.note || null,
            status: '待出納',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || data.message || '更新失敗');
        onClose();
        onSaved({ isNew: false });
        showToast('付款單已更新', 'success');
      } else {
        const selContract = form.contractId ? contracts.find(c => c.id === Number(form.contractId)) : null;
        const contractMats = selContract?.materials || [];
        const matRows = (form.materials || []).filter(m => m.materialId && parseFloat(m.quantity) > 0);
        const projId = selContract?.projectId || (form.projectId ? parseInt(form.projectId) : null);
        const materialPayload = matRows.map(mat => {
          const cm = contractMats.find(c => c.id === Number(mat.materialId));
          if (!cm) return null;
          return {
            projectId: projId,
            contractId: form.contractId ? parseInt(form.contractId) : null,
            termId: form.termId ? parseInt(form.termId) : null,
            description: cm.description,
            quantity: parseFloat(mat.quantity) || 0,
            unit: cm.unit || '式',
            unitPrice: cm.unitPrice,
            note: mat.note?.trim() || null,
          };
        }).filter(Boolean);

        const endpoint = materialPayload.length > 0
          ? '/api/engineering/payment-orders-with-materials'
          : '/api/payment-orders';
        const payload = materialPayload.length > 0
          ? {
              paymentMethod: form.paymentMethod,
              netAmount: parseFloat(form.netAmount),
              supplierId: form.supplierId || null,
              supplierName: form.supplierName || null,
              dueDate: form.dueDate || null,
              accountId: form.accountId || null,
              summary: form.summary || null,
              note: form.note || null,
              sourceRecordId: form.termId ? parseInt(form.termId) : null,
              warehouse: form.warehouse || null,
              materials: materialPayload,
            }
          : {
              invoiceIds: [],
              paymentMethod: form.paymentMethod,
              netAmount: parseFloat(form.netAmount),
              amount: parseFloat(form.amount || form.netAmount),
              discount: 0,
              supplierId: form.supplierId || null,
              supplierName: form.supplierName || null,
              dueDate: form.dueDate || null,
              accountId: form.accountId || null,
              summary: form.summary || null,
              note: form.note || null,
              status: '待出納',
              sourceType: 'engineering',
              sourceRecordId: form.termId ? parseInt(form.termId) : null,
              warehouse: form.warehouse || null,
            };

        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || '建立失敗');
        onClose();
        onSaved({ isNew: true });
        showToast('付款單已建立，請至出納執行付款（出納付款後自動更新期數狀態）', 'success');
      }
    } catch (e) {
      showToast(e.message || '儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{editingOrder ? '編輯付款單' : '建立工程付款單'}</h3>
        <div className="space-y-3">

          {/* 連結合約期數 */}
          {!editingOrder && (
            <div>
              <label htmlFor="po-termId" className="block text-xs text-gray-500 mb-1">連結合約期數（選填）</label>
              <select id="po-termId" value={form.termId} onChange={e => {
                const v = e.target.value;
                if (!v) { setForm(f => ({ ...f, termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', summary: '' })); return; }
                const [tid, cid] = v.split('-').map(Number);
                const contract = contracts.find(c => c.id === cid);
                const term = contract?.terms?.find(t => t.id === tid);
                if (term && contract) {
                  const proj = projects.find(p => p.id === contract.projectId);
                  const whName = proj?.warehouseRef?.name || proj?.warehouse || '';
                  const deptName = proj?.departmentRef?.name || '';
                  const termPaidAmt = paymentOrders
                    .filter(po => po.sourceRecordId === tid && (po.status === '已執行' || po.status === '待出納'))
                    .reduce((s, po) => s + (po.status === '已執行' ? getActualPaid(po) : Number(po.amount || 0)), 0);
                  const payable = Number(term.amount) - Number(term.retentionAmount || 0);
                  const remaining = Math.max(0, payable - termPaidAmt);
                  const fillAmount = remaining > 0 ? String(remaining) : String(payable);
                  setForm(f => ({
                    ...f, termId: tid, contractId: cid,
                    supplierId: String(contract.supplierId),
                    supplierName: contract.supplier?.name || '',
                    amount: fillAmount, netAmount: fillAmount,
                    warehouse: whName, department: deptName,
                    summary: `工程 ${contract.project?.code || ''} ${contract.contractNo} ${term.termName || `第${term.termNo}期`}`,
                  }));
                }
              }} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">一般工程付款（不連結期數）</option>
                {contracts.map(c =>
                  (c.terms || []).filter(t => {
                    const paid = paymentOrders
                      .filter(po => po.sourceRecordId === t.id && po.status === '已執行')
                      .reduce((s, po) => s + getActualPaid(po), 0);
                    const payable = Number(t.amount) - Number(t.retentionAmount || 0);
                    return paid < payable;
                  }).map(t => {
                    const paidAmt = paymentOrders
                      .filter(po => po.sourceRecordId === t.id && po.status === '已執行')
                      .reduce((s, po) => s + getActualPaid(po), 0);
                    const pendingAmt = paymentOrders
                      .filter(po => po.sourceRecordId === t.id && po.status === '待出納')
                      .reduce((s, po) => s + Number(po.amount || 0), 0);
                    const payable = Number(t.amount) - Number(t.retentionAmount || 0);
                    const remaining = payable - paidAmt;
                    const retLabel = t.retentionAmount > 0 ? ` 實付${formatNum(payable)}` : '';
                    return (
                      <option key={t.id} value={`${t.id}-${c.id}`}>
                        {c.project?.code} {c.contractNo} － {t.termName || `第${t.termNo}期`} 請款{formatNum(t.amount)}{retLabel}
                        {paidAmt > 0 ? ` (已付${formatNum(paidAmt)}, 餘${formatNum(remaining)})` : ''}
                        {pendingAmt > 0 ? ` [待出納${formatNum(pendingAmt)}]` : ''}
                      </option>
                    );
                  })
                ).flat()}
              </select>
            </div>
          )}

          {/* 期款付款狀態摘要 */}
          {!editingOrder && form.termId && (() => {
            const selContract = contracts.find(c => c.id === Number(form.contractId));
            const selTerm = selContract?.terms?.find(t => t.id === Number(form.termId));
            if (!selTerm) return null;
            const selPaidPOs = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '已執行');
            const selPaidAmt = selPaidPOs.reduce((s, po) => s + getActualPaid(po), 0);
            const selPendingAmt = paymentOrders
              .filter(po => po.sourceRecordId === selTerm.id && po.status === '待出納')
              .reduce((s, po) => s + Number(po.amount || 0), 0);
            const selRemaining = Number(selTerm.amount) - selPaidAmt;
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between font-medium">
                  <span>期款金額：{formatNum(selTerm.amount)}</span>
                  <span className={selRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>
                    剩餘應付：{formatNum(Math.max(0, selRemaining))}
                  </span>
                </div>
                {selPaidAmt > 0 && <div className="text-green-700">已付款合計：{formatNum(selPaidAmt)}（{selPaidPOs.length} 筆）</div>}
                {selPendingAmt > 0 && <div className="text-orange-600">待出納合計：{formatNum(selPendingAmt)}</div>}
                {selPaidPOs.map((po, i) => (
                  <div key={i} className="text-gray-500 pl-2">
                    • {po.paymentNo} {po.dueDate || ''} {formatNum(getActualPaid(po))} {po.paymentMethod || ''}
                  </div>
                ))}
              </div>
            );
          })()}

          {(form.warehouse || form.department) && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
              館別：{form.warehouse || '—'} {form.department ? `／ 部門：${form.department}` : ''}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="po-supplier" className="block text-xs text-gray-500 mb-1">廠商</label>
              <input id="po-supplier" value={form.supplierName}
                onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="po-netAmount" className="block text-xs text-gray-500 mb-1">應付金額</label>
              <input id="po-netAmount" type="number" value={form.netAmount}
                onChange={e => setForm(f => ({ ...f, netAmount: e.target.value, amount: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" />
            </div>
          </div>

          <div>
            <label htmlFor="po-summary" className="block text-xs text-gray-500 mb-1">摘要</label>
            <input id="po-summary" value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：工程案 XXX 第N期款" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="po-method" className="block text-xs text-gray-500 mb-1">付款方式</label>
              <select id="po-method" value={form.paymentMethod}
                onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-account" className="block text-xs text-gray-500 mb-1">資金帳戶</label>
              <select id="po-account" value={form.accountId}
                onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">請選擇</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="po-dueDate" className="block text-xs text-gray-500 mb-1">預計付款日</label>
            <input id="po-dueDate" type="date" value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label htmlFor="po-note" className="block text-xs text-gray-500 mb-1">備註</label>
            <input id="po-note" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* 領用材料 */}
          {(() => {
            const selContract = form.contractId ? contracts.find(c => c.id === Number(form.contractId)) : null;
            const contractMats = selContract?.materials || [];
            if (contractMats.length === 0 && form.materials.length === 0) return null;
            return (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs text-gray-500">領用材料</label>
                  {contractMats.length > 0 && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, materials: [...f.materials, { materialId: '', quantity: '', note: '' }] }))}
                      className="text-amber-600 text-xs hover:underline">＋ 新增領用</button>
                  )}
                </div>
                {contractMats.length === 0 && <div className="text-xs text-gray-400 mb-1">此合約尚無材料可領用</div>}
                {form.materials.length > 0 && (
                  <div className="space-y-2">
                    {form.materials.map((mat, mi) => {
                      const selMat = contractMats.find(cm => cm.id === Number(mat.materialId));
                      return (
                        <div key={mi} className="border rounded-lg p-2 bg-gray-50">
                          <div className="grid grid-cols-12 gap-2 mb-1">
                            <div className="col-span-7">
                              <select value={mat.materialId} onChange={e => {
                                const ms = [...form.materials];
                                const cm = contractMats.find(c => c.id === Number(e.target.value));
                                ms[mi] = { ...ms[mi], materialId: e.target.value, quantity: cm ? String(cm.quantity) : '' };
                                setForm(f => ({ ...f, materials: ms }));
                              }} className="w-full border rounded px-2 py-1 text-xs">
                                <option value="">選擇材料</option>
                                {contractMats.map(cm => (
                                  <option key={cm.id} value={cm.id}>
                                    {cm.description} （數量{cm.quantity}，單價{cm.unitPrice}）
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-3">
                              <input placeholder="領用數量" type="number" value={mat.quantity}
                                onChange={e => { const ms = [...form.materials]; ms[mi] = { ...ms[mi], quantity: e.target.value }; setForm(f => ({ ...f, materials: ms })); }}
                                className="w-full border rounded px-2 py-1 text-xs" step="any" min="0"
                                max={selMat ? selMat.quantity : undefined} />
                            </div>
                            <div className="col-span-2 flex items-center justify-end">
                              <button type="button"
                                onClick={() => setForm(f => ({ ...f, materials: f.materials.filter((_, i) => i !== mi) }))}
                                className="text-red-500 text-xs hover:underline">移除</button>
                            </div>
                          </div>
                          {selMat && (
                            <div className="text-xs text-gray-500">
                              單價 {selMat.unitPrice} × {mat.quantity || 0} = {((parseFloat(mat.quantity) || 0) * selMat.unitPrice).toLocaleString()}
                            </div>
                          )}
                          <input placeholder="備註" value={mat.note || ''}
                            onChange={e => { const ms = [...form.materials]; ms[mi] = { ...ms[mi], note: e.target.value }; setForm(f => ({ ...f, materials: ms })); }}
                            className="w-full border rounded px-2 py-1 text-xs mt-1" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm" disabled={saving}>取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? '儲存中…' : (editingOrder ? '儲存' : '儲存並送交出納')}
          </button>
        </div>
      </div>
    </div>
  );
}
