'use client';

import { useState } from 'react';

function JsonImportPanel({ showToast }) {
  const [importFile, setImportFile] = useState(null);
  const [importType, setImportType] = useState('products');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);

  async function handleDryRun() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    setImporting(true);
    setDryRunResult(null);
    setImportResult(null);
    try {
      const text = await importFile.text();
      let data;
      try { data = JSON.parse(text); } catch { showToast('檔案格式錯誤，請使用 JSON 格式', 'error'); setImporting(false); return; }
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, data: Array.isArray(data) ? data : [data], dryRun: true }),
      });
      const result = await res.json();
      if (res.ok) {
        setDryRunResult(result);
        showToast(`驗證完成：${result.validCount || 0} 筆有效，${result.errorCount || 0} 筆錯誤`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '驗證失敗', 'error');
      }
    } catch { showToast('驗證失敗', 'error'); }
    setImporting(false);
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, data: Array.isArray(data) ? data : [data], dryRun: false }),
      });
      const result = await res.json();
      if (res.ok) {
        setImportResult(result);
        setDryRunResult(null);
        showToast(`匯入完成：${result.importedCount || 0} 筆成功`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '匯入失敗', 'error');
      }
    } catch { showToast('匯入失敗', 'error'); }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">期初資料匯入</h3>
        <p className="text-sm text-gray-500 mb-4">使用 JSON 檔案匯入產品、廠商或會計科目等主資料</p>
        <div className="space-y-4">
          <div>
            <label htmlFor="f" className="block text-sm font-medium text-gray-600 mb-1">匯入類型</label>
            <select id="f" value={importType} onChange={e => { setImportType(e.target.value); setDryRunResult(null); setImportResult(null); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48">
              <option value="products">產品資料</option>
              <option value="suppliers">廠商資料</option>
              <option value="accounting_subjects">會計科目</option>
            </select>
          </div>
          <div>
            <label htmlFor="json" className="block text-sm font-medium text-gray-600 mb-1">選擇 JSON 檔案</label>
            <input id="json" type="file" accept=".json" onChange={e => { setImportFile(e.target.files[0]); setDryRunResult(null); setImportResult(null); }} className="text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleDryRun} disabled={importing || !importFile} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm">
              {importing ? '驗證中...' : '驗證（預覽）'}
            </button>
            {dryRunResult && dryRunResult.errorCount === 0 && (
              <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                {importing ? '匯入中...' : '確認匯入'}
              </button>
            )}
          </div>
        </div>
        {dryRunResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">驗證結果</h4>
            <p className="text-sm">有效：{dryRunResult.validCount || 0} 筆</p>
            <p className="text-sm">錯誤：{dryRunResult.errorCount || 0} 筆</p>
            {dryRunResult.errors?.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                {dryRunResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">第 {err.row || i + 1} 筆: {err.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {importResult && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="text-sm font-semibold text-green-800 mb-1">匯入完成</h4>
            <p className="text-sm text-green-700">成功匯入 {importResult.importedCount || 0} 筆資料</p>
          </div>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">注意事項</p>
            <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
              <li>• 請先使用「驗證（預覽）」確認資料無誤後再匯入</li>
              <li>• 匯入會偵測重複資料並自動跳過</li>
              <li>• 建議在正式匯入前先進行備份</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DataImportSection({ showToast }) {
  return (
    <div className="space-y-6">
      {/* Link to full setup wizard */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-amber-800 mb-1">📥 系統上線期初資料匯入精靈</h3>
            <p className="text-sm text-amber-700 mb-3">
              系統首次上線前，批量匯入帳戶餘額、庫存期初、貸款主檔、應付帳款等完整期初資料。
              支援多類型分批上傳、驗證預覽、確認匯入全流程。
            </p>
            <a
              href="/settings/setup-import"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
            >
              <span>前往期初資料匯入精靈</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
      {/* Simple JSON import for master data updates */}
      <JsonImportPanel showToast={showToast} />
    </div>
  );
}
