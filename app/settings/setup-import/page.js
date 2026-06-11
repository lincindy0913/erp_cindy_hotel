'use client';

import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { useSetupImport } from './_hooks/useSetupImport';
import SessionList from './_components/SessionList';
import ImportWizard from './_components/ImportWizard';

export default function SetupImportPage() {
  const {
    sessions, loading, fetchError,
    activeSession, showNewForm, setShowNewForm,
    newForm, setNewForm, creating,
    message,
    activeBatchType, parsedRows,
    validationResult, validating, importing,
    activeBatchInfo,
    fetchSessions, createSession,
    handleFileChange, validateBatch, confirmImport,
    downloadTemplate, selectSession, selectBatchType,
  } = useSetupImport();

  return (
    <div className="min-h-screen bg-amber-50">
      <Navigation borderColor="border-amber-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">期初資料匯入</h2>
          <p className="text-sm text-gray-500 mt-1">系統上線前一次性批量匯入期初資料（帳戶餘額、庫存、貸款、應付款等）</p>
        </div>

        {fetchError && <FetchErrorBanner message={fetchError} onRetry={fetchSessions} />}

        {/* Warning banner */}
        <div className="bg-amber-100 border border-amber-300 rounded-lg p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">⚠️ 重要說明</p>
            <p className="text-sm text-amber-700 mt-1">期初資料匯入屬不可輕易逆轉的操作，設計為系統上線前使用一次。首次月結完成後，工具將自動封存以防止誤操作。</p>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Session List */}
          <SessionList
            sessions={sessions}
            loading={loading}
            activeSession={activeSession}
            showNewForm={showNewForm}
            setShowNewForm={setShowNewForm}
            newForm={newForm}
            setNewForm={setNewForm}
            creating={creating}
            createSession={createSession}
            selectSession={selectSession}
          />

          {/* Right: Import Wizard */}
          <div className="lg:col-span-2">
            <ImportWizard
              activeSession={activeSession}
              activeBatchType={activeBatchType}
              activeBatchInfo={activeBatchInfo}
              parsedRows={parsedRows}
              validationResult={validationResult}
              validating={validating}
              importing={importing}
              selectBatchType={selectBatchType}
              handleFileChange={handleFileChange}
              validateBatch={validateBatch}
              confirmImport={confirmImport}
              downloadTemplate={downloadTemplate}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
