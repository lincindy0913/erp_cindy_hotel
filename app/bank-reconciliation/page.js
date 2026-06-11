'use client';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import HelpButton from '@/components/HelpButton';
import { useBankReconciliation } from './_hooks/useBankReconciliation';
import BuildTxModal from './_components/BuildTxModal';
import ReconSummary from './_components/ReconSummary';
import BankLinesPanel from './_components/BankLinesPanel';
import SystemTxPanel from './_components/SystemTxPanel';
import StmtList from './_components/StmtList';

export default function BankReconciliationPage() {
  const h = useBankReconciliation();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      {h.error && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={h.error} onRetry={h.loadList} />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">存簿核對（銀行調節表）</h1>
            <p className="text-sm text-gray-500 mt-1">銀行存款帳戶月結調節表；<strong className="text-red-600">12 月份未完成將擋住年結。</strong>信用卡／OTA 對帳請至 <Link href="/reconciliation" className="text-violet-600 hover:underline">存簿對帳 →</Link></p>
          </div>
          <HelpButton anchor="九銀行對帳" />
        </div>

        <ModuleGuideCard
          title="銀行對帳流程說明"
          color="slate"
          storageKey="guide:bank-recon"
          steps={[
            { label: '建立月份調節表', desc: '選擇帳戶與月份 → 點擊「新增月份調節表」。系統自動帶入期初餘額（上月期末）與當月系統交易合計。' },
            { label: '輸入銀行結單數字', desc: '對照銀行寄來的月結對帳單，填入「銀行期末餘額」。差異欄位若非 0 代表有未核對項目。' },
            { label: '新增未達帳項目', desc: '若有已記帳但銀行尚未入帳（或反之）的項目，在「未達帳項目」區新增說明與金額，直到調節後餘額歸零。' },
            { label: '確認對帳完成', desc: '差異為 0 後點擊「確認完成」。12 月份必須完成，否則年結被擋。', link: { href: '/manual#九銀行對帳', text: '查看手冊說明' } },
          ]}
        />

        {/* Legacy system warning */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="font-semibold">此為舊版月調節表（傳統手動格式）</p>
            <p className="mt-0.5 text-amber-700">新帳戶請改用 <a href="/reconciliation" className="underline font-medium hover:text-amber-900">銀行對帳（逐筆匯入）</a>，支援 CSV 自動匯入與逐筆配對。同一帳戶同月份請勿在兩個系統重複建立，以避免餘額不一致。</p>
          </div>
        </div>

        {/* 篩選 */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="f" className="block text-xs text-gray-500 mb-1">銀行帳戶</label>
            <select id="f" value={h.accountId} onChange={e => h.setAccountId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[200px]">
              <option value="">— 請選擇 —</option>
              {h.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">月份</label>
            <input id="f-2" type="month" value={h.yearMonth} onChange={e => h.setYearMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={h.openOrCreate} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700">
            開啟 / 建立調節表
          </button>
        </div>

        {h.error   && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{h.error}</div>}
        {h.success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{h.success}</div>}

        {/* 調節表主畫面 */}
        {h.detail && (
          <div className="space-y-4">
            <ReconSummary detail={h.detail} stats={h.stats} onUpdateStmt={h.updateStmt} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BankLinesPanel
                lines={h.detail.lines || []}
                lineForm={h.lineForm}
                setLineForm={h.setLineForm}
                addingLine={h.addingLine}
                lineDateRef={h.lineDateRef}
                autoMatching={h.autoMatching}
                onAddLine={h.addLine}
                onAutoMatch={h.autoMatch}
                onApproveException={h.approveException}
                onOpenBuildModal={h.openBuildModal}
                onMatchLine={h.matchLine}
                onDeleteLine={h.deleteLine}
              />
              <SystemTxPanel systemTransactions={h.detail.systemTransactions} />
            </div>

            {/* 說明 */}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-xs text-teal-700 space-y-1">
              <p><b>使用流程：</b>①輸入銀行存摺各筆明細 → ②點「自動配對」比對系統交易（同日期±1元） → ③剩餘未配對項目人工處理 → ④輸入存摺期末餘額 → ⑤差異=0 → 標記已平衡</p>
              <p><b>差異來源：</b>在途交易（系統已記/銀行未到）、銀行費用（銀行已扣/系統未記）、錯帳</p>
              <p>銀行費用可回到「現金流」補記一筆支出，再重新自動配對。</p>
            </div>
          </div>
        )}

        <StmtList stmts={h.stmts.length && !h.detail ? h.stmts : []} onOpen={h.loadDetail} />

        {h.detail && (
          <button onClick={() => h.setDetail(null)} className="text-sm text-gray-500 hover:underline">← 返回列表</button>
        )}
      </div>

      <BuildTxModal
        buildModal={h.buildModal}
        setBuildModal={h.setBuildModal}
        buildDesc={h.buildDesc}
        setBuildDesc={h.setBuildDesc}
        buildCategoryId={h.buildCategoryId}
        setBuildCategoryId={h.setBuildCategoryId}
        categories={h.categories}
        buildLoading={h.buildLoading}
        onConfirm={h.handleBuildTx}
      />
    </div>
  );
}
