'use client';

import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useAuditLog, ACTION_LABELS, LEVEL_LABELS, TABS } from './_hooks/useAuditLog';
import LogsTab from './_components/LogsTab';
import CriticalTab from './_components/CriticalTab';
import ComplianceTab from './_components/ComplianceTab';
import CleanupModal from './_components/CleanupModal';

export default function AuditLogPage() {
  const audit = useAuditLog();

  return (
    <div className="min-h-screen page-bg-audit">
      <Navigation borderColor="border-zinc-500" />
      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-zinc-800">稽核日誌</h2>
          {audit.activeTab === 'logs' && (
            <div className="flex items-center gap-2">
              <ExportButtons
                data={audit.logs.map(log => ({
                  ...log,
                  actionLabel: ACTION_LABELS[log.action] || log.action,
                  levelLabel: LEVEL_LABELS[log.level] || log.level,
                }))}
                columns={EXPORT_CONFIGS.auditLog.columns}
                exportName={EXPORT_CONFIGS.auditLog.filename}
                title="稽核日誌"
                sheetName="稽核日誌"
              />
              {audit.session?.user?.role === 'admin' && (
                <button
                  onClick={() => audit.setShowCleanupModal(true)}
                  className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
                >
                  清理舊日誌
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => audit.handleTabChange(tab.key)}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                audit.activeTab === tab.key
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: 操作日誌 */}
        {audit.activeTab === 'logs' && (
          <LogsTab
            summary={audit.summary}
            filters={audit.filters}
            setFilters={audit.setFilters}
            handleSearch={audit.handleSearch}
            handleReset={audit.handleReset}
            loading={audit.loading}
            logsError={audit.logsError}
            logs={audit.logs}
            fetchLogs={audit.fetchLogs}
            pagination={audit.pagination}
            expandedId={audit.expandedId}
            setExpandedId={audit.setExpandedId}
          />
        )}

        {/* Tab: 重大決策 */}
        {audit.activeTab === 'critical' && (
          <CriticalTab
            criticalDecisions={audit.criticalDecisions}
            criticalLoading={audit.criticalLoading}
            fetchCriticalDecisions={audit.fetchCriticalDecisions}
          />
        )}

        {/* Tab: 合規報告 */}
        {audit.activeTab === 'compliance' && (
          <ComplianceTab
            complianceReport={audit.complianceReport}
            complianceLoading={audit.complianceLoading}
            complianceYear={audit.complianceYear}
            setComplianceYear={audit.setComplianceYear}
            complianceMonth={audit.complianceMonth}
            setComplianceMonth={audit.setComplianceMonth}
            fetchComplianceReport={audit.fetchComplianceReport}
            getScoreColor={audit.getScoreColor}
            getScoreBg={audit.getScoreBg}
          />
        )}

      </main>

      {/* Cleanup Modal */}
      {audit.showCleanupModal && (
        <CleanupModal
          cleanupDays={audit.cleanupDays}
          setCleanupDays={audit.setCleanupDays}
          cleanupPreview={audit.cleanupPreview}
          setCleanupPreview={audit.setCleanupPreview}
          cleanupResult={audit.cleanupResult}
          cleanupLoading={audit.cleanupLoading}
          cleanupConfirm={audit.cleanupConfirm}
          setCleanupConfirm={audit.setCleanupConfirm}
          handleCleanupPreview={audit.handleCleanupPreview}
          handleCleanupConfirm={audit.handleCleanupConfirm}
          handleCleanupClose={audit.handleCleanupClose}
        />
      )}
    </div>
  );
}
