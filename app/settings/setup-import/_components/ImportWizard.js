'use client';

import { IMPORT_TYPES, STATUS_LABELS } from '../_hooks/useSetupImport';

export default function ImportWizard({
  activeSession,
  activeBatchType,
  activeBatchInfo,
  parsedRows,
  validationResult,
  validating,
  importing,
  selectBatchType,
  handleFileChange,
  validateBatch,
  confirmImport,
  downloadTemplate,
}) {
  if (!activeSession) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-400">請選擇或新建匯入作業</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session header */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">{activeSession.sessionNo}</h3>
            <p className="text-sm text-gray-500">開帳基準日：{activeSession.openingDate} · 建立人：{activeSession.createdBy}</p>
          </div>
          {activeSession.status === 'archived' && (
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">已封存（月結後）</span>
          )}
        </div>
      </div>

      {/* Data type selector grid */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">選擇匯入資料類型</h4>
        <div className="grid grid-cols-3 gap-2">
          {IMPORT_TYPES.map(type => {
            const batchStatus = activeSession.batches?.find(b => b.importType === type.key)?.status;
            const isImported = batchStatus === 'imported';
            return (
              <button
                key={type.key}
                onClick={() => selectBatchType(type.key)}
                disabled={activeSession.status === 'archived'}
                className={`p-3 rounded-lg border text-left transition-all relative ${
                  activeBatchType === type.key
                    ? 'border-amber-500 bg-amber-50'
                    : isImported
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 hover:border-amber-300 bg-white'
                } disabled:opacity-50`}
              >
                <div className="text-lg mb-1">{type.icon}</div>
                <div className="text-xs font-medium text-gray-800">{type.label}</div>
                {batchStatus && (
                  <div className={`mt-1 text-xs px-1.5 py-0.5 rounded inline-block ${STATUS_LABELS[batchStatus]?.color || ''}`}>
                    {STATUS_LABELS[batchStatus]?.label || batchStatus}
                  </div>
                )}
                {isImported && (
                  <div className="absolute top-2 right-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upload & Validate Panel */}
      {activeBatchType && (
        <UploadPanel
          activeBatchInfo={activeBatchInfo}
          parsedRows={parsedRows}
          validationResult={validationResult}
          validating={validating}
          importing={importing}
          handleFileChange={handleFileChange}
          validateBatch={validateBatch}
          confirmImport={confirmImport}
          downloadTemplate={downloadTemplate}
          activeBatchType={activeBatchType}
        />
      )}

      {/* Batch progress table */}
      {activeSession.batches?.length > 0 && (
        <BatchProgressTable batches={activeSession.batches} />
      )}
    </div>
  );
}

function UploadPanel({
  activeBatchInfo,
  parsedRows,
  validationResult,
  validating,
  importing,
  handleFileChange,
  validateBatch,
  confirmImport,
  downloadTemplate,
  activeBatchType,
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">
            {activeBatchInfo?.icon} {activeBatchInfo?.label}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">{activeBatchInfo?.desc}</p>
        </div>
        <button
          onClick={() => downloadTemplate(activeBatchType)}
          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下載範本
        </button>
      </div>

      {/* Required fields hint */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-500">
        <span className="font-medium">必填欄位：</span>
        {activeBatchInfo?.required.join('、')}
      </div>

      {/* File upload */}
      <div className="mb-4">
        <label htmlFor="json" className="block text-sm font-medium text-gray-600 mb-1">上傳 JSON 檔案</label>
        <input id="json"
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="text-sm w-full border border-gray-200 rounded-lg px-3 py-2"
        />
        {parsedRows.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">已解析 <strong>{parsedRows.length}</strong> 筆資料</p>
        )}
      </div>

      {/* Preview (first 3 rows) */}
      {parsedRows.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">預覽（前 3 筆）</p>
          <div className="overflow-auto max-h-32 bg-gray-50 rounded text-xs">
            <pre className="p-2 text-gray-600">{JSON.stringify(parsedRows.slice(0, 3), null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Validate button */}
      <div className="flex gap-3">
        <button
          onClick={validateBatch}
          disabled={parsedRows.length === 0 || validating}
          className="px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {validating ? '驗證中...' : '驗證資料'}
        </button>
        {validationResult && validationResult.errorRows === 0 && (
          <button
            onClick={confirmImport}
            disabled={importing}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {importing ? '匯入中...' : `確認匯入 ${validationResult.validRows} 筆`}
          </button>
        )}
      </div>

      {/* Validation result */}
      {validationResult && (
        <div className={`mt-4 rounded-lg p-4 ${validationResult.errorRows === 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {validationResult.errorRows === 0 ? (
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className={`text-sm font-medium ${validationResult.errorRows === 0 ? 'text-green-800' : 'text-red-800'}`}>
              {validationResult.errorRows === 0
                ? `驗證通過：${validationResult.validRows} 筆資料可匯入`
                : `驗證失敗：${validationResult.validRows} 筆通過，${validationResult.errorRows} 筆有誤`
              }
            </span>
          </div>

          {validationResult.errorDetails?.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-auto">
              {validationResult.errorDetails.slice(0, 10).map((err, i) => (
                <div key={i} className="text-xs text-red-700">
                  第 {err.rowNo} 列：{err.errors?.map(e => `${e.field} - ${e.message}`).join('；')}
                </div>
              ))}
              {validationResult.errorDetails.length > 10 && (
                <div className="text-xs text-red-500">...還有 {validationResult.errorDetails.length - 10} 個錯誤</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BatchProgressTable({ batches }) {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h4 className="text-sm font-medium text-gray-700">批次進度</h4>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-2 text-left text-xs text-gray-500">類型</th>
            <th className="px-4 py-2 text-center text-xs text-gray-500">總計</th>
            <th className="px-4 py-2 text-center text-xs text-gray-500">通過</th>
            <th className="px-4 py-2 text-center text-xs text-gray-500">匯入</th>
            <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {batches.map(b => {
            const typeInfo = IMPORT_TYPES.find(t => t.key === b.importType);
            const statusInfo = STATUS_LABELS[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <span className="mr-1">{typeInfo?.icon}</span>
                  {typeInfo?.label || b.importType}
                </td>
                <td className="px-4 py-2 text-center text-gray-600">{b.totalRows}</td>
                <td className="px-4 py-2 text-center text-green-600">{b.validRows}</td>
                <td className="px-4 py-2 text-center text-amber-600">{b.importedRows}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
