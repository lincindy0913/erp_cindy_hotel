'use client';

import { formatNum } from '@/lib/format-utils';
import { Modal } from './shared';

export default function PrintModals({
  // Print sheet modal
  showPrintSheetModal, setShowPrintSheetModal,
  printWarehouse, setPrintWarehouse,
  checksForPrintSheet,
  getPayeeName,
  // Print by PO modal
  showPrintByPOModal, setShowPrintByPOModal,
  // Print by Purchase modal
  showPrintByPurchaseModal, setShowPrintByPurchaseModal,
  // Shared search state
  printSearchWarehouse, setPrintSearchWarehouse,
  printSearchDateFrom, setPrintSearchDateFrom,
  printSearchDateTo, setPrintSearchDateTo,
  printSearchResults,
  printSearchLoading,
  handlePrintSearch,
  resetPrintSearch,
}) {
  const printDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const PrintSearchForm = ({ source, btnClass }) => (
    <div className="flex flex-wrap items-end gap-3 bg-gray-50 p-4 rounded-lg">
      <div>
        <label className="block text-sm text-gray-500 mb-1">館別 <span className="text-red-500">*</span></label>
        <select value={printSearchWarehouse} onChange={e => setPrintSearchWarehouse(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-base min-w-[120px]">
          <option value="">請選擇</option>
          <option value="麗格">麗格</option>
          <option value="麗軒">麗軒</option>
          <option value="民宿">民宿</option>
        </select>
      </div>
      <div>
        <label htmlFor={`ps-from-${source}`} className="block text-sm text-gray-500 mb-1">日期起</label>
        <input id={`ps-from-${source}`} type="date" value={printSearchDateFrom} onChange={e => setPrintSearchDateFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-base" />
      </div>
      <div>
        <label htmlFor={`ps-to-${source}`} className="block text-sm text-gray-500 mb-1">日期迄</label>
        <input id={`ps-to-${source}`} type="date" value={printSearchDateTo} onChange={e => setPrintSearchDateTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-base" />
      </div>
      <button onClick={() => handlePrintSearch(source)} disabled={printSearchLoading}
        className={`px-4 py-1.5 text-base text-white rounded-lg disabled:opacity-50 ${btnClass}`}>
        {printSearchLoading ? '查詢中...' : '查詢'}
      </button>
    </div>
  );

  const PrintSearchTable = ({ results }) => (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-base">
        <thead className="sticky top-0 z-10 bg-gray-100">
          <tr className="bg-gray-100">
            <th className="px-3 py-2 text-left border-b border-gray-200 w-12">序號</th>
            <th className="px-3 py-2 text-left border-b border-gray-200">支票號碼</th>
            <th className="px-3 py-2 text-left border-b border-gray-200">受款人／廠商</th>
            <th className="px-3 py-2 text-right border-b border-gray-200">金額</th>
            <th className="px-3 py-2 text-left border-b border-gray-200">開票日</th>
            <th className="px-3 py-2 text-left border-b border-gray-200">到期日</th>
            <th className="px-3 py-2 text-left border-b border-gray-200 min-w-[120px]">簽收欄（簽名）</th>
          </tr>
        </thead>
        <tbody>
          {results.map((c, idx) => (
            <tr key={c.id} className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
              <td className="px-3 py-2 font-mono">{c.checkNumber}</td>
              <td className="px-3 py-2">{getPayeeName(c)}</td>
              <td className="px-3 py-2 text-right font-medium">${formatNum(c.amount)}</td>
              <td className="px-3 py-2">{c.issueDate || '－'}</td>
              <td className="px-3 py-2">{c.dueDate || '－'}</td>
              <td className="px-3 py-2 align-top" style={{ minHeight: 32 }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const PrintTableForPrint = ({ results, title, subtitle }) => (
    <table className="w-full text-base border border-gray-300">
      <thead>
        <tr className="bg-gray-100">
          <th className="px-3 py-2 text-left border border-gray-300 w-12">序號</th>
          <th className="px-3 py-2 text-left border border-gray-300">支票號碼</th>
          <th className="px-3 py-2 text-left border border-gray-300">受款人／廠商</th>
          <th className="px-3 py-2 text-right border border-gray-300">金額</th>
          <th className="px-3 py-2 text-left border border-gray-300">開票日</th>
          <th className="px-3 py-2 text-left border border-gray-300">到期日</th>
          <th className="px-3 py-2 text-left border border-gray-300 min-w-[120px]">簽收欄（簽名）</th>
        </tr>
      </thead>
      <tbody>
        {results.map((c, idx) => (
          <tr key={c.id}>
            <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
            <td className="px-3 py-2 border border-gray-300 font-mono">{c.checkNumber}</td>
            <td className="px-3 py-2 border border-gray-300">{getPayeeName(c)}</td>
            <td className="px-3 py-2 border border-gray-300 text-right font-medium">${formatNum(c.amount)}</td>
            <td className="px-3 py-2 border border-gray-300">{c.issueDate || '－'}</td>
            <td className="px-3 py-2 border border-gray-300">{c.dueDate || '－'}</td>
            <td className="px-3 py-2 border border-gray-300" style={{ minHeight: 36 }}>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {/* 支票列印表（領取簽名）Modal */}
      <Modal isOpen={showPrintSheetModal} onClose={() => { setShowPrintSheetModal(false); setPrintWarehouse(''); }} title="支票領取簽名表" width="max-w-4xl">
        <div className="space-y-4 no-print">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-base text-gray-500">列印日期：{printDate}</p>
            <div className="flex items-center gap-2">
              <label htmlFor="f-18" className="text-base font-medium text-gray-700">館別：</label>
              <select id="f-18" value={printWarehouse} onChange={e => setPrintWarehouse(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-base min-w-[120px]">
                <option value="">全部</option>
                <option value="麗格">麗格</option>
                <option value="麗軒">麗軒</option>
                <option value="民宿">民宿</option>
              </select>
            </div>
          </div>
          <p className="text-base text-gray-600">以下為應付且待兌現／到期之支票{printWarehouse ? `（${printWarehouse}）` : ''}，共 {checksForPrintSheet.length} 張。廠商領取時請於簽收欄簽名。</p>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-base">
              <thead className="sticky top-0 z-10 bg-gray-100">
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left border-b border-gray-200 w-12">序號</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">支票號碼</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">受款人／廠商</th>
                  <th className="px-3 py-2 text-right border-b border-gray-200">金額</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">開票日</th>
                  <th className="px-3 py-2 text-left border-b border-gray-200">到期日</th>
                  {!printWarehouse && <th className="px-3 py-2 text-left border-b border-gray-200">館別</th>}
                  <th className="px-3 py-2 text-left border-b border-gray-200 min-w-[120px]">簽收欄（簽名）</th>
                </tr>
              </thead>
              <tbody>
                {checksForPrintSheet.length === 0 ? (
                  <tr><td colSpan={printWarehouse ? 7 : 8} className="px-3 py-6 text-center text-gray-400">目前無待領取之應付支票</td></tr>
                ) : checksForPrintSheet.map((c, idx) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono">{c.checkNumber}</td>
                    <td className="px-3 py-2">{getPayeeName(c)}</td>
                    <td className="px-3 py-2 text-right font-medium">${formatNum(c.amount)}</td>
                    <td className="px-3 py-2">{c.issueDate || '－'}</td>
                    <td className="px-3 py-2">{c.dueDate || '－'}</td>
                    {!printWarehouse && <td className="px-3 py-2">{c.warehouse || '－'}</td>}
                    <td className="px-3 py-2 align-top" style={{ minHeight: 32 }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowPrintSheetModal(false)} className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
            <button type="button" onClick={() => window.print()} className="px-4 py-2 text-base bg-violet-600 text-white rounded-lg hover:bg-violet-700">列印</button>
          </div>
        </div>
      </Modal>

      {/* Print-only content for print sheet */}
      {showPrintSheetModal && (
        <div id="check-pickup-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">支票領取簽名表{printWarehouse ? `（${printWarehouse}）` : ''}</h1>
          <p className="text-base text-gray-500 mb-4">列印日期：{printDate}</p>
          <p className="text-base text-gray-600 mb-4">以下為應付且待兌現／到期之支票{printWarehouse ? `（${printWarehouse}）` : ''}，共 {checksForPrintSheet.length} 張。廠商領取時請於簽收欄簽名。</p>
          <table className="w-full text-base border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left border border-gray-300 w-12">序號</th>
                <th className="px-3 py-2 text-left border border-gray-300">支票號碼</th>
                <th className="px-3 py-2 text-left border border-gray-300">受款人／廠商</th>
                <th className="px-3 py-2 text-right border border-gray-300">金額</th>
                <th className="px-3 py-2 text-left border border-gray-300">開票日</th>
                <th className="px-3 py-2 text-left border border-gray-300">到期日</th>
                {!printWarehouse && <th className="px-3 py-2 text-left border border-gray-300">館別</th>}
                <th className="px-3 py-2 text-left border border-gray-300 min-w-[120px]">簽收欄（簽名）</th>
              </tr>
            </thead>
            <tbody>
              {checksForPrintSheet.length === 0 ? (
                <tr><td colSpan={printWarehouse ? 7 : 8} className="px-3 py-6 text-center text-gray-400 border border-gray-300">目前無待領取之應付支票</td></tr>
              ) : checksForPrintSheet.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 border border-gray-300 text-gray-600">{idx + 1}</td>
                  <td className="px-3 py-2 border border-gray-300 font-mono">{c.checkNumber}</td>
                  <td className="px-3 py-2 border border-gray-300">{getPayeeName(c)}</td>
                  <td className="px-3 py-2 border border-gray-300 text-right font-medium">${formatNum(c.amount)}</td>
                  <td className="px-3 py-2 border border-gray-300">{c.issueDate || '－'}</td>
                  <td className="px-3 py-2 border border-gray-300">{c.dueDate || '－'}</td>
                  {!printWarehouse && <td className="px-3 py-2 border border-gray-300">{c.warehouse || '－'}</td>}
                  <td className="px-3 py-2 border border-gray-300" style={{ minHeight: 36 }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 按付款單的館別列印 Modal */}
      <Modal isOpen={showPrintByPOModal} onClose={() => { setShowPrintByPOModal(false); resetPrintSearch(); }} title="按付款單的館別列印" width="max-w-4xl">
        <div className="space-y-4 no-print">
          <PrintSearchForm source="payment" btnClass="bg-indigo-600 hover:bg-indigo-700" />
          {printSearchResults.length > 0 && (
            <>
              <p className="text-base text-gray-600">查詢結果：共 {printSearchResults.length} 張支票（付款單館別：{printSearchWarehouse}）</p>
              <PrintSearchTable results={printSearchResults} />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowPrintByPOModal(false)} className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 text-base bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">列印</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Print-only content for PO modal */}
      {showPrintByPOModal && printSearchResults.length > 0 && (
        <div id="check-pickup-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">支票領取簽名表（付款單館別：{printSearchWarehouse}）</h1>
          <p className="text-base text-gray-500 mb-4">列印日期：{printDate}</p>
          <p className="text-base text-gray-600 mb-4">
            付款單館別：{printSearchWarehouse}
            {printSearchDateFrom && `　日期起：${printSearchDateFrom}`}
            {printSearchDateTo && `　日期迄：${printSearchDateTo}`}
            ，共 {printSearchResults.length} 張。廠商領取時請於簽收欄簽名。
          </p>
          <PrintTableForPrint results={printSearchResults} />
        </div>
      )}

      {/* 按進貨單的館別列印 Modal */}
      <Modal isOpen={showPrintByPurchaseModal} onClose={() => { setShowPrintByPurchaseModal(false); resetPrintSearch(); }} title="按進貨單的館別列印" width="max-w-4xl">
        <div className="space-y-4 no-print">
          <PrintSearchForm source="purchase" btnClass="bg-teal-600 hover:bg-teal-700" />
          {printSearchResults.length > 0 && (
            <>
              <p className="text-base text-gray-600">查詢結果：共 {printSearchResults.length} 張支票（進貨單館別：{printSearchWarehouse}）</p>
              <PrintSearchTable results={printSearchResults} />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowPrintByPurchaseModal(false)} className="px-4 py-2 text-base border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 text-base bg-teal-600 text-white rounded-lg hover:bg-teal-700">列印</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Print-only content for Purchase modal */}
      {showPrintByPurchaseModal && printSearchResults.length > 0 && (
        <div id="check-pickup-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">支票領取簽名表（進貨單館別：{printSearchWarehouse}）</h1>
          <p className="text-base text-gray-500 mb-4">列印日期：{printDate}</p>
          <p className="text-base text-gray-600 mb-4">
            進貨單館別：{printSearchWarehouse}
            {printSearchDateFrom && `　日期起：${printSearchDateFrom}`}
            {printSearchDateTo && `　日期迄：${printSearchDateTo}`}
            ，共 {printSearchResults.length} 張。廠商領取時請於簽收欄簽名。
          </p>
          <PrintTableForPrint results={printSearchResults} />
        </div>
      )}
    </>
  );
}
