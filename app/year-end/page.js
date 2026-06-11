'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import HelpButton from '@/components/HelpButton';

import { useYearEndRecords } from './_hooks/useYearEndRecords';
import { useYearEndRollover } from './_hooks/useYearEndRollover';

import HistoryTab from './_tabs/HistoryTab';
import ChecklistTab from './_tabs/ChecklistTab';
import RolloverTab from './_tabs/RolloverTab';
import StatementModal from './_tabs/StatementModal';

export default function YearEndPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || '';

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    yearOptions.push(y);
  }

  // ── Records & detail hook ──
  const {
    records,
    loading,
    recordsError,
    fetchRecords,
    expandedId,
    detailData,
    detailLoading,
    detailTab,
    setDetailTab,
    statementModal,
    setStatementModal,
    handleToggleDetail,
    handleViewStatement,
  } = useYearEndRecords();

  const yearRecord = records.find(r => r.year === selectedYear);
  const isYearCompleted = yearRecord?.status === '已完成';

  // ── Rollover hook ──
  const rollover = useYearEndRollover({
    selectedYear,
    userName,
    onRecordsRefresh: fetchRecords,
  });

  function handleYearChange(year) {
    setSelectedYear(year);
    rollover.handleReset();
  }

  return (
    <div className="min-h-screen page-bg-year-end">
      <Navigation borderColor="border-violet-500" />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <ModuleGuideCard
          title="年結流程說明"
          color="violet"
          steps={[
            { label: '確認 12 月月結完成', desc: '年結前須確保 12 月（甚至全年各月）月結均已執行並鎖定', link: { href: '/month-end', text: '前往月結' } },
            { label: '執行庫存結轉', desc: '將當年庫存期末餘額結轉至下一年度期初' },
            { label: '執行現金結轉', desc: '將各現金帳戶期末餘額結轉，確保帳帳相符' },
            { label: '產生年度報表', desc: '年結完成後可至「損益表」及「現金流量表」查看全年數字', link: { href: '/reports/profit-loss', text: '前往報表' } },
          ]}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-violet-800">年度結轉</h2>
            <p className="text-sm text-gray-500 mt-1">年末結帳、庫存結轉、現金餘額結轉及財務報表產生</p>
            <div className="mt-2"><HelpButton anchor="二十一月結與年結" /></div>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="year-select" className="text-sm text-gray-600 font-medium">年度:</label>
            <select
              id="year-select"
              value={selectedYear}
              onChange={e => handleYearChange(parseInt(e.target.value))}
              className="border border-violet-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
            <span className="ml-3 text-gray-500">載入中...</span>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* Historical Records */}
            <HistoryTab
              records={records}
              recordsError={recordsError}
              fetchRecords={fetchRecords}
              expandedId={expandedId}
              detailData={detailData}
              detailLoading={detailLoading}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              handleToggleDetail={handleToggleDetail}
              handleViewStatement={handleViewStatement}
              selectedYear={selectedYear}
            />

            {/* Pre-flight Checklist */}
            <ChecklistTab
              yearChecklist={rollover.yearChecklist}
              isYearCompleted={isYearCompleted}
              selectedYear={selectedYear}
              yearManualChecks={rollover.yearManualChecks}
              toggleYearManual={rollover.toggleYearManual}
            />

            {/* Rollover Steps + Execution Result + Completed message */}
            <RolloverTab
              selectedYear={selectedYear}
              isYearCompleted={isYearCompleted}
              yearRecord={yearRecord}
              validating={rollover.validating}
              validationResult={rollover.validationResult}
              backupReady={rollover.backupReady}
              previewData={rollover.previewData}
              previewLoading={rollover.previewLoading}
              previewError={rollover.previewError}
              fetchPreview={rollover.fetchPreview}
              step={rollover.step}
              setStep={rollover.setStep}
              confirmText={rollover.confirmText}
              setConfirmText={rollover.setConfirmText}
              executing={rollover.executing}
              executionResult={rollover.executionResult}
              handleValidate={rollover.handleValidate}
              handleExecute={rollover.handleExecute}
              handleReset={rollover.handleReset}
              handleViewStatement={handleViewStatement}
              ignoreNegativeStock={rollover.ignoreNegativeStock}
              setIgnoreNegativeStock={rollover.setIgnoreNegativeStock}
            />
          </div>
        )}
      </div>

      {/* Statement Viewer Modal */}
      <StatementModal
        statementModal={statementModal}
        setStatementModal={setStatementModal}
        selectedYear={selectedYear}
      />
    </div>
  );
}
