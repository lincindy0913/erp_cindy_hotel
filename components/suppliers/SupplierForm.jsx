'use client';
import Link from 'next/link';

export default function SupplierForm({
  formData, setFormData,
  editingSupplier, supplierSaving,
  paymentTermsOptions,
  contracts, uploadingContract,
  handleUploadContract, handleDeleteContract,
  formatFileSize,
  onSubmit, onCancel,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-semibold mb-4">{editingSupplier ? '編輯廠商' : '新增廠商'}</h3>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sf-name" className="block text-sm font-medium text-gray-700 mb-1">廠商名稱 *</label>
          <input id="sf-name" type="text" required value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="sf-taxid" className="block text-sm font-medium text-gray-700 mb-1">統一編號 *</label>
          <input id="sf-taxid" type="text" required value={formData.taxId}
            onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="sf-contact" className="block text-sm font-medium text-gray-700 mb-1">聯絡人 *</label>
          <input id="sf-contact" type="text" required value={formData.contact}
            onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="sf-pic" className="block text-sm font-medium text-gray-700 mb-1">負責人 *</label>
          <input id="sf-pic" type="text" required value={formData.personInCharge}
            onChange={(e) => setFormData({ ...formData, personInCharge: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：王經理" />
        </div>
        <div>
          <label htmlFor="sf-phone" className="block text-sm font-medium text-gray-700 mb-1">聯絡電話 *</label>
          <input id="sf-phone" type="text" required value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：02-1234-5678" />
        </div>
        <div>
          <label htmlFor="sf-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="sf-email" type="email" value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：contact@example.com" />
        </div>
        <div className="col-span-2">
          <label htmlFor="sf-addr" className="block text-sm font-medium text-gray-700 mb-1">地址</label>
          <input id="sf-addr" type="text" value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：台北市信義區信義路五段7號" />
        </div>
        <div>
          <label htmlFor="sf-pt" className="block text-sm font-medium text-gray-700 mb-1">
            付款條件（<Link href="/settings#finance" className="text-blue-600 hover:underline text-xs">設定</Link>）
          </label>
          <select id="sf-pt" value={formData.paymentTerms}
            onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            {paymentTermsOptions.map(term => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sf-ps" className="block text-sm font-medium text-gray-700 mb-1">付款狀態</label>
          <select id="sf-ps" value={formData.paymentStatus}
            onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="未付款">未付款</option>
            <option value="已付款">已付款</option>
            <option value="部分付款">部分付款</option>
          </select>
        </div>
        <div>
          <label htmlFor="sf-cd" className="block text-sm font-medium text-gray-700 mb-1">合約日期</label>
          <input id="sf-cd" type="date" value={formData.contractDate}
            onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="sf-ced" className="block text-sm font-medium text-gray-700 mb-1">合約到期日期</label>
          <input id="sf-ced" type="date" value={formData.contractEndDate}
            onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 合約檔案 */}
        <div className="col-span-2 border-t border-gray-200 pt-4 mt-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">合約檔案</label>
          {editingSupplier ? (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer ${
                  uploadingContract ? 'bg-gray-300 text-gray-500' : 'bg-green-600 text-white hover:bg-green-700'
                }`}>
                  <span>{uploadingContract ? '上傳中...' : '+ 上傳合約'}</span>
                  <input type="file" className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                    onChange={handleUploadContract} disabled={uploadingContract} />
                </label>
                <span className="text-xs text-gray-500">支援 PDF、Word、Excel、圖片，上限 10MB</span>
              </div>
              {contracts.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">檔案名稱</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">大小</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">上傳日期</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {contracts.map((contract) => (
                        <tr key={contract.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs">
                            <a href={`/api/suppliers/${editingSupplier.id}/contracts/${contract.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline" title={contract.fileName}>
                              {contract.fileName}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{formatFileSize(contract.fileSize)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {new Date(contract.uploadDate).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div className="flex gap-2">
                              <a href={`/api/suppliers/${editingSupplier.id}/contracts/${contract.id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 hover:underline">下載</a>
                              <button type="button" onClick={() => handleDeleteContract(contract.id)}
                                className="text-red-600 hover:underline">刪除</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-2">尚無合約檔案</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 py-2">請先儲存廠商資料後，再編輯此廠商即可上傳合約</p>
          )}
        </div>

        <div>
          <label htmlFor="sf-cp" className="block text-sm font-medium text-gray-700 mb-1">支票抬頭</label>
          <input id="sf-cp" type="text" value={formData.checkPayee}
            onChange={(e) => setFormData({ ...formData, checkPayee: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：統一企業股份有限公司" />
        </div>
        <div>
          <label htmlFor="sf-ic" className="block text-sm font-medium text-gray-700 mb-1">行業類別</label>
          <input id="sf-ic" type="text" value={formData.industryCategory}
            onChange={(e) => setFormData({ ...formData, industryCategory: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例如：食品、水電、工程" />
        </div>
        <div>
          <label htmlFor="sf-so" className="block text-sm font-medium text-gray-700 mb-1">顯示順序</label>
          <input id="sf-so" type="number" min="0" value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="數字越小越前面" />
        </div>
        <div className="col-span-2">
          <label htmlFor="sf-remarks" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
          <textarea id="sf-remarks" value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3" placeholder="輸入備註事項..." />
        </div>

        {/* 廠商評價與黑名單 */}
        <div className="col-span-2 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">廠商評價</label>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(star => (
                  <button key={star} type="button"
                    onClick={() => setFormData(f => ({ ...f, rating: f.rating === star ? null : star }))}
                    className={`text-2xl leading-none ${(formData.rating ?? 0) >= star ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400 transition-colors`}>
                    ★
                  </button>
                ))}
                {formData.rating && (
                  <button type="button" onClick={() => setFormData(f => ({ ...f, rating: null }))}
                    className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline">清除</button>
                )}
                {formData.rating && <span className="ml-2 text-xs text-gray-500">{formData.rating} 星</span>}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2 cursor-pointer select-none">
                <input type="checkbox" checked={!!formData.isBlacklisted}
                  onChange={(e) => setFormData(f => ({
                    ...f,
                    isBlacklisted: e.target.checked,
                    blacklistedAt: e.target.checked ? (f.blacklistedAt || new Date().toISOString()) : null,
                  }))}
                  className="w-4 h-4 accent-red-600" />
                <span className="text-red-600 font-semibold">列入黑名單</span>
              </label>
              {formData.isBlacklisted && (
                <textarea value={formData.blacklistReason}
                  onChange={(e) => setFormData(f => ({ ...f, blacklistReason: e.target.value }))}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  rows="2" placeholder="說明原因（延遲交貨、品質問題、詐欺…）" />
              )}
            </div>
          </div>
        </div>

        <div className="col-span-2 flex justify-end gap-3">
          <button type="button" onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={supplierSaving}>
            取消
          </button>
          <button type="submit" disabled={supplierSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {supplierSaving ? '儲存中…' : (editingSupplier ? '更新' : '儲存')}
          </button>
        </div>
      </form>
    </div>
  );
}
