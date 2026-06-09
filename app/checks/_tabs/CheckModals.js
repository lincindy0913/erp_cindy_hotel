'use client';

import { formatNum } from '@/lib/format-utils';
import { Modal } from './shared';

// ---- Check add/edit form ----
function CheckForm({
  isEdit,
  addForm, setAddForm,
  accounts, suppliers,
  checkSaving,
  handleAdd, handleUpdate,
  setShowAddModal, setShowEditModal,
  resetAddForm, setCheckSaving,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="f" className="block text-base font-medium text-gray-700 mb-1">支票類型 *</label>
          <select id="f" value={addForm.checkType} onChange={e => setAddForm(f => ({ ...f, checkType: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" disabled={isEdit}>
            <option value="payable">應付支票</option>
            <option value="receivable">應收支票</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-2" className="block text-base font-medium text-gray-700 mb-1">支票號碼 *</label>
          <input id="f-2" type="text" value={addForm.checkNumber}
            onChange={e => setAddForm(f => ({ ...f, checkNumber: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="輸入支票號碼" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="f-3" className="block text-base font-medium text-gray-700 mb-1">金額 *</label>
          <input id="f-3" type="number" value={addForm.amount}
            onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="0" />
        </div>
        <div>
          <label htmlFor="f-4" className="block text-base font-medium text-gray-700 mb-1">到期日 *</label>
          <input id="f-4" type="date" value={addForm.dueDate}
            onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="f-5" className="block text-base font-medium text-gray-700 mb-1">開票日</label>
          <input id="f-5" type="date" value={addForm.issueDate}
            onChange={e => setAddForm(f => ({ ...f, issueDate: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
        </div>
        <div>
          <label htmlFor="f-6" className="block text-base font-medium text-gray-700 mb-1">館別</label>
          <select id="f-6" value={addForm.warehouse} onChange={e => setAddForm(f => ({ ...f, warehouse: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base">
            <option value="">全部</option>
            <option value="麗格">麗格</option>
            <option value="麗軒">麗軒</option>
            <option value="民宿">民宿</option>
          </select>
        </div>
      </div>
      {addForm.checkType === 'payable' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="f-7" className="block text-base font-medium text-gray-700 mb-1">來源帳戶 *</label>
            <select id="f-7" value={addForm.sourceAccountId}
              onChange={e => setAddForm(f => ({ ...f, sourceAccountId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base">
              <option value="">選擇帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.accountCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-26" className="block text-base font-medium text-gray-700 mb-1">收款人</label>
            <input id="f-26" type="text" value={addForm.payeeName}
              onChange={e => setAddForm(f => ({ ...f, payeeName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
          </div>
        </div>
      )}
      {addForm.checkType === 'receivable' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="f-8" className="block text-base font-medium text-gray-700 mb-1">目的帳戶 *</label>
            <select id="f-8" value={addForm.destinationAccountId}
              onChange={e => setAddForm(f => ({ ...f, destinationAccountId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base">
              <option value="">選擇帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.accountCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-27" className="block text-base font-medium text-gray-700 mb-1">開票人</label>
            <input id="f-27" type="text" value={addForm.drawerName}
              onChange={e => setAddForm(f => ({ ...f, drawerName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="f-23" className="block text-base font-medium text-gray-700 mb-1">供應商</label>
          <select id="f-23" value={addForm.supplierId}
            onChange={e => setAddForm(f => ({ ...f, supplierId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base">
            <option value="">無</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-28" className="block text-base font-medium text-gray-700 mb-1">銀行名稱</label>
          <input id="f-28" type="text" value={addForm.bankName}
            onChange={e => setAddForm(f => ({ ...f, bankName: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
        </div>
      </div>
      <div>
        <label htmlFor="f-24" className="block text-base font-medium text-gray-700 mb-1">備註</label>
        <textarea id="f-24" value={addForm.note} onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" rows={2} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={() => { isEdit ? setShowEditModal(false) : setShowAddModal(false); resetAddForm(); setCheckSaving(false); }}
          className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
        <button onClick={isEdit ? handleUpdate : handleAdd}
          disabled={checkSaving}
          className={`px-4 py-2 text-base rounded-lg ${checkSaving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
          {checkSaving ? '儲存中…' : (isEdit ? '更新' : '新增')}
        </button>
      </div>
    </div>
  );
}

export default function CheckModals({
  // Add
  showAddModal, setShowAddModal,
  // Edit
  showEditModal, setShowEditModal,
  // Clear
  showClearModal, setShowClearModal,
  // Bounce
  showBounceModal, setShowBounceModal,
  // Void
  showVoidModal, setShowVoidModal,
  // Batch clear
  showBatchClearModal, setShowBatchClearModal,
  selectedIds, batchClearDate, setBatchClearDate,
  handleBatchClear,
  // Selected check
  selectedCheck, setSelectedCheck,
  // Forms
  addForm, setAddForm,
  clearForm, setClearForm,
  actionReason, setActionReason,
  // Saving states
  checkSaving, setCheckSaving,
  clearSaving,
  // Handlers
  handleAdd, handleUpdate,
  handleClear, handleBounce, handleVoid,
  resetAddForm,
  // Shared data
  accounts, suppliers,
}) {
  return (
    <>
      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); resetAddForm(); }}
        title={`新增${addForm.checkType === 'payable' ? '應付' : '應收'}支票`}>
        <CheckForm isEdit={false}
          addForm={addForm} setAddForm={setAddForm}
          accounts={accounts} suppliers={suppliers}
          checkSaving={checkSaving}
          handleAdd={handleAdd} handleUpdate={handleUpdate}
          setShowAddModal={setShowAddModal} setShowEditModal={setShowEditModal}
          resetAddForm={resetAddForm} setCheckSaving={setCheckSaving} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); resetAddForm(); setSelectedCheck(null); }}
        title="編輯支票">
        <CheckForm isEdit={true}
          addForm={addForm} setAddForm={setAddForm}
          accounts={accounts} suppliers={suppliers}
          checkSaving={checkSaving}
          handleAdd={handleAdd} handleUpdate={handleUpdate}
          setShowAddModal={setShowAddModal} setShowEditModal={setShowEditModal}
          resetAddForm={resetAddForm} setCheckSaving={setCheckSaving} />
      </Modal>

      {/* Clear Modal */}
      <Modal isOpen={showClearModal} onClose={() => { setShowClearModal(false); setSelectedCheck(null); }}
        title="兌現支票">
        {selectedCheck && (
          <div className="space-y-4">
            {selectedCheck.paymentId ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
                ℹ 此支票來自出納付款單，現金流已在出納執行時建立。兌現後<strong>不會重複建立現金流交易</strong>，僅更新支票狀態。
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">
                ✓ 兌現後系統將自動建立現金流交易（{selectedCheck.checkType === 'payable' ? '支出' : '收入'}）。請勿在現金流模組手動重複記帳。
              </div>
            )}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 text-base">
                <div>支票號碼: <span className="font-mono font-medium">{selectedCheck.checkNumber}</span></div>
                <div>類型: {selectedCheck.checkType === 'payable' ? '應付' : '應收'}</div>
                <div>金額: <span className="font-bold">${formatNum(selectedCheck.amount)}</span></div>
                <div>到期日: {selectedCheck.dueDate}</div>
              </div>
            </div>
            <div>
              <label htmlFor="f-13" className="block text-base font-medium text-gray-700 mb-1">兌現日期</label>
              <input id="f-13" type="date" value={clearForm.clearDate}
                onChange={e => setClearForm(f => ({ ...f, clearDate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
            </div>
            <div>
              <label htmlFor="f-14" className="block text-base font-medium text-gray-700 mb-1">實際金額</label>
              <input id="f-14" type="number" value={clearForm.actualAmount}
                onChange={e => setClearForm(f => ({ ...f, actualAmount: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
            </div>
            <div>
              <label htmlFor="f-15" className="block text-base font-medium text-gray-700 mb-1">兌現人</label>
              <input id="f-15" type="text" value={clearForm.clearedBy}
                onChange={e => setClearForm(f => ({ ...f, clearedBy: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" placeholder="選填" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowClearModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleClear} disabled={clearSaving}
                className={`px-4 py-2 text-base rounded-lg ${clearSaving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {clearSaving ? '儲存中…' : '確認兌現'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bounce Modal */}
      <Modal isOpen={showBounceModal} onClose={() => { setShowBounceModal(false); setSelectedCheck(null); }}
        title="退票處理">
        {selectedCheck && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="text-base text-red-700">
                確定要將支票 <span className="font-mono font-bold">{selectedCheck.checkNumber}</span> 標記為退票？
                {selectedCheck.status === 'cleared' && (
                  <span className="block mt-1 text-red-600 font-medium">此支票已兌現，退票將產生沖回交易</span>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="f-16" className="block text-base font-medium text-gray-700 mb-1">退票原因</label>
              <textarea id="f-16" value={actionReason} onChange={e => setActionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" rows={3}
                placeholder="輸入退票原因..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowBounceModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleBounce}
                className="px-4 py-2 text-base bg-red-600 text-white rounded-lg hover:bg-red-700">確認退票</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Batch Clear Modal */}
      <Modal isOpen={showBatchClearModal} onClose={() => setShowBatchClearModal(false)} title="批次兌現">
        <div className="space-y-4">
          <p className="text-base text-gray-600">已選擇 <strong>{selectedIds.length}</strong> 張支票，請填寫兌現日後存檔，所有勾選的支票將一併記錄該兌現日。</p>
          <div>
            <label className="block text-base font-medium text-gray-700 mb-1">兌現日 <span className="text-red-500">*</span></label>
            <input type="date" value={batchClearDate} onChange={e => setBatchClearDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBatchClearModal(false)}
              className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
            <button onClick={handleBatchClear}
              className="px-4 py-2 text-base bg-green-600 text-white rounded-lg hover:bg-green-700">存檔</button>
          </div>
        </div>
      </Modal>

      {/* Void Modal */}
      <Modal isOpen={showVoidModal} onClose={() => { setShowVoidModal(false); setSelectedCheck(null); }}
        title="作廢支票">
        {selectedCheck && (
          <div className="space-y-4">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="text-base text-gray-700">
                確定要將支票 <span className="font-mono font-bold">{selectedCheck.checkNumber}</span> 作廢？
              </div>
            </div>
            <div>
              <label htmlFor="f-17" className="block text-base font-medium text-gray-700 mb-1">作廢原因</label>
              <textarea id="f-17" value={actionReason} onChange={e => setActionReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" rows={3}
                placeholder="輸入作廢原因..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowVoidModal(false); setSelectedCheck(null); }}
                className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={handleVoid}
                className="px-4 py-2 text-base bg-gray-700 text-white rounded-lg hover:bg-gray-800">確認作廢</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
