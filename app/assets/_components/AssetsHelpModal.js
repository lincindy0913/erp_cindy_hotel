'use client';

export function AssetsHelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[70] py-6 px-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-base font-bold text-gray-800">資產管理說明</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-5 text-sm">
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">1. 「物業」vs「資產」是什麼差別？</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
              <p><span className="font-medium text-teal-700">物業（RentalProperty）</span>→ 出租管理角度：租客、合約、收款、稅款</p>
              <p><span className="font-medium text-blue-700">資產（Asset）</span>→ 財務管理角度：取得日、面積、類型、稅務旗標（房屋稅／地價稅）</p>
              <p className="pt-1 text-gray-500">兩者可以綁定（1 對 1），綁定後：名稱、地址以資產端為主；房屋稅旗標影響稅款管理分類。</p>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">2. 為什麼要綁定？</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
              <p><span className="text-gray-400">不綁定：</span>物業和資產各自獨立，無法交叉核對。</p>
              <p className="pt-1"><span className="font-medium">綁定後：</span></p>
              <ul className="ml-3 space-y-0.5 text-gray-600 list-disc list-inside">
                <li>資產頁看到租客、月租金、收款狀態</li>
                <li>物業頁看到資產類型、面積、取得日</li>
                <li>稅款自動對應（房屋稅 / 地價稅旗標）</li>
              </ul>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">3. 「公益出租人」影響什麼？</h4>
            <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-800 space-y-1">
              <p>公益出租人認定 → 租金申報金額不同（優惠稅率）。</p>
              <p>打勾後：</p>
              <ul className="ml-3 space-y-0.5 list-disc list-inside">
                <li>物業清單顯示「公益出租人」標記</li>
                <li>CSV 匯出包含申請人、起迄日、公益月租金</li>
              </ul>
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-gray-800 mb-2">4. 表格欄位定義</h4>
            <div className="rounded-lg border overflow-hidden text-xs">
              <table className="w-full">
                <tbody>
                  {[
                    ['月租金', '當前有效合約的合約金額（唯讀，在租屋→合約管理修改）'],
                    ['本月收款', '當月實際收款狀態（待收 / 已收 / 逾期）'],
                    ['租金+水電實收', '本年度累計實際入帳（含水電費），不含未收款'],
                    ['淨利', '租金+水電實收 − 房屋稅 − 地價稅 − 維護費'],
                  ].map(([col, desc]) => (
                    <tr key={col} className="border-t first:border-t-0">
                      <td className="px-3 py-2 font-medium text-gray-800 bg-gray-50 whitespace-nowrap w-32">{col}</td>
                      <td className="px-3 py-2 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200 text-gray-700">關閉</button>
        </div>
      </div>
    </div>
  );
}
