'use client';

import Link from 'next/link';

/**
 * 說明從飯店 PMS 匯出 Excel → 本系統「每日匯入總覽」的流程（對齊既有日營業報表解析）。
 */
export default function PmsIncomeExcelImportTab({ setActiveTab, onOpenUpload }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-5 py-4 text-sm text-teal-900">
        <p className="font-semibold text-teal-800 mb-2">飯店系統 → Excel → ERP</p>
        <ol className="list-decimal list-inside space-y-2 text-teal-900/90">
          <li>於飯店 PMS（或報表模組）依館別／日期匯出<strong>日營業報表</strong>（Excel）。</li>
          <li>開啟「每日匯入總覽」分頁，按館別與營業日上傳檔案；系統會對應科目並寫入收入記錄。</li>
          <li>科目對應可在「設定 → PMS 科目對應設定」調整；疑義請對照原 Excel 欄位名稱。</li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className="px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 shadow-sm"
        >
          前往每日匯入總覽並上傳
        </button>
        {typeof onOpenUpload === 'function' && (
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              onOpenUpload();
            }}
            className="px-5 py-2.5 rounded-lg border border-teal-300 text-teal-800 text-sm font-medium hover:bg-teal-50"
          >
            開啟上傳視窗（先切總覽）
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('mapping')}
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
        >
          PMS 科目對應設定
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
        <p className="font-medium text-gray-800 mb-2">與民宿模組對照</p>
        <p>
          民宿營運之訂房、OTA 傭金、訂金核對等明細請使用
          <Link href="/bnb" className="text-teal-700 font-medium hover:underline mx-1">
            民宿帳
          </Link>
          ；本頁聚焦<strong>飯店 PMS 日報 Excel</strong>匯入與後續核對。
        </p>
      </div>
    </div>
  );
}
