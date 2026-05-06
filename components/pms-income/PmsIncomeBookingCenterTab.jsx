'use client';

import Link from 'next/link';
import PmsIncomePresetRecordsTab from '@/components/pms-income/PmsIncomePresetRecordsTab';

/**
 * 代訂中心：整合旅行社佣金設定、手動代訂、民宿 OTA 工具連結，並列出 PMS 與代訂／OTA 相關科目摘要。
 */
export default function PmsIncomeBookingCenterTab({ WAREHOUSES, setActiveTab }) {
  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('travelAgency')}
          className="text-left rounded-xl border border-teal-200 bg-teal-50/80 p-4 hover:border-teal-400 transition-colors"
        >
          <p className="text-xs font-medium text-teal-600 uppercase tracking-wide">設定</p>
          <p className="text-base font-semibold text-teal-900 mt-1">旅行社佣金配置</p>
          <p className="text-xs text-teal-700/80 mt-2">佣金％、付款方式、資料來源</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manualCommission')}
          className="text-left rounded-xl border border-amber-200 bg-amber-50/80 p-4 hover:border-amber-400 transition-colors"
        >
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">登打</p>
          <p className="text-base font-semibold text-amber-900 mt-1">每月手動代訂</p>
          <p className="text-xs text-amber-800/80 mt-2">代訂中心佣金月結與沖帳</p>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('excelImport')}
          className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-teal-300 transition-colors"
        >
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">飯店</p>
          <p className="text-base font-semibold text-gray-900 mt-1">飯店 Excel 匯入</p>
          <p className="text-xs text-gray-500 mt-2">從 PMS 匯出日報並上傳</p>
        </button>
        <Link
          href="/bnb"
          className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 hover:border-indigo-400 transition-colors block"
        >
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">民宿</p>
          <p className="text-base font-semibold text-indigo-900 mt-1">民宿帳 · OTA</p>
          <p className="text-xs text-indigo-700/80 mt-2">訂金核對、OTA 傭金、比對（參考版面）</p>
        </Link>
      </div>

      <PmsIncomePresetRecordsTab
        preset="bookingCenter"
        title="PMS 代訂／OTA 相關科目摘要"
        subtitle="篩選條件包含：佣金、旅行社、代訂、網訂等關鍵字與相關會計科目（供與代訂流程交叉核對）。"
        WAREHOUSES={WAREHOUSES}
        accent="amber"
        onGoFullRecords={() => setActiveTab('records')}
      />
    </div>
  );
}
