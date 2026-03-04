'use client';

import { useState, useRef, useEffect } from 'react';
import { exportToXlsx, exportToCsv, exportToPdf } from '@/lib/export';
import { generateExportFilename, formatExportData } from '@/lib/export-columns';
import Toast from '@/components/Toast';

const MAX_EXPORT_ROWS = 10000;

/**
 * Shared export dropdown button component
 *
 * @param {Object} props
 * @param {Array} props.data - Array of row objects to export
 * @param {Array} props.columns - Array of { header: string, key: string, width?: number, format?: string }
 * @param {string} props.filename - Base filename without extension (default: 'export')
 * @param {string} [props.title] - Optional title for XLSX/PDF header
 * @param {string} [props.sheetName] - Optional sheet name for XLSX
 * @param {boolean} [props.disabled] - Disable the button
 * @param {string} [props.exportName] - Chinese name for the export (used in filename generation)
 * @param {string} [props.period] - Optional period string for filename (e.g. '2026-03')
 */
export default function ExportButtons({
  data = [],
  columns = [],
  filename = 'export',
  title,
  sheetName,
  disabled = false,
  exportName,
  period,
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleExport(format) {
    setExporting(true);
    setOpen(false);
    try {
      // Determine filename
      const exportFilename = exportName
        ? generateExportFilename(exportName, period)
        : filename;

      // Enforce row limit
      let exportData = data;
      let truncated = false;
      if (exportData.length > MAX_EXPORT_ROWS) {
        exportData = exportData.slice(0, MAX_EXPORT_ROWS);
        truncated = true;
      }

      const opts = { filename: exportFilename, columns, data: exportData, title, sheetName };

      if (format === 'xlsx') await exportToXlsx(opts);
      else if (format === 'csv') exportToCsv(opts);
      else if (format === 'pdf') await exportToPdf(opts);

      // Show success toast
      const formatLabel = format === 'xlsx' ? 'Excel' : format === 'csv' ? 'CSV' : 'PDF';
      const rowCount = exportData.length;

      if (truncated) {
        setToast({
          type: 'warning',
          message: `已匯出 ${formatLabel} (${rowCount.toLocaleString()} 筆，超過上限已截斷，原始共 ${data.length.toLocaleString()} 筆)`
        });
      } else {
        setToast({
          type: 'success',
          message: `${formatLabel} 匯出成功 (${rowCount.toLocaleString()} 筆資料)`
        });
      }
    } catch (err) {
      console.error('匯出失敗:', err);
      setToast({ type: 'error', message: '匯出失敗: ' + err.message });
    }
    setExporting(false);
  }

  const isDisabled = disabled || exporting || data.length === 0;

  return (
    <>
      <div className="relative inline-block" ref={ref}>
        {/* Main button */}
        <button
          type="button"
          onClick={() => !isDisabled && setOpen(!open)}
          disabled={isDisabled}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-150
            ${isDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm hover:shadow'
            }
          `}
        >
          {exporting ? (
            /* Spinner icon */
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            /* Download icon */
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
            </svg>
          )}
          {exporting ? '匯出中...' : '匯出'}
          {/* Chevron down */}
          {!exporting && (
            <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            {/* XLSX option */}
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded bg-green-100 text-green-700 text-xs font-bold flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                  <path d="M8 12h2l1.5 2.5L13 12h2l-2.5 3.5L15 19h-2l-1.5-2.5L10 19H8l2.5-3.5z"/>
                </svg>
              </span>
              <div className="text-left">
                <div className="font-medium">Excel (.xlsx)</div>
                <div className="text-xs text-gray-400">含格式的試算表</div>
              </div>
            </button>

            {/* CSV option */}
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                  <path d="M8 13h8v1H8zm0 2h8v1H8zm0 2h5v1H8z"/>
                </svg>
              </span>
              <div className="text-left">
                <div className="font-medium">CSV (.csv)</div>
                <div className="text-xs text-gray-400">純文字逗號分隔</div>
              </div>
            </button>

            {/* PDF option */}
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded bg-red-100 text-red-700 text-xs font-bold flex-shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                  <path d="M9 13h1.5c.8 0 1.5.7 1.5 1.5S11.3 16 10.5 16H10v2H9v-5zm1 2h.5c.3 0 .5-.2.5-.5s-.2-.5-.5-.5H10v1z"/>
                </svg>
              </span>
              <div className="text-left">
                <div className="font-medium">PDF (.pdf)</div>
                <div className="text-xs text-gray-400">適合列印的文件</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
