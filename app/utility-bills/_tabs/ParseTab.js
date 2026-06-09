'use client';

export default function ParseTab({
  activeTab,
  meta,
  setMeta,
  startPage,
  setStartPage,
  pdfFile,
  setPdfFile,
  extractedText,
  loading,
  saving,
  ocrRecords,
  ocrValidation,
  formRecords,
  setFormRecords,
  setOcrRecords,
  setSummary,
  fileInputRef,
  handleFileChange,
  handleParse,
  handleOcrScan,
  generatePage1Summary,
  saveCurrentRecord,
  WAREHOUSE_OPTIONS,
}) {
  const isWater = activeTab === 'water';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">
        {isWater ? '水費單解析（從第二頁讀取，自動產出第一頁）' : '電費單解析（自動產出第一頁）'}
      </h3>
      <p className="text-sm text-gray-600">
        {isWater ? (
          <>上傳水費 PDF（如台水帳單），系統會<strong>從第二頁起</strong>讀取明細並自動辨識：<strong>用水地址、水號、用水量、基本費、水費、營業稅、其他費用、總金額</strong>，產出第一頁報表。<strong>館別、計費年月</strong>可依檔名或內容自動判讀（如檔名含「國股段」「113年10月」）。若 PDF 為掃描檔（無文字層）則無法辨識。</>
        ) : (
          <>只需上傳電費 PDF（如台電帳單），系統會讀取整份帳單並自動辨識：<strong>地址、電號、使用度數、電費金額、應繳稅額、應繳總金額</strong>，產出第一頁格式。<strong>館別、計費年月</strong>可依檔名或內容自動判讀（如檔名含「麗軒」「115年02月」）。若 PDF 為掃描檔（無文字層）則無法辨識。</>
        )}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
          <select id="f"
            value={meta.warehouse}
            onChange={e => setMeta(m => ({ ...m, warehouse: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {WAREHOUSE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">年度</label>
          <input id="f-11"
            type="text"
            value={meta.year}
            onChange={e => setMeta(m => ({ ...m, year: e.target.value }))}
            placeholder={isWater ? '113' : '115'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">月份</label>
          <input id="f-2"
            type="text"
            value={meta.month}
            onChange={e => setMeta(m => ({ ...m, month: e.target.value }))}
            placeholder="10"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">從第幾頁開始讀取</label>
          <input id="f-3"
            type="number"
            min={1}
            value={startPage}
            onChange={e => setStartPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500 mt-0.5">
            {isWater ? '水費建議從第 2 頁（明細）開始讀取' : '電費建議從第 1 頁（整份讀取）以自動辨識地址、電號等'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={e => handleFileChange(e, activeTab)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
        >
          選擇 PDF
        </button>
        {pdfFile && <span className="text-sm text-gray-600">{pdfFile.name}</span>}
        <button
          type="button"
          onClick={() => handleParse(activeTab)}
          disabled={!pdfFile || loading}
          className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 text-sm"
        >
          {loading ? '讀取中…' : '讀取 PDF'}
        </button>
        <button
          type="button"
          onClick={() => handleOcrScan(activeTab)}
          disabled={!pdfFile || loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          title="適用於掃描版 PDF（無文字層）"
        >
          {loading ? '掃描中…' : 'OCR 掃描'}
        </button>
        <button
          type="button"
          onClick={() => generatePage1Summary(activeTab)}
          disabled={!extractedText}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
        >
          產出第一頁格式
        </button>
      </div>

      {extractedText && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">擷取內容（第 {startPage} 頁起）</h4>
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap">{extractedText}</pre>
        </div>
      )}

      {/* Electricity OCR summary table */}
      {ocrRecords.length > 1 && !isWater && (
        <div className="border-t pt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            OCR 辨識結果 — 共 {ocrRecords.length} 筆電費單
          </h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-teal-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">電號</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">地址</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">計費期間</th>
                  <th className="px-3 py-2 text-center font-semibold text-teal-700 whitespace-nowrap bg-teal-100" colSpan={4}>使用度數（kWh）</th>
                  <th className="px-3 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50" colSpan={3}>應繳總金額（元）</th>
                </tr>
                <tr className="border-b border-gray-200">
                  <th colSpan={4} />
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">尖峰</th>
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">半尖峰</th>
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">離峰</th>
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-100 font-bold whitespace-nowrap">合計度數</th>
                  <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-50 whitespace-nowrap">電費金額</th>
                  <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-50 whitespace-nowrap">應繳稅額</th>
                  <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-100 font-bold whitespace-nowrap">應繳總金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocrRecords.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.電號}</td>
                    <td className="px-3 py-1.5 max-w-[160px] truncate" title={r.地址}>{r.地址}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.計費期間}</td>
                    <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.尖峰度數}</td>
                    <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.半尖峰度數}</td>
                    <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.離峰度數}</td>
                    <td className="px-3 py-1.5 text-right font-semibold bg-teal-100/60">{r.使用度數}</td>
                    <td className="px-3 py-1.5 text-right bg-emerald-50/40">{r.電費金額}</td>
                    <td className="px-3 py-1.5 text-right bg-emerald-50/40">{r.應繳稅額}</td>
                    <td className="px-3 py-1.5 text-right font-medium bg-emerald-100/60">{r.應繳總金額}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-gray-700">合計</td>
                  <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.尖峰度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.半尖峰度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.離峰度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.使用度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.電費金額) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.應繳稅額) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-emerald-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.應繳總金額) || 0), 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {ocrValidation && (
            <div className={`mt-3 p-3 rounded-lg text-xs border ${ocrValidation.passed ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
              <span className="font-semibold">{ocrValidation.passed ? '✓ 合計驗證通過' : '⚠ 合計驗證差異'}</span>
              {!ocrValidation.passed && (
                <span className="ml-2">
                  度數: {ocrValidation.computed.使用度數} (應為 {ocrValidation.expected.使用度數}) ／
                  電費: {ocrValidation.computed.電費金額} ／
                  稅額: {ocrValidation.computed.應繳稅額} ／
                  總計: {ocrValidation.computed.應繳總金額}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Water bill OCR summary table */}
      {ocrRecords.length > 1 && isWater && (
        <div className="border-t pt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            OCR 辨識結果 — 共 {ocrRecords.length} 筆水費單
          </h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-sky-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">水號</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">用水地址</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">繳費年月</th>
                  <th className="px-3 py-2 text-center font-semibold text-teal-700 whitespace-nowrap bg-teal-100" colSpan={2}>度數</th>
                  <th className="px-3 py-2 text-center font-semibold text-rose-700 whitespace-nowrap bg-rose-50" colSpan={3}>水費項目（元）</th>
                  <th className="px-3 py-2 text-center font-semibold text-amber-700 whitespace-nowrap bg-amber-50" colSpan={2}>稅/代徵（元）</th>
                  <th className="px-3 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap bg-emerald-100">總金額</th>
                </tr>
                <tr className="border-b border-gray-200">
                  <th colSpan={4} />
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">用水度數</th>
                  <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">實用度數</th>
                  <th className="px-3 py-1 text-right text-rose-700 bg-rose-50/60 whitespace-nowrap">基本費</th>
                  <th className="px-3 py-1 text-right text-rose-700 bg-rose-50/60 whitespace-nowrap">用水費</th>
                  <th className="px-3 py-1 text-right text-rose-700 bg-rose-100 font-bold whitespace-nowrap">小計</th>
                  <th className="px-3 py-1 text-right text-amber-700 bg-amber-50 whitespace-nowrap">營業稅</th>
                  <th className="px-3 py-1 text-right text-amber-700 bg-amber-50 whitespace-nowrap">代徵</th>
                  <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-100 font-bold whitespace-nowrap">代繳總金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocrRecords.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs">{r.水號}</td>
                    <td className="px-3 py-1.5 max-w-[140px] truncate" title={r.用水地址}>{r.用水地址}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.繳費年月}</td>
                    <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.用水度數}</td>
                    <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.本期實用度數}</td>
                    <td className="px-3 py-1.5 text-right bg-rose-50/40">{r.基本費}</td>
                    <td className="px-3 py-1.5 text-right bg-rose-50/40">{r.用水費}</td>
                    <td className="px-3 py-1.5 text-right font-semibold bg-rose-100/60">{r.水費項目小計}</td>
                    <td className="px-3 py-1.5 text-right bg-amber-50/40">{r.營業稅}</td>
                    <td className="px-3 py-1.5 text-right bg-amber-50/40">{r.代徵費用小計}</td>
                    <td className="px-3 py-1.5 text-right font-medium bg-emerald-100/60">{r.總金額}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-gray-700">合計</td>
                  <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.用水度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.本期實用度數) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{ocrRecords.reduce((s, r) => s + (parseFloat(r.基本費) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{ocrRecords.reduce((s, r) => s + (parseFloat(r.用水費) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-rose-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.水費項目小計) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.營業稅) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.代徵費用小計) || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-emerald-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.總金額) || 0), 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Water bill: one form per page */}
      {formRecords.length > 0 && isWater && (
        <div className="border-t pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-gray-700">水費單明細 — 共 {formRecords.length} 筆（每筆可手動修改）</h4>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-100 border border-sky-300 text-sky-800 text-xs font-semibold">
                館別：{meta.warehouse || '（請先選擇館別）'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setFormRecords([]); setOcrRecords([]); setPdfFile(null); setSummary(null); }}
                disabled={saving}
                className="px-4 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium"
              >
                取消帳單
              </button>
              <button
                type="button"
                onClick={() => saveCurrentRecord(activeTab)}
                disabled={saving || !meta.warehouse}
                className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium"
              >
                {saving ? '儲存中…' : `儲存全部 ${formRecords.length} 筆`}
              </button>
            </div>
          </div>
          {formRecords.map((rec, idx) => {
            const basicFields = ['類型', '繳費年月', '水號', '用水地址'];
            const usageFields = ['用水度數', '本期實用度數'];
            const feeFields = ['基本費', '用水費', '水費項目小計'];
            const taxFields = ['營業稅', '代徵費用小計', '水源保育與回饋費'];
            const totalFields = ['總金額'];
            const readOnlyFields = ['水費項目小計', '總金額'];

            const renderWaterField = (k) => (
              <div key={k} className="flex items-center gap-2">
                <label htmlFor={`water-field-${idx}-${k}`} className="font-medium text-gray-600 shrink-0 text-xs" style={{ width: k.length > 6 ? '7rem' : '5rem' }}>{k}</label>
                <input id={`water-field-${idx}-${k}`}
                  type="text"
                  value={rec[k] ?? ''}
                  readOnly={readOnlyFields.includes(k)}
                  onChange={e => {
                    const updated = formRecords.map((r, i) => {
                      if (i !== idx) return r;
                      const next = { ...r, [k]: e.target.value };
                      if (['基本費', '用水費'].includes(k)) {
                        const base = parseFloat(k === '基本費' ? e.target.value : r.基本費) || 0;
                        const usage = parseFloat(k === '用水費' ? e.target.value : r.用水費) || 0;
                        next.水費項目小計 = String(Math.round(base + usage));
                      }
                      const subtotal = parseInt(next.水費項目小計) || parseInt(rec.水費項目小計) || 0;
                      const agency = parseInt(k === '代徵費用小計' ? e.target.value : r.代徵費用小計) || 0;
                      if (['基本費', '用水費', '代徵費用小計'].includes(k)) {
                        const newSubtotal = ['基本費', '用水費'].includes(k)
                          ? Math.round((parseFloat(k === '基本費' ? e.target.value : r.基本費) || 0) + (parseFloat(k === '用水費' ? e.target.value : r.用水費) || 0))
                          : subtotal;
                        next.總金額 = String(newSubtotal + agency);
                        if (['基本費', '用水費'].includes(k)) next.水費項目小計 = String(newSubtotal);
                      }
                      return next;
                    });
                    setFormRecords(updated);
                  }}
                  className={`flex-1 border rounded px-2 py-1 text-xs ${
                    k === '總金額' ? 'bg-emerald-100 border-emerald-300 font-semibold text-emerald-800' :
                    k === '水費項目小計' ? 'bg-rose-50 border-rose-300 font-semibold text-rose-800' :
                    readOnlyFields.includes(k) ? 'bg-gray-100 border-gray-300' :
                    'border-gray-300 bg-white'
                  }`}
                />
              </div>
            );

            return (
              <div key={idx} className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-4">
                <h5 className="text-xs font-semibold text-sky-700">第 {idx + 1} 筆 — 水號：{rec.水號}</h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {basicFields.filter(k => k in rec).map(renderWaterField)}
                </div>

                <div className="border border-teal-300 rounded-lg overflow-hidden">
                  <div className="bg-teal-200 px-3 py-1.5">
                    <span className="text-xs font-bold text-teal-900">使用度數</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {usageFields.filter(k => k in rec).map(renderWaterField)}
                  </div>
                </div>

                <div className="border border-rose-300 rounded-lg overflow-hidden">
                  <div className="bg-rose-100 px-3 py-1.5">
                    <span className="text-xs font-bold text-rose-900">水費項目小計（元）</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {feeFields.filter(k => k in rec).map(renderWaterField)}
                  </div>
                </div>

                <div className="border border-amber-300 rounded-lg overflow-hidden">
                  <div className="bg-amber-100 px-3 py-1.5">
                    <span className="text-xs font-bold text-amber-900">稅額 / 代徵費用（元）</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {taxFields.filter(k => k in rec).map(renderWaterField)}
                  </div>
                </div>

                <div className="border border-emerald-300 rounded-lg overflow-hidden">
                  <div className="bg-emerald-100 px-3 py-1.5">
                    <span className="text-xs font-bold text-emerald-900">代繳（代收）總金額（元）</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {totalFields.filter(k => k in rec).map(renderWaterField)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Electricity bill: one form per page */}
      {formRecords.length > 0 && !isWater && (
        <div className="border-t pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-semibold text-gray-700">電費單明細 — 共 {formRecords.length} 筆（每筆可手動修改）</h4>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold">
                館別：{meta.warehouse || '（請先選擇館別）'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setFormRecords([]); setOcrRecords([]); setPdfFile(null); setSummary(null); }}
                disabled={saving}
                className="px-4 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium"
              >
                取消帳單
              </button>
              <button
                type="button"
                onClick={() => saveCurrentRecord(activeTab)}
                disabled={saving || !meta.warehouse}
                className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium"
              >
                {saving ? '儲存中…' : `儲存全部 ${formRecords.length} 筆`}
              </button>
            </div>
          </div>
          {formRecords.map((rec, idx) => {
            const basicFields = ['類型', '繳費期限', '地址', '電號'];
            const degreeFields = ['尖峰度數', '半尖峰度數', '離峰度數', '使用度數'];
            const amountFields = ['電費金額', '應繳稅額', '應繳總金額'];
            const renderField = (k) => (
              <div key={k} className="flex items-center gap-2">
                <label className="font-medium text-gray-600 w-24 shrink-0 text-xs">{k}</label>
                <input
                  type="text"
                  value={rec[k] ?? ''}
                  readOnly={k === '應繳總金額' || k === '使用度數'}
                  onChange={e => {
                    const updated = formRecords.map((r, i) => {
                      if (i !== idx) return r;
                      const next = { ...r, [k]: e.target.value };
                      if (k === '電費金額' || k === '應繳稅額') {
                        const fee = parseInt(k === '電費金額' ? e.target.value : r.電費金額) || 0;
                        const tax = parseInt(k === '應繳稅額' ? e.target.value : r.應繳稅額) || 0;
                        next.應繳總金額 = String(fee + tax);
                      }
                      if (k === '尖峰度數' || k === '半尖峰度數' || k === '離峰度數') {
                        const peak = parseInt(k === '尖峰度數' ? e.target.value : r.尖峰度數) || 0;
                        const halfPeak = parseInt(k === '半尖峰度數' ? e.target.value : r.半尖峰度數) || 0;
                        const offPeak = parseInt(k === '離峰度數' ? e.target.value : r.離峰度數) || 0;
                        next.使用度數 = String(peak + halfPeak + offPeak);
                      }
                      return next;
                    });
                    setFormRecords(updated);
                  }}
                  className={`flex-1 border rounded px-2 py-1 text-xs ${
                    k === '應繳總金額' ? 'bg-emerald-100 border-emerald-300 font-semibold text-emerald-800' :
                    k === '使用度數' ? 'bg-teal-100 border-teal-300 font-semibold text-teal-800' :
                    'border-gray-300 bg-white'
                  }`}
                />
              </div>
            );
            return (
              <div key={idx} className="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-4">
                <h5 className="text-xs font-semibold text-teal-700">第 {idx + 1} 筆 — 電號：{rec.電號}</h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {basicFields.filter(k => k in rec).map(renderField)}
                </div>

                <div className="border border-teal-300 rounded-lg overflow-hidden">
                  <div className="bg-teal-200 px-3 py-1.5">
                    <span className="text-xs font-bold text-teal-900">使用度數（kWh）</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {degreeFields.filter(k => k in rec).map(renderField)}
                  </div>
                </div>

                <div className="border border-emerald-300 rounded-lg overflow-hidden">
                  <div className="bg-emerald-100 px-3 py-1.5">
                    <span className="text-xs font-bold text-emerald-900">應繳總金額（元）</span>
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                    {amountFields.filter(k => k in rec).map(renderField)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
