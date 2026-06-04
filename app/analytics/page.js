'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import { useToast } from '@/context/ToastContext';

// ── Hooks ──────────────────────────────────────────────────────
import { useAnalyticsShared } from './_hooks/useAnalyticsShared';
import { useOverview } from './_hooks/useOverview';
import { usePnl } from './_hooks/usePnl';
import { useCashflow } from './_hooks/useCashflow';
import { useProcurement } from './_hooks/useProcurement';
import { usePayables } from './_hooks/usePayables';
import { useReport } from './_hooks/useReport';
import { useSupplierItems } from './_hooks/useSupplierItems';
import { useOccupancy } from './_hooks/useOccupancy';
import { useRentalRoi } from './_hooks/useRentalRoi';
import { useUtilityOcc } from './_hooks/useUtilityOcc';

// ── Tab components ─────────────────────────────────────────────
import OverviewTab from './_tabs/OverviewTab';
import PnlWarehouseTab from './_tabs/PnlWarehouseTab';
import PnlSupplierTab from './_tabs/PnlSupplierTab';
import PnlSummaryTab from './_tabs/PnlSummaryTab';
import CashflowTab from './_tabs/CashflowTab';
import ProcurementTab from './_tabs/ProcurementTab';
import PayablesTab from './_tabs/PayablesTab';
import ReportTab from './_tabs/ReportTab';
import SupplierItemsTab from './_tabs/SupplierItemsTab';
import OccupancyCostTab from './_tabs/OccupancyCostTab';
import OccupancyStatsTab from './_tabs/OccupancyStatsTab';
import RentalRoiTab from './_tabs/RentalRoiTab';
import UtilityOccTab from './_tabs/UtilityOccTab';

const TABS = [
  { key: 'overview',        label: '經營總覽' },
  { key: 'pnl-warehouse',   label: '館別損益' },
  { key: 'pnl-supplier',    label: '廠商損益' },
  { key: 'pnl-summary',     label: '損益彙總' },
  { key: 'cashflow',        label: '現金流預測' },
  { key: 'procurement',     label: '採購分析' },
  { key: 'payables',        label: '應付帳齡' },
  { key: 'report',          label: '月度報告' },
  { key: 'supplier-items',  label: '廠商採購明細' },
  { key: 'occupancy-cost', label: '住宿成本效益' },
  { key: 'occupancy-stats', label: '營運入住統計' },
  { key: 'rental-roi', label: '租賃 ROI' },
  { key: 'utility-occ', label: '水電與住宿' },
];

const TAB_PARAM_ALIASES = {
  'business-report': 'report',
};

const ANALYTICS_TAB_KEYS = new Set(TABS.map((t) => t.key));

function resolveTabFromSearchParam(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  const mapped = TAB_PARAM_ALIASES[v] ?? TAB_PARAM_ALIASES[v.toLowerCase()] ?? v;
  return ANALYTICS_TAB_KEYS.has(mapped) ? mapped : null;
}

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

function AnalyticsPageContent() {
  useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState('overview');

  const selectTab = useCallback(
    (key) => {
      setActiveTab(key);
      const p = new URLSearchParams(searchParams.toString());
      p.set('tab', key);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    const raw = searchParams.get('tab');
    const resolved = resolveTabFromSearchParam(raw);
    if (!resolved) return;
    setActiveTab(resolved);
    if (raw && raw !== resolved) {
      const p = new URLSearchParams(searchParams.toString());
      p.set('tab', resolved);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  // ── Hooks ────────────────────────────────────────────────────
  const { warehouses, suppliersList, suppliersFullList } = useAnalyticsShared();

  const { overview, overviewLoading, fetchOverview } = useOverview();

  const {
    pnl, pnlLoading, pnlStart, setPnlStart, pnlEnd, setPnlEnd,
    pnlWarehouse, setPnlWarehouse,
    pnlTrace, pnlTraceCtx, setPnlTraceCtx, setPnlTrace, pnlTraceLoading,
    fetchPnl, fetchPnlTrace,
    supplierPnl, supplierPnlLoading, supplierPnlStart, setSupplierPnlStart,
    supplierPnlEnd, setSupplierPnlEnd, supplierPnlWarehouse, setSupplierPnlWarehouse,
    supplierPnlSearch, setSupplierPnlSearch, fetchSupplierPnl,
    pnlSumStart, setPnlSumStart, pnlSumEnd, setPnlSumEnd,
    pnlSumWarehouse, setPnlSumWarehouse,
    pnlSummaryData, pnlSummaryLoading, fetchPnlSummary,
  } = usePnl();

  const { cashflow, cashflowLoading, forecastDays, setForecastDays, fetchCashflow } = useCashflow();

  const {
    supplierRisk, supplierLoading, riskMonth, setRiskMonth, fetchSupplierRisk,
    procurementSegment, setProcurementSegment,
    procurementStruct, procurementStructLoading,
    procStart, setProcStart, procEnd, setProcEnd, procWarehouse, setProcWarehouse,
    fetchProcurementStruct,
    pvYearMonth, setPvYearMonth, pvWarehouse, setPvWarehouse,
    pvKeyword, setPvKeyword, pvData, pvLoading, fetchPvBreakfast,
  } = useProcurement();

  const {
    payables, payablesLoading, fetchPayables,
    payablesSegment, setPayablesSegment,
    apAging, apAgingLoading, apAgingWarehouse, setApAgingWarehouse, fetchApAging,
  } = usePayables();

  const {
    report, reportLoading, reportMonth, setReportMonth, fetchReport,
    reportApproving, approveReport,
  } = useReport();

  const {
    spItems, spItemsLoading,
    spItemsStart, setSpItemsStart,
    spItemsEnd, setSpItemsEnd,
    spItemsWarehouse, setSpItemsWarehouse,
    spItemsSupplierId, setSpItemsSupplierId,
    fetchSpItems,
  } = useSupplierItems();

  const {
    occCost, occCostLoading,
    occCostStart, setOccCostStart,
    occCostEnd, setOccCostEnd,
    occCostWarehouse, setOccCostWarehouse,
    occCostCategory, setOccCostCategory,
    fetchOccCost,
    occStatsStart, setOccStatsStart,
    occStatsEnd, setOccStatsEnd,
    occStatsWarehouse, setOccStatsWarehouse,
    occStatsGroupBy, setOccStatsGroupBy,
    occStatsPayload, occStatsLoading,
    fetchOccStats,
  } = useOccupancy();

  const { rentalRoiYear, setRentalRoiYear, rentalRoiData, rentalRoiLoading, fetchRentalRoi } = useRentalRoi();

  const {
    utilOccWarehouse, setUtilOccWarehouse,
    utilOccRocYear, setUtilOccRocYear,
    utilOccData, utilOccLoading,
    fetchUtilityOccupancy,
  } = useUtilityOcc();

  // ── Tab activation effects ───────────────────────────────────
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    if (activeTab === 'pnl-warehouse') fetchPnl();
    if (activeTab === 'pnl-supplier') fetchSupplierPnl();
    if (activeTab === 'pnl-summary') fetchPnlSummary();
    if (activeTab === 'cashflow') fetchCashflow();
    if (activeTab === 'report') fetchReport();
    if (activeTab === 'supplier-items') fetchSpItems();
    if (activeTab === 'occupancy-cost') fetchOccCost();
    if (activeTab === 'occupancy-stats') fetchOccStats();
    if (activeTab === 'rental-roi') fetchRentalRoi();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'procurement') return;
    if (procurementSegment === 'risk') fetchSupplierRisk();
    if (procurementSegment === 'structure') fetchProcurementStruct();
    if (procurementSegment === 'breakfastCompare') fetchPvBreakfast();
  }, [activeTab, procurementSegment]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'payables') return;
    fetchPayables();
    fetchApAging();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab !== 'utility-occ') return;
    if (!utilOccWarehouse && warehouses.length > 0) {
      setUtilOccWarehouse(warehouses[0]);
    }
  }, [activeTab, warehouses, utilOccWarehouse, setUtilOccWarehouse]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen page-bg-analytics">
      <Navigation borderColor="border-cyan-500" />

      <main className="max-w-[96rem] mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">決策分析</h2>
          <p className="text-sm text-gray-500 mt-1">整合現金流、損益、採購與帳齡的即時分析儀表板</p>
        </div>

        <ModuleGuideCard
          title="主管閱讀建議路徑"
          color="blue"
          steps={[
            { label: '總覽 KPI', desc: '先看「總覽」分頁確認本月整體營運狀況：現金水位、應收應付、毛利率' },
            { label: '損益趨勢', desc: '到「損益趨勢」確認各月收支走勢，找出異常月份' },
            { label: '現金流量預測', desc: '查看未來 90 天現金流量預測，確認有無資金缺口' },
            { label: '帳齡分析', desc: '查看應付帳款帳齡，逾期帳款需追蹤催收', link: { href: '/analytics?tab=aging', text: '前往帳齡分析' } },
            { label: '完整報表', desc: '需要正式財務報表時前往損益表與現金流量表', link: { href: '/reports/profit-loss', text: '前往損益表' } },
          ]}
        />

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => selectTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ 總覽 ══════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          overviewLoading ? <Loading text="載入經營總覽..." /> :
          overview ? <OverviewTab data={overview} onTabSwitch={selectTab} /> :
          <div className="text-center py-12 text-gray-400">無法載入資料</div>
        )}

        {/* ══ 館別損益 ═══════════════════════════════════════════ */}
        {activeTab === 'pnl-warehouse' && (
          <PnlWarehouseTab
            warehouses={warehouses}
            pnlStart={pnlStart} setPnlStart={setPnlStart}
            pnlEnd={pnlEnd} setPnlEnd={setPnlEnd}
            pnlWarehouse={pnlWarehouse} setPnlWarehouse={setPnlWarehouse}
            pnlLoading={pnlLoading} pnl={pnl}
            fetchPnl={fetchPnl}
            onTrace={fetchPnlTrace}
          />
        )}

        {/* ══ 廠商損益 ═══════════════════════════════════════════ */}
        {activeTab === 'pnl-supplier' && (
          <PnlSupplierTab
            warehouses={warehouses}
            suppliersList={suppliersList}
            supplierPnlStart={supplierPnlStart} setSupplierPnlStart={setSupplierPnlStart}
            supplierPnlEnd={supplierPnlEnd} setSupplierPnlEnd={setSupplierPnlEnd}
            supplierPnlWarehouse={supplierPnlWarehouse} setSupplierPnlWarehouse={setSupplierPnlWarehouse}
            supplierPnlSearch={supplierPnlSearch} setSupplierPnlSearch={setSupplierPnlSearch}
            supplierPnlLoading={supplierPnlLoading} supplierPnl={supplierPnl}
            fetchSupplierPnl={fetchSupplierPnl}
          />
        )}

        {/* ══ 損益彙總 ════════════════════════════════════════════ */}
        {activeTab === 'pnl-summary' && (
          <PnlSummaryTab
            warehouses={warehouses}
            pnlSumStart={pnlSumStart} setPnlSumStart={setPnlSumStart}
            pnlSumEnd={pnlSumEnd} setPnlSumEnd={setPnlSumEnd}
            pnlSumWarehouse={pnlSumWarehouse} setPnlSumWarehouse={setPnlSumWarehouse}
            pnlSummaryLoading={pnlSummaryLoading} pnlSummaryData={pnlSummaryData}
            fetchPnlSummary={fetchPnlSummary}
          />
        )}

        {/* ══ 現金流預測 ════════════════════════════════════════ */}
        {activeTab === 'cashflow' && (
          <CashflowTab
            forecastDays={forecastDays} setForecastDays={setForecastDays}
            cashflowLoading={cashflowLoading} cashflow={cashflow}
            fetchCashflow={fetchCashflow}
          />
        )}

        {/* ══ 採購分析 ═══════════════════════════════════════════ */}
        {activeTab === 'procurement' && (
          <ProcurementTab
            warehouses={warehouses}
            procurementSegment={procurementSegment} setProcurementSegment={setProcurementSegment}
            supplierLoading={supplierLoading} supplierRisk={supplierRisk}
            riskMonth={riskMonth} setRiskMonth={setRiskMonth}
            fetchSupplierRisk={fetchSupplierRisk}
            procurementStructLoading={procurementStructLoading} procurementStruct={procurementStruct}
            procStart={procStart} setProcStart={setProcStart}
            procEnd={procEnd} setProcEnd={setProcEnd}
            procWarehouse={procWarehouse} setProcWarehouse={setProcWarehouse}
            fetchProcurementStruct={fetchProcurementStruct}
            pvLoading={pvLoading} pvData={pvData}
            pvYearMonth={pvYearMonth} setPvYearMonth={setPvYearMonth}
            pvWarehouse={pvWarehouse} setPvWarehouse={setPvWarehouse}
            pvKeyword={pvKeyword} setPvKeyword={setPvKeyword}
            fetchPvBreakfast={fetchPvBreakfast}
          />
        )}

        {/* ══ 應付帳齡 ═══════════════════════════════════════════ */}
        {activeTab === 'payables' && (
          <PayablesTab
            warehouses={warehouses}
            payablesSegment={payablesSegment} setPayablesSegment={setPayablesSegment}
            payablesLoading={payablesLoading} payables={payables}
            apAgingLoading={apAgingLoading} apAging={apAging}
            apAgingWarehouse={apAgingWarehouse} setApAgingWarehouse={setApAgingWarehouse}
            fetchApAging={fetchApAging}
          />
        )}

        {/* ══ 月度報告 ═══════════════════════════════════════════ */}
        {activeTab === 'report' && (
          <ReportTab
            reportMonth={reportMonth} setReportMonth={setReportMonth}
            reportLoading={reportLoading} report={report}
            reportApproving={reportApproving}
            fetchReport={fetchReport}
            approveReport={approveReport}
          />
        )}

        {/* ══ 廠商採購明細 ════════════════════════════════════════ */}
        {activeTab === 'supplier-items' && (
          <SupplierItemsTab
            warehouses={warehouses}
            suppliersFullList={suppliersFullList}
            spItemsStart={spItemsStart} setSpItemsStart={setSpItemsStart}
            spItemsEnd={spItemsEnd} setSpItemsEnd={setSpItemsEnd}
            spItemsWarehouse={spItemsWarehouse} setSpItemsWarehouse={setSpItemsWarehouse}
            spItemsSupplierId={spItemsSupplierId} setSpItemsSupplierId={setSpItemsSupplierId}
            spItemsLoading={spItemsLoading} spItems={spItems}
            fetchSpItems={fetchSpItems}
          />
        )}

        {/* ══ 住宿成本效益 ════════════════════════════════════════ */}
        {activeTab === 'occupancy-cost' && (
          <OccupancyCostTab
            warehouses={warehouses}
            occCostStart={occCostStart} setOccCostStart={setOccCostStart}
            occCostEnd={occCostEnd} setOccCostEnd={setOccCostEnd}
            occCostWarehouse={occCostWarehouse} setOccCostWarehouse={setOccCostWarehouse}
            occCostCategory={occCostCategory} setOccCostCategory={setOccCostCategory}
            occCostLoading={occCostLoading} occCost={occCost}
            fetchOccCost={fetchOccCost}
          />
        )}

        {/* ══ 營運入住統計 ════════════════════════════════════════ */}
        {activeTab === 'occupancy-stats' && (
          <OccupancyStatsTab
            warehouses={warehouses}
            occStatsStart={occStatsStart} setOccStatsStart={setOccStatsStart}
            occStatsEnd={occStatsEnd} setOccStatsEnd={setOccStatsEnd}
            occStatsWarehouse={occStatsWarehouse} setOccStatsWarehouse={setOccStatsWarehouse}
            occStatsGroupBy={occStatsGroupBy} setOccStatsGroupBy={setOccStatsGroupBy}
            occStatsLoading={occStatsLoading} occStatsPayload={occStatsPayload}
            fetchOccStats={fetchOccStats}
          />
        )}

        {/* ══ 租賃 ROI ═══════════════════════════════════════════ */}
        {activeTab === 'rental-roi' && (
          <RentalRoiTab
            rentalRoiYear={rentalRoiYear} setRentalRoiYear={setRentalRoiYear}
            rentalRoiLoading={rentalRoiLoading} rentalRoiData={rentalRoiData}
            fetchRentalRoi={fetchRentalRoi}
          />
        )}

        {/* ══ 水電與住宿 ═════════════════════════════════════════ */}
        {activeTab === 'utility-occ' && (
          <UtilityOccTab
            warehouses={warehouses}
            utilOccWarehouse={utilOccWarehouse} setUtilOccWarehouse={setUtilOccWarehouse}
            utilOccRocYear={utilOccRocYear} setUtilOccRocYear={setUtilOccRocYear}
            utilOccLoading={utilOccLoading} utilOccData={utilOccData}
            fetchUtilityOccupancy={fetchUtilityOccupancy}
          />
        )}
      </main>

      {/* P&L Drilldown Modal */}
      {pnlTraceCtx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setPnlTraceCtx(null); setPnlTrace(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-semibold text-gray-900">
                  {pnlTraceCtx.flowType === 'income' ? '收入' : '支出'}明細 — {pnlTraceCtx.subjectKey}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">館別：{pnlTraceCtx.warehouseLabel}</p>
              </div>
              <button onClick={() => { setPnlTraceCtx(null); setPnlTrace(null); }} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">×</button>
            </div>
            {pnlTraceLoading ? <Loading text="載入明細中..." /> :
              pnlTrace ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">日期</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">說明</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">金額</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">科目</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(pnlTrace.transactions || []).map((tx, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{tx.transactionDate?.slice(0, 10)}</td>
                        <td className="px-3 py-2">{tx.description || tx.note || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{NT(tx.amount)}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{tx.accountingSubject || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right text-xs text-gray-600">小計</td>
                      <td className="px-3 py-2 text-right">{NT((pnlTrace.transactions || []).reduce((s, t) => s + Number(t.amount || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : <div className="text-center py-8 text-gray-400">無明細</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen page-bg-analytics flex items-center justify-center">
          <Loading text="載入決策分析..." />
        </div>
      }
    >
      <AnalyticsPageContent />
    </Suspense>
  );
}
