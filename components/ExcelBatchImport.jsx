'use client';
import { useState, useRef, useCallback } from 'react';
import ExcelJS from 'exceljs';

/**
 * 通用 Excel 批次匯入元件
 *
 * Props:
 *   title       - 按鈕 / modal 標題，如「進貨單批次匯入」
 *   columns     - [{ key, header, example, required?, width?, note? }]
 *   onImport    - async (rows) => { count, errors: [{row, message}] }
 *   hint        - 可選說明文字
 *   buttonClass - 覆蓋按鈕樣式（預設綠色）
 */
export default function ExcelBatchImport({
  title, columns, onImport, hint, buttonClass,
}) {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState(null);   // 解析後的資料陣列
  const [parseErr,   setParseErr]   = useState('');
  const [importing,  setImporting]  = useState(false);
  const [result,     setResult]     = useState(null);   // { count, errors }
  const [dragging,   setDragging]   = useState(false);
  const fileRef = useRef(null);

  function reset() {
    setRows(null);
    setParseErr('');
    setResult(null);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() { setOpen(false); reset(); }

  // ── 產生範本 xlsx ──────────────────────────────────────────────
  async function downloadTemplate() {
    const wb    = new ExcelJS.Workbook();
    wb.creator   = '進銷存系統';
    const sheet = wb.addWorksheet('匯入資料');

    // 標題列
    const headerRow = sheet.addRow(columns.map(c => c.header));
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });
    columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width || 16;
    });

    // 範例列
    const exRow = sheet.addRow(columns.map(c => c.example ?? ''));
    exRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEFDF9' } };
      cell.font = { italic: true, color: { argb: 'FF6B7280' } };
    });

    // 備註列
    const hasNotes = columns.some(c => c.note || c.required);
    if (hasNotes) {
      const noteRow = sheet.addRow(columns.map(c => {
        const parts = [];
        if (c.required) parts.push('必填');
        if (c.note)     parts.push(c.note);
        return parts.join('；') || '';
      }));
      noteRow.eachCell(cell => {
        cell.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };
      });
    }

    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title}_範本.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── 解析上傳的 xlsx ────────────────────────────────────────────
  async function parseFile(file) {
    setParseErr('');
    setRows(null);
    setResult(null);
    try {
      const buf  = await file.arrayBuffer();
      const wb   = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const sheet = wb.worksheets[0];
      if (!sheet) { setParseErr('檔案中找不到工作表'); return; }

      // 找標題列（第 1 列）
      const headerRow = sheet.getRow(1);
      const headerMap = {};  // headerText → colIdx (1-based)
      headerRow.eachCell((cell, ci) => {
        const txt = String(cell.value || '').trim();
        if (txt) headerMap[txt] = ci;
      });

      // 確認必填欄位存在
      const missing = columns.filter(c => c.required && !headerMap[c.header]);
      if (missing.length) {
        setParseErr(`缺少必填欄位：${missing.map(c => c.header).join('、')}`);
        return;
      }

      // 偵測是否為本系統產生的範本（第 2 列使用斜體格式）
      const firstColIdx = Object.values(headerMap)[0];
      const row2Cell    = firstColIdx ? sheet.getRow(2).getCell(firstColIdx) : null;
      const isTemplate  = !!row2Cell?.font?.italic; // 本系統範本：範例列有斜體

      // 讀資料列（本系統範本跳過第 2 列範例、第 3 列備註；自製 Excel 從第 2 列開始讀）
      const dataRows = [];
      const totalRows = sheet.rowCount;
      for (let ri = 2; ri <= totalRows; ri++) {
        const row = sheet.getRow(ri);
        // 跳過空列
        const allEmpty = columns.every(c => {
          const ci = headerMap[c.header];
          return !ci || row.getCell(ci).value == null || String(row.getCell(ci).value).trim() === '';
        });
        if (allEmpty) continue;
        // 本系統範本：跳過範例列（斜體）
        if (isTemplate && ri === 2) continue;
        // 本系統範本：跳過備註列（含「必填」文字）
        if (isTemplate && ri === 3 && columns.some(c => {
          const ci = headerMap[c.header];
          return ci && String(row.getCell(ci).value || '').includes('必填');
        })) continue;

        const obj = { _row: ri };
        columns.forEach(c => {
          const ci = headerMap[c.header];
          obj[c.key] = ci ? row.getCell(ci).value ?? '' : '';
          // ExcelJS 數字型 → 轉字串時保留原值
          if (typeof obj[c.key] === 'object' && obj[c.key] !== null) {
            obj[c.key] = obj[c.key].text ?? obj[c.key].result ?? String(obj[c.key]);
          }
          obj[c.key] = String(obj[c.key]).trim();
        });
        dataRows.push(obj);
      }

      if (dataRows.length === 0) {
        setParseErr(isTemplate
          ? '檔案中未找到有效資料列（範本第 4 列以後填寫資料）'
          : '檔案中未找到有效資料列（請確認標題列在第 1 列，資料從第 2 列開始）');
        return;
      }
      setRows(dataRows);
    } catch (e) {
      console.error('[ExcelBatchImport] parse error', e);
      setParseErr(`解析失敗：${e.message || '未知錯誤'}`);
    }
  }

  function handleFileInput(e) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  }

  const handleDrop = useCallback(e => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 確認匯入 ───────────────────────────────────────────────────
  async function handleImport() {
    if (!rows?.length || !onImport) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await onImport(rows);
      setResult(res);
      if (res.count > 0) setRows(null);
    } catch (e) {
      setResult({ count: 0, errors: [{ row: '-', message: e.message || '匯入失敗' }] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={buttonClass || 'bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 text-sm font-medium'}
      >
        ↑ 匯入 Excel
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">{title}</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {hint && <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{hint}</p>}

              {/* Step 1: Download template */}
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <span className="text-sm font-medium text-gray-700">下載 Excel 範本，依格式填寫後上傳</span>
                <button onClick={downloadTemplate}
                  className="ml-auto text-sm px-3 py-1.5 border border-teal-500 text-teal-700 rounded-lg hover:bg-teal-50 font-medium">
                  ↓ 下載範本
                </button>
              </div>

              {/* Column description */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">欄位說明</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
                  {columns.map(c => (
                    <div key={c.key} className="flex gap-1">
                      <span className={`font-medium ${c.required ? 'text-red-600' : 'text-gray-600'}`}>
                        {c.header}{c.required ? '*' : ''}
                      </span>
                      {c.note && <span className="text-gray-400">（{c.note}）</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">* 紅色標記為必填</p>
              </div>

              {/* Step 2: Upload */}
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-2">上傳填好的 Excel 檔案（.xlsx）</p>
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                  >
                    <p className="text-sm text-gray-500">{dragging ? '放開以上傳' : '點擊或拖曳 .xlsx 檔案至此'}</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
                  </div>
                  {parseErr && <p className="text-sm text-red-600 mt-1.5 bg-red-50 rounded px-2 py-1">{parseErr}</p>}
                </div>
              </div>

              {/* Step 3: Preview */}
              {rows && rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                    <span className="text-sm font-medium text-gray-700">預覽（共 {rows.length} 筆，顯示前 20 筆）</span>
                  </div>
                  <div className="overflow-x-auto border rounded-lg max-h-52">
                    <table className="text-xs w-full">
                      <thead className="bg-teal-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-gray-500 whitespace-nowrap">#</th>
                          {columns.map(c => (
                            <th key={c.key} className="px-2 py-1.5 text-left text-gray-600 whitespace-nowrap">{c.header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 20).map((r, i) => (
                          <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                            <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                            {columns.map(c => (
                              <td key={c.key} className="px-2 py-1 max-w-[120px] truncate" title={r[c.key]}>{r[c.key] || <span className="text-gray-300">—</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className={`rounded-lg px-4 py-3 text-sm ${result.count > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {result.count > 0 && (
                    <p className="font-semibold text-green-700 mb-1">✓ 成功匯入 {result.count} 筆</p>
                  )}
                  {result.errors?.length > 0 && (
                    <div>
                      <p className="font-semibold text-red-700 mb-1">以下 {result.errors.length} 筆有錯誤：</p>
                      <ul className="space-y-0.5 text-red-600 text-xs">
                        {result.errors.slice(0, 10).map((e, i) => (
                          <li key={i}>第 {e.row} 列：{e.message}</li>
                        ))}
                        {result.errors.length > 10 && <li>…還有 {result.errors.length - 10} 筆錯誤</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center gap-3">
              <button onClick={() => { reset(); }}
                className="text-sm text-gray-500 hover:text-gray-700">重新上傳</button>
              <div className="flex gap-2">
                <button onClick={close} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">關閉</button>
                <button
                  onClick={handleImport}
                  disabled={!rows?.length || importing || !!result?.count}
                  className="px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40"
                >
                  {importing ? '匯入中…' : `確認匯入 ${rows?.length || 0} 筆`}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
