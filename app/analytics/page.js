'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { useToast } from '@/context/ToastContext';

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

/** URL ?tab= 別名 → 內部分頁 key（例如首頁連結 business-report → 月度報告） */
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

async function apiErrorMessage(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.error || j.message || `請求失敗（${res.status}）`;
  } catch {
    return `請求失敗（${res.status}）`;
  }
}

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

const riskBadge = (level) => {
  const map = { low: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700' };
  const label = { low: '低風險', medium: '中風險', high: '高風險', critical: '危急' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[level] || map.low}`}>{label[level] || level}</span>;
};

const KpiCard = ({ label, value, sub, color = 'text-gray-900', icon }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
    <div className="flex items-start justify-between">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {icon && <span className="text-lg">{icon}</span>}
    </div>
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const SectionTitle = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
    <span className="w-1 h-4 bg-cyan-500 rounded-full inline-block" />
    {children}
  </h3>
);

const Loading = ({ text = '載入中...' }) => (
  <div className="flex items-center justify-center py-20 text-gray-400">
    <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
    {text}
  </div>
);

const Bar = ({ value, max, color = 'bg-cyan-500' }) => {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${w}%` }} />
    </div>
  );
};

function AnalyticsPageContent() {
  useSession();
  const { showToast } = useToast();
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

  // ── Overview ─────────────────────────────────────────────────
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // ── P&L by Warehouse ─────────────────────────────────────────
  const [pnl, setPnl] = useState(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlStart, setPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [pnlEnd, setPnlEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [pnlWarehouse, setPnlWarehouse] = useState('');
  const [pnlTrace, setPnlTrace] = useState(null);
  const [pnlTraceCtx, setPnlTraceCtx] = useState(null);
  const [pnlTraceLoading, setPnlTraceLoading] = useState(false);

  // ── P&L by Supplier ───────────────────────────────────────────
  const [supplierPnl, setSupplierPnl] = useState(null);
  const [supplierPnlLoading, setSupplierPnlLoading] = useState(false);
  const [supplierPnlStart, setSupplierPnlStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [supplierPnlEnd, setSupplierPnlEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierPnlWarehouse, setSupplierPnlWarehouse] = useState('');
  const [supplierPnlSearch, setSupplierPnlSearch] = useState('');

  // ── 損益彙總（整體 P&L，/api/analytics/pnl）────────────────────
  const [pnlSumStart, setPnlSumStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [pnlSumEnd, setPnlSumEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [pnlSumWarehouse, setPnlSumWarehouse] = useState('');
  const [pnlSummaryData, setPnlSummaryData] = useState(null);
  const [pnlSummaryLoading, setPnlSummaryLoading] = useState(false);

  // ── 租賃 ROI（/api/analytics/rental-roi）────────────────────────
  const [rentalRoiYear, setRentalRoiYear] = useState(() => new Date().getFullYear());
  const [rentalRoiData, setRentalRoiData] = useState(null);
  const [rentalRoiLoading, setRentalRoiLoading] = useState(false);

  // ── Shared dropdown data ───────────────────────────────────────
  const [warehouses, setWarehouses] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);

  // ── Cash Flow ─────────────────────────────────────────────────
  const [cashflow, setCashflow] = useState(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [forecastDays, setForecastDays] = useState(30);

  // ── Procurement / Supplier Risk ───────────────────────────────
  const [supplierRisk, setSupplierRisk] = useState(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [riskMonth, setRiskMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  /** procurement tab: 供應商風險 | 採購結構（品類／排行） */
  const [procurementSegment, setProcurementSegment] = useState('risk');
  const [procurementStruct, setProcurementStruct] = useState(null);
  const [procurementStructLoading, setProcurementStructLoading] = useState(false);
  const [procStart, setProcStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [procEnd, setProcEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [procWarehouse, setProcWarehouse] = useState('');
  /** 早餐人數 vs 品項採購（procurement-vs-breakfast） */
  const [pvYearMonth, setPvYearMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pvWarehouse, setPvWarehouse] = useState('');
  const [pvKeyword, setPvKeyword] = useState('');
  const [pvData, setPvData] = useState(null);
  const [pvLoading, setPvLoading] = useState(false);

  // ── Payables Aging ────────────────────────────────────────────
  const [payables, setPayables] = useState(null);
  const [payablesLoading, setPayablesLoading] = useState(false);
  /** payables tab: 營運應付（payables-aging）| 費用單 AP（ap-aging） */
  const [payablesSegment, setPayablesSegment] = useState('operations');
  const [apAging, setApAging] = useState(null);
  const [apAgingLoading, setApAgingLoading] = useState(false);
  const [apAgingWarehouse, setApAgingWarehouse] = useState('');

  // ── Monthly Report ────────────────────────────────────────────
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportApproving, setReportApproving] = useState(false);

  // ── Supplier Purchase Items ───────────────────────────────────
  const [spItems, setSpItems] = useState(null);
  const [spItemsLoading, setSpItemsLoading] = useState(false);
  const [spItemsStart, setSpItemsStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [spItemsEnd, setSpItemsEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [spItemsWarehouse, setSpItemsWarehouse] = useState('');
  const [spItemsSupplierId, setSpItemsSupplierId] = useState('');
  const [suppliersFullList, setSuppliersFullList] = useState([]); // [{id, name}]

  // ── Occupancy Cost Efficiency ─────────────────────────────────
  const [occCost, setOccCost] = useState(null);
  const [occCostLoading, setOccCostLoading] = useState(false);
  const [occCostStart, setOccCostStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 89); return d.toISOString().slice(0, 10);
  });
  const [occCostEnd, setOccCostEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [occCostWarehouse, setOccCostWarehouse] = useState('');
  const [occCostCategory, setOccCostCategory] = useState('');

  // ── 營運入住統計（occupancy-stats API，純 PMS 量體）──────────────
  const [occStatsStart, setOccStatsStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10);
  });
  const [occStatsEnd, setOccStatsEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [occStatsWarehouse, setOccStatsWarehouse] = useState('');
  const [occStatsGroupBy, setOccStatsGroupBy] = useState('day');
  const [occStatsPayload, setOccStatsPayload] = useState(null);
  const [occStatsLoading, setOccStatsLoading] = useState(false);

  // ── 水電 vs 住宿（PMS）年度樞紐 ───────────────────────────────
  const [utilOccWarehouse, setUtilOccWarehouse] = useState('');
  const [utilOccRocYear, setUtilOccRocYear] = useState(() => String(new Date().getFullYear() - 1911));
  const [utilOccData, setUtilOccData] = useState(null);
  const [utilOccLoading, setUtilOccLoading] = useState(false);

  // ── Fetch helpers ─────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [reportRes, cashRes, payRes] = await Promise.all([
        fetch(`/api/analytics/business-report?month=${month}`),
        fetch('/api/analytics/cash-flow-forecast?days=30'),
        fetch('/api/analytics/payables-aging'),
      ]);
      const failed = [];
      if (!reportRes.ok) failed.push('月度摘要');
      if (!cashRes.ok) failed.push('現金流預測');
      if (!payRes.ok) failed.push('應付帳齡');
      if (failed.length > 0) {
        showToast(`經營總覽部分載入失敗：${failed.join('、')}`, 'error');
      }
      const [rep, cash, pay] = await Promise.all([
        reportRes.ok ? reportRes.json() : null,
        cashRes.ok ? cashRes.json() : null,
        payRes.ok ? payRes.json() : null,
      ]);
      setOverview({ rep, cash, pay });
    } catch (e) {
      console.error(e);
      showToast('經營總覽載入失敗，請稍後再試', 'error');
    }
    setOverviewLoading(false);
  }, [showToast]);

  const fetchPnl = useCallback(async () => {
    setPnlLoading(true); setPnl(null);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd });
      if (pnlWarehouse.trim()) p.set('warehouse', pnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-warehouse?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlLoading(false);
        return;
      }
      setPnl(await res.json());
    } catch (e) {
      console.error(e);
      showToast('館別損益查詢失敗，請稍後再試', 'error');
    }
    setPnlLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse, showToast]);

  const fetchSupplierPnl = useCallback(async () => {
    setSupplierPnlLoading(true); setSupplierPnl(null);
    try {
      const p = new URLSearchParams({ startDate: supplierPnlStart, endDate: supplierPnlEnd });
      if (supplierPnlWarehouse.trim()) p.set('warehouse', supplierPnlWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl-by-supplier?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setSupplierPnlLoading(false);
        return;
      }
      setSupplierPnl(await res.json());
    } catch (e) {
      console.error(e);
      showToast('廠商損益查詢失敗，請稍後再試', 'error');
    }
    setSupplierPnlLoading(false);
  }, [supplierPnlStart, supplierPnlEnd, supplierPnlWarehouse, showToast]);

  const fetchPnlSummary = useCallback(async () => {
    setPnlSummaryLoading(true);
    setPnlSummaryData(null);
    try {
      const p = new URLSearchParams({ startDate: pnlSumStart, endDate: pnlSumEnd });
      if (pnlSumWarehouse.trim()) p.set('warehouse', pnlSumWarehouse.trim());
      const res = await fetch(`/api/analytics/pnl?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlSummaryLoading(false);
        return;
      }
      setPnlSummaryData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('損益彙總載入失敗，請稍後再試', 'error');
    }
    setPnlSummaryLoading(false);
  }, [pnlSumStart, pnlSumEnd, pnlSumWarehouse, showToast]);

  const fetchRentalRoi = useCallback(async () => {
    setRentalRoiLoading(true);
    try {
      const y = Number(rentalRoiYear);
      const year = Number.isFinite(y) ? y : new Date().getFullYear();
      const res = await fetch(`/api/analytics/rental-roi?year=${year}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setRentalRoiLoading(false);
        return;
      }
      setRentalRoiData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('租賃 ROI 載入失敗，請稍後再試', 'error');
    }
    setRentalRoiLoading(false);
  }, [rentalRoiYear, showToast]);

  const fetchPnlTrace = useCallback(async ({ warehouseLabel, flowType, subjectKey }) => {
    setPnlTraceCtx({ warehouseLabel, flowType, subjectKey }); setPnlTrace(null); setPnlTraceLoading(true);
    try {
      const p = new URLSearchParams({ startDate: pnlStart, endDate: pnlEnd, flowType, subjectKey });
      p.set('warehouse', warehouseLabel === '未指定館別' ? '__NULL__' : (pnlWarehouse.trim() || warehouseLabel));
      const res = await fetch(`/api/analytics/pnl-by-warehouse/drilldown?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPnlTraceLoading(false);
        return;
      }
      setPnlTrace(await res.json());
    } catch (e) {
      console.error(e);
      showToast('明細載入失敗，請稍後再試', 'error');
    }
    setPnlTraceLoading(false);
  }, [pnlStart, pnlEnd, pnlWarehouse, showToast]);

  const fetchCashflow = useCallback(async () => {
    setCashflowLoading(true);
    try {
      const res = await fetch(`/api/analytics/cash-flow-forecast?days=${forecastDays}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setCashflowLoading(false);
        return;
      }
      setCashflow(await res.json());
    } catch (e) {
      console.error(e);
      showToast('現金流預測載入失敗，請稍後再試', 'error');
    }
    setCashflowLoading(false);
  }, [forecastDays, showToast]);

  const fetchSupplierRisk = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const res = await fetch(`/api/analytics/supplier-risk?month=${riskMonth}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setSupplierLoading(false);
        return;
      }
      setSupplierRisk(await res.json());
    } catch (e) {
      console.error(e);
      showToast('採購分析載入失敗，請稍後再試', 'error');
    }
    setSupplierLoading(false);
  }, [riskMonth, showToast]);

  const fetchPayables = useCallback(async () => {
    setPayablesLoading(true);
    try {
      const res = await fetch('/api/analytics/payables-aging');
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPayablesLoading(false);
        return;
      }
      setPayables(await res.json());
    } catch (e) {
      console.error(e);
      showToast('應付帳齡載入失敗，請稍後再試', 'error');
    }
    setPayablesLoading(false);
  }, [showToast]);

  const fetchApAging = useCallback(async () => {
    setApAgingLoading(true);
    try {
      const p = new URLSearchParams();
      if (apAgingWarehouse.trim()) p.set('warehouse', apAgingWarehouse.trim());
      const qs = p.toString();
      const res = await fetch(`/api/analytics/ap-aging${qs ? `?${qs}` : ''}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setApAgingLoading(false);
        return;
      }
      setApAging(await res.json());
    } catch (e) {
      console.error(e);
      showToast('費用單帳齡載入失敗，請稍後再試', 'error');
    }
    setApAgingLoading(false);
  }, [apAgingWarehouse, showToast]);

  const fetchProcurementStruct = useCallback(async () => {
    setProcurementStructLoading(true);
    setProcurementStruct(null);
    try {
      const p = new URLSearchParams({ startDate: procStart, endDate: procEnd });
      if (procWarehouse.trim()) p.set('warehouse', procWarehouse.trim());
      const res = await fetch(`/api/analytics/procurement?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setProcurementStructLoading(false);
        return;
      }
      setProcurementStruct(await res.json());
    } catch (e) {
      console.error(e);
      showToast('採購結構分析載入失敗，請稍後再試', 'error');
    }
    setProcurementStructLoading(false);
  }, [procStart, procEnd, procWarehouse, showToast]);

  const fetchPvBreakfast = useCallback(async () => {
    const ym = (pvYearMonth || '').trim().substring(0, 7);
    if (!ym || ym.length < 7) {
      showToast('請輸入年月（YYYY-MM，例：2026-03）', 'error');
      return;
    }
    setPvLoading(true);
    setPvData(null);
    try {
      const p = new URLSearchParams({ yearMonth: ym });
      if (pvWarehouse.trim()) p.set('warehouse', pvWarehouse.trim());
      if (pvKeyword.trim()) p.set('keyword', pvKeyword.trim());
      const res = await fetch(`/api/analytics/procurement-vs-breakfast?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setPvLoading(false);
        return;
      }
      setPvData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('早餐與採購對照載入失敗', 'error');
    }
    setPvLoading(false);
  }, [pvYearMonth, pvWarehouse, pvKeyword, showToast]);

  const fetchOccStats = useCallback(async () => {
    setOccStatsLoading(true);
    try {
      const p = new URLSearchParams({
        startDate: occStatsStart,
        endDate: occStatsEnd,
        groupBy: occStatsGroupBy,
      });
      if (occStatsWarehouse.trim()) p.set('warehouse', occStatsWarehouse.trim());
      const res = await fetch(`/api/analytics/occupancy-stats?${p}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setOccStatsLoading(false);
        return;
      }
      setOccStatsPayload(await res.json());
    } catch (e) {
      console.error(e);
      showToast('營運入住統計載入失敗', 'error');
    }
    setOccStatsLoading(false);
  }, [occStatsStart, occStatsEnd, occStatsWarehouse, occStatsGroupBy, showToast]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true); setReport(null);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setReportLoading(false);
        return;
      }
      setReport(await res.json());
    } catch (e) {
      console.error(e);
      showToast('月度報告載入失敗，請稍後再試', 'error');
    }
    setReportLoading(false);
  }, [reportMonth, showToast]);

  const fetchSpItems = useCallback(async () => {
    setSpItemsLoading(true); setSpItems(null);
    try {
      const p = new URLSearchParams({ startDate: spItemsStart, endDate: spItemsEnd });
      if (spItemsSupplierId) p.set('supplierId', spItemsSupplierId);
      if (spItemsWarehouse.trim()) p.set('warehouse', spItemsWarehouse.trim());
      const res = await fetch(`/api/analytics/supplier-purchase-items?${p}`);
      if (res.ok) setSpItems(await res.json());
      else showToast(await apiErrorMessage(res), 'error');
    } catch (e) { console.error(e); showToast('廠商品項查詢失敗，請稍後再試', 'error'); }
    setSpItemsLoading(false);
  }, [spItemsStart, spItemsEnd, spItemsSupplierId, spItemsWarehouse, showToast]);

  const fetchOccCost = useCallback(async () => {
    setOccCostLoading(true); setOccCost(null);
    try {
      const p = new URLSearchParams({ startDate: occCostStart, endDate: occCostEnd });
      if (occCostWarehouse) p.set('warehouse', occCostWarehouse);
      if (occCostCategory)  p.set('category',  occCostCategory);
      const res = await fetch(`/api/analytics/occupancy-cost?${p}`);
      if (res.ok) setOccCost(await res.json());
      else showToast(await apiErrorMessage(res), 'error');
    } catch (e) { console.error(e); showToast('住宿成本效益查詢失敗，請稍後再試', 'error'); }
    setOccCostLoading(false);
  }, [occCostStart, occCostEnd, occCostWarehouse, occCostCategory, showToast]);

  const fetchUtilityOccupancy = useCallback(async () => {
    if (!utilOccWarehouse.trim()) {
      showToast('請選擇館別', 'error');
      return;
    }
    const y = parseInt(utilOccRocYear, 10);
    if (!Number.isFinite(y) || y < 1) {
      showToast('請輸入有效民國年', 'error');
      return;
    }
    setUtilOccLoading(true);
    setUtilOccData(null);
    try {
      const p = new URLSearchParams({ warehouse: utilOccWarehouse.trim(), rocYear: String(y) });
      const res = await fetch(`/api/analytics/utility-occupancy?${p}`);
      if (res.ok) setUtilOccData(await res.json());
      else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '查詢失敗', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('查詢失敗', 'error');
    }
    setUtilOccLoading(false);
  }, [utilOccWarehouse, utilOccRocYear, showToast]);

  const approveReport = async () => {
    setReportApproving(true);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`, { method: 'PATCH' });
      if (res.ok) {
        const d = await res.json();
        setReport((prev) => ({ ...prev, report: d.report }));
        showToast('月度報告已核定', 'success');
      } else {
        showToast(await apiErrorMessage(res), 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('核定失敗，請稍後再試', 'error');
    }
    setReportApproving(false);
  };

  // Load warehouses and suppliers once on mount
  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then(r => r.json())
      .then(data => {
        if (data?.list) setWarehouses(data.list.filter(w => w.type === 'building').map(w => w.name));
      })
      .catch(() => {});
    fetch('/api/suppliers?all=true')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        const sorted = list.filter(s => s.id && s.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        setSuppliersList(sorted.map(s => s.name));
        setSuppliersFullList(sorted.map(s => ({ id: s.id, name: s.name })));
      })
      .catch(() => {});
  }, []);

  // Load on tab activation
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
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'procurement') return;
    if (procurementSegment === 'risk') fetchSupplierRisk();
    if (procurementSegment === 'structure') fetchProcurementStruct();
    if (procurementSegment === 'breakfastCompare') fetchPvBreakfast();
  }, [activeTab, procurementSegment]);

  useEffect(() => {
    if (activeTab !== 'payables') return;
    fetchPayables();
    fetchApAging();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'utility-occ') return;
    if (!utilOccWarehouse && warehouses.length > 0) {
      setUtilOccWarehouse(warehouses[0]);
    }
  }, [activeTab, warehouses, utilOccWarehouse]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen page-bg-analytics">
      <Navigation borderColor="border-cyan-500" />

      <main className="max-w-[96rem] mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">決策分析</h2>
          <p className="text-sm text-gray-500 mt-1">整合現金流、損益、採購與帳齡的即時分析儀表板</p>
        </div>

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
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={pnlStart} onChange={e => setPnlStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={pnlEnd} onChange={e => setPnlEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select value={pnlWarehouse} onChange={e => setPnlWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部館別</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <button onClick={fetchPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500">變更日期或館別後請按「查詢」重新計算。</p>
            </div>

            {pnlLoading ? <Loading text="計算損益中..." /> :
              pnl ? <PnlTab data={pnl} onTrace={fetchPnlTrace} /> :
              <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
            }
          </div>
        )}

        {/* ══ 廠商損益 ═══════════════════════════════════════════ */}
        {activeTab === 'pnl-supplier' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={supplierPnlStart} onChange={e => setSupplierPnlStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={supplierPnlEnd} onChange={e => setSupplierPnlEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select value={supplierPnlWarehouse} onChange={e => setSupplierPnlWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部館別</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">搜尋廠商</label>
                  <select value={supplierPnlSearch} onChange={e => setSupplierPnlSearch(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部廠商</option>
                    {suppliersList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={fetchSupplierPnl} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500">變更日期、館別或廠商篩選後請按「查詢」重新計算。</p>
            </div>

            {supplierPnlLoading ? <Loading text="計算廠商損益中..." /> :
              supplierPnl ? <SupplierPnlTab data={supplierPnl} search={supplierPnlSearch} /> :
              <div className="text-center py-12 text-gray-400">請設定日期範圍後查詢</div>
            }
          </div>
        )}

        {/* ══ 損益彙總（整體 P&L）══════════════════════════════════ */}
        {activeTab === 'pnl-summary' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={pnlSumStart} onChange={e => setPnlSumStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={pnlSumEnd} onChange={e => setPnlSumEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select value={pnlSumWarehouse} onChange={e => setPnlSumWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部館別</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <button type="button" onClick={fetchPnlSummary} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                將 PMS 收入、進貨（扣折讓）、費用分項加總為<strong>不分館別矩陣</strong>的整體損益；與「館別損益」分頁（依館別展開與鑽取）算法不同。
              </p>
            </div>
            {pnlSummaryLoading ? <Loading text="計算損益彙總中..." /> :
              pnlSummaryData ? <PnlSummaryTab data={pnlSummaryData} /> :
              <div className="text-center py-12 text-gray-400">請設定日期後按「查詢」</div>
            }
          </div>
        )}

        {/* ══ 現金流預測 ════════════════════════════════════════ */}
        {activeTab === 'cashflow' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">預測天數</label>
                <select value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  <option value={7}>7 天</option>
                  <option value={14}>14 天</option>
                  <option value={30}>30 天</option>
                  <option value={60}>60 天</option>
                  <option value={90}>90 天</option>
                </select>
              </div>
              <button onClick={fetchCashflow} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                重新預測
              </button>
            </div>
            {cashflowLoading ? <Loading text="預測現金流中..." /> :
              cashflow ? <CashflowTab data={cashflow} /> :
              <div className="text-center py-12 text-gray-400">無資料</div>
            }
          </div>
        )}

        {/* ══ 採購分析 ═══════════════════════════════════════════ */}
        {activeTab === 'procurement' && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 mr-1">檢視：</span>
              <button
                type="button"
                onClick={() => setProcurementSegment('risk')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  procurementSegment === 'risk' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                供應商風險
              </button>
              <button
                type="button"
                onClick={() => setProcurementSegment('structure')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  procurementSegment === 'structure' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                採購結構分析
              </button>
              <button
                type="button"
                onClick={() => setProcurementSegment('breakfastCompare')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  procurementSegment === 'breakfastCompare' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                早餐與採購對照
              </button>
              <Link href="/purchasing" className="ml-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                前往採購模組 →
              </Link>
            </div>

            {procurementSegment === 'risk' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
                    <input type="text" value={riskMonth} onChange={e => setRiskMonth(e.target.value)}
                      placeholder="202506" maxLength={6}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  </div>
                  <button type="button" onClick={fetchSupplierRisk} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                    查詢
                  </button>
                </div>
                <p className="text-xs text-gray-500 px-1">依廠商集中度、採購額與風險規則分析；與「採購結構分析」資料來源不同。</p>
                {supplierLoading ? <Loading text="分析供應商資料中..." /> :
                  supplierRisk ? <ProcurementTab data={supplierRisk} /> :
                  <div className="text-center py-12 text-gray-400">無採購資料</div>
                }
              </>
            )}

            {procurementSegment === 'structure' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">進貨起始日</label>
                      <input type="date" value={procStart} onChange={e => setProcStart(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">進貨結束日</label>
                      <input type="date" value={procEnd} onChange={e => setProcEnd(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                      <select value={procWarehouse} onChange={e => setProcWarehouse(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                        <option value="">全部館別</option>
                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={fetchProcurementStruct} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                      查詢
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">彙總進貨單明細：前十大廠商、品類占比、月度趨勢；變更條件後請按「查詢」。</p>
                </div>
                {procurementStructLoading ? <Loading text="計算採購結構中..." /> :
                  procurementStruct ? <ProcurementStructureTab data={procurementStruct} /> :
                  <div className="text-center py-12 text-gray-400">請設定日期後按「查詢」</div>
                }
              </>
            )}

            {procurementSegment === 'breakfastCompare' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">年月（YYYY-MM）</label>
                      <input
                        type="month"
                        value={pvYearMonth.length >= 7 ? pvYearMonth.substring(0, 7) : pvYearMonth}
                        onChange={(e) => setPvYearMonth(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                      <select
                        value={pvWarehouse}
                        onChange={(e) => setPvWarehouse(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
                      >
                        <option value="">全部館別</option>
                        {warehouses.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <label className="block text-xs text-gray-500 mb-1">品項關鍵字（選填，對應進貨品名／編號）</label>
                      <input
                        type="text"
                        value={pvKeyword}
                        onChange={(e) => setPvKeyword(e.target.value)}
                        placeholder="例：牛奶、蛋"
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-cyan-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchPvBreakfast}
                      className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
                    >
                      查詢
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                    比對當月 PMS <strong>早餐人數</strong>與<strong>指定品項進貨數量／金額</strong>；未填關鍵字時僅顯示住宿／早餐量體，採購合計為 0。
                    資料需已匯入 PMS 日報與進貨單。
                  </p>
                </div>
                {pvLoading ? (
                  <Loading text="載入早餐與採購對照..." />
                ) : pvData ? (
                  <ProcurementVsBreakfastTab data={pvData} />
                ) : (
                  <div className="text-center py-12 text-gray-400">請選擇年月後按「查詢」</div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ 應付帳齡 ═══════════════════════════════════════════ */}
        {activeTab === 'payables' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 mr-1">資料來源：</span>
              <button
                type="button"
                onClick={() => setPayablesSegment('operations')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  payablesSegment === 'operations' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                營運應付與資金
              </button>
              <button
                type="button"
                onClick={() => setPayablesSegment('expenseAp')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  payablesSegment === 'expenseAp' ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                費用單應付（AP）
              </button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed px-0.5">
              <strong>營運應付與資金</strong>：銷貨應付未核銷、支票到期與現金壓力（原「應付帳齡」）。
              <span className="mx-1.5 text-gray-300">｜</span>
              <strong>費用單應付（AP）</strong>：費用單狀態非「已完成」之欠款與發票帳齡。
            </p>

            {payablesSegment === 'operations' && (
              payablesLoading ? <Loading text="分析應付帳齡中..." /> :
              payables ? <PayablesTab data={payables} /> :
              <div className="text-center py-12 text-gray-400">無資料</div>
            )}

            {payablesSegment === 'expenseAp' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">館別篩選（選填）</label>
                    <select value={apAgingWarehouse} onChange={e => setApAgingWarehouse(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]">
                      <option value="">全部館別</option>
                      {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={fetchApAging} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                    套用並重新載入
                  </button>
                </div>
                {apAgingLoading ? <Loading text="分析費用單帳齡中..." /> :
                  apAging ? <ExpenseApAgingTab data={apAging} /> :
                  <div className="text-center py-12 text-gray-400">無資料</div>
                }
              </>
            )}
          </div>
        )}

        {/* ══ 月度報告 ═══════════════════════════════════════════ */}
        {activeTab === 'report' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">月份（YYYYMM）</label>
                  <input type="text" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                    placeholder="202506" maxLength={6}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <button onClick={fetchReport} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  載入報告
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500">變更月份後請按「載入報告」重新取得資料（僅切換分頁時會自動載入目前輸入之月份）。</p>
            </div>
            {reportLoading ? <Loading text="載入月度報告中..." /> :
              report ? <ReportTab data={report} onApprove={approveReport} approving={reportApproving} /> :
              <div className="text-center py-12 text-gray-400">無資料</div>
            }
          </div>
        )}

        {/* ══ 廠商採購明細 ════════════════════════════════════════ */}
        {activeTab === 'supplier-items' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">廠商</label>
                  <select value={spItemsSupplierId} onChange={e => setSpItemsSupplierId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[160px]">
                    <option value="">全部廠商</option>
                    {suppliersFullList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={spItemsStart} onChange={e => setSpItemsStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={spItemsEnd} onChange={e => setSpItemsEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select value={spItemsWarehouse} onChange={e => setSpItemsWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部館別</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <button onClick={fetchSpItems}
                  className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
            </div>

            {spItemsLoading ? <Loading text="載入採購明細中..." /> :
              spItems ? (
                <SupplierItemsTab
                  data={spItems}
                  filterMeta={{
                    supplierName: suppliersFullList.find(s => String(s.id) === String(spItemsSupplierId))?.name || '',
                    startDate: spItemsStart,
                    endDate: spItemsEnd,
                    warehouse: spItemsWarehouse,
                  }}
                />
              ) :
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-medium">請選擇廠商及日期區間後按「查詢」</p>
                <p className="text-xs mt-1">可查詢指定廠商在特定期間內的所有採購品項明細</p>
              </div>
            }
          </div>
        )}

        {/* ══ 住宿成本效益 ════════════════════════════════════════ */}
        {activeTab === 'occupancy-cost' && (
          <div className="space-y-5">
            {/* Filter bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input type="date" value={occCostStart} onChange={e => setOccCostStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={occCostEnd} onChange={e => setOccCostEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select value={occCostWarehouse} onChange={e => setOccCostWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">全部館別</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">採購分類（選填）</label>
                  <select value={occCostCategory} onChange={e => setOccCostCategory(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]">
                    <option value="">全部分類</option>
                    {(occCost?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={fetchOccCost}
                  className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                  查詢
                </button>
              </div>
              {occCost?.categories?.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  提示：選擇分類可分析特定品類的人均成本，例如「餐廳用品」→ 早餐食材成本
                </p>
              )}
            </div>

            {occCostLoading ? <Loading text="計算住宿成本效益中..." /> :
              occCost ? (
                <OccupancyCostTab data={occCost} filterMeta={{ start: occCostStart, end: occCostEnd, warehouse: occCostWarehouse, category: occCostCategory }} onRefetch={fetchOccCost} />
              ) :
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">🏨</p>
                <p className="font-medium">請設定日期區間後按「查詢」</p>
                <p className="text-xs mt-1">分析每日住宿間數、住宿人數、早餐人數與採購金額的對應關係</p>
              </div>
            }
          </div>
        )}

        {/* ══ 營運入住統計（PMS 量體）══════════════════════════════════ */}
        {activeTab === 'occupancy-stats' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                  <input
                    type="date"
                    value={occStatsStart}
                    onChange={(e) => setOccStatsStart(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input
                    type="date"
                    value={occStatsEnd}
                    onChange={(e) => setOccStatsEnd(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別（選填）</label>
                  <select
                    value={occStatsWarehouse}
                    onChange={(e) => setOccStatsWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
                  >
                    <option value="">全部館別（依日／月分列）</option>
                    {warehouses.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">彙總方式</label>
                  <select
                    value={occStatsGroupBy}
                    onChange={(e) => setOccStatsGroupBy(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    <option value="day">依日</option>
                    <option value="month">依月</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={fetchOccStats}
                  className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
                >
                  查詢
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                資料來源為 <strong>PMS 匯入批次</strong>（住宿人數、早餐人數、入住間數等）。此頁<strong>不含</strong>採購金額或成本；成本分析請用「住宿成本效益」。
              </p>
            </div>
            {occStatsLoading ? (
              <Loading text="載入營運入住統計..." />
            ) : occStatsPayload ? (
              <OccupancyStatsTab payload={occStatsPayload} />
            ) : (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">📊</p>
                <p className="font-medium">請設定日期區間後按「查詢」</p>
              </div>
            )}
          </div>
        )}

        {/* ══ 租賃 ROI ═══════════════════════════════════════════════ */}
        {activeTab === 'rental-roi' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">會計年度（西元）</label>
                <input
                  type="number"
                  value={rentalRoiYear}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setRentalRoiYear(Number.isFinite(v) ? v : new Date().getFullYear());
                  }}
                  min={2000}
                  max={2100}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
              <button type="button" onClick={fetchRentalRoi} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700">
                查詢
              </button>
              <Link href="/rentals" className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                前往租賃模組 →
              </Link>
            </div>
            <p className="text-xs text-gray-500 px-1">
              依租賃物件、合約月租與當年度每月租金收入紀錄，計算實收、預收與回收率等；無租賃資料時列表為空。
            </p>
            {rentalRoiLoading ? <Loading text="載入租賃 ROI..." /> :
              rentalRoiData ? <RentalRoiTab data={rentalRoiData} /> :
              <div className="text-center py-12 text-gray-400">請選擇年度後按「查詢」</div>
            }
          </div>
        )}

        {/* ══ 水電與住宿（年度樞紐）══════════════════════════════════ */}
        {activeTab === 'utility-occ' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select
                    value={utilOccWarehouse}
                    onChange={e => setUtilOccWarehouse(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 min-w-[140px]"
                  >
                    <option value="">請選擇</option>
                    {warehouses.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">年度（民國，與水電帳單一致）</label>
                  <input
                    type="number"
                    value={utilOccRocYear}
                    onChange={e => setUtilOccRocYear(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    placeholder="例：114"
                  />
                </div>
                <button
                  type="button"
                  onClick={fetchUtilityOccupancy}
                  className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700"
                >
                  查詢
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                將同館別、同民國年之<strong>水電帳單</strong>與 <strong>PMS 日匯入</strong>（住宿人數、入住間數）按月對齊。
                可比較「每人電費」「每入住間數電費」等指標；資料來源與「水電費 → 年度分析」相同，此處另加入營運量體。
              </p>
            </div>

            {utilOccLoading ? (
              <Loading text="載入水電與住宿資料..." />
            ) : utilOccData ? (
              <UtilityOccupancyPivot data={utilOccData} />
            ) : (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-100">
                <p className="text-3xl mb-3">⚡🏨</p>
                <p className="font-medium">請選擇館別與民國年後按「查詢」</p>
                <p className="text-xs mt-2 max-w-lg mx-auto text-gray-400">
                  須已上傳該年各月水電帳單，且 PMS 有匯入對應西元年（民國年 + 1911）之住宿批次。
                </p>
              </div>
            )}
          </div>
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
                  <thead className="bg-gray-50">
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

// ══ Sub-components ══════════════════════════════════════════════

function UtilityOccupancyPivot({ data }) {
  const months = data.months || [];
  const yt = data.yearTotals || {};
  const num = (v, opts) => {
    if (v == null || Number.isNaN(v)) return '—';
    const n = Number(v);
    if (opts?.decimals != null) return n.toLocaleString('zh-TW', { minimumFractionDigits: opts.decimals, maximumFractionDigits: opts.decimals });
    return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 });
  };

  const rows = [
    { key: 'elecAmount', label: '電費（元）', pick: (m) => m.elecAmount },
    { key: 'elecUsage', label: '電量（度）', pick: (m) => m.elecUsage },
    { key: 'waterAmount', label: '水費（元）', pick: (m) => m.waterAmount },
    { key: 'waterUsage', label: '水量（度）', pick: (m) => m.waterUsage },
    { key: 'guest', label: '住宿人數（PMS 月合計）', pick: (m) => m.guestCount },
    { key: 'occ', label: '入住間數（PMS 月合計）', pick: (m) => m.occupiedRooms },
    { key: 'epg', label: '每人負擔電費（元）', pick: (m) => m.elecPerGuest, decimals: 1 },
    { key: 'epo', label: '每入住間數電費（元）', pick: (m) => m.elecPerOccRoom, decimals: 1 },
    { key: 'eug', label: '每人用電（度）', pick: (m) => m.elecUsagePerGuest, decimals: 2 },
  ];

  const yearPick = {
    elecAmount: yt.elecAmount,
    elecUsage: yt.elecUsage,
    waterAmount: yt.waterAmount,
    waterUsage: yt.waterUsage,
    guest: yt.guestCount,
    occ: yt.occupiedRooms,
    epg: yt.elecPerGuest,
    epo: yt.elecPerOccRoom,
    eug: yt.guestCount > 0 ? yt.elecUsage / yt.guestCount : null,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">
          {data.warehouse}　民國 {data.rocYear} 年（西元 {data.adYear}）— 水電與住宿對照
        </h3>
        <Link
          href="/utility-bills"
          className="text-xs text-cyan-700 hover:underline"
        >
          前往水電費 → 年度分析
        </Link>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[920px]">
          <thead>
            <tr className="bg-cyan-700 text-white">
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-0 z-10 bg-cyan-700 min-w-[200px]">指標</th>
              {months.map((m) => (
                <th key={m.month} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {String(m.month).padStart(2, '0')} 月
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-l border-cyan-500 bg-cyan-800">全年</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r border-gray-100 font-medium">
                  {r.label}
                </td>
                {months.map((m) => (
                  <td key={m.month} className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                    {num(r.pick(m), { decimals: r.decimals })}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900 border-l border-gray-200 bg-gray-50/90">
                  {num(yearPick[r.key], { decimals: r.decimals })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.note && <p className="text-xs text-gray-400 px-1">{data.note}</p>}
    </div>
  );
}

function OverviewTab({ data, onTabSwitch }) {
  const rep = data.rep?.report || data.rep?.generated;
  const cash = data.cash;
  const pay = data.pay;

  const profit = rep?.profitAnalysis;
  const cashFlow = rep?.cashFlowAnalysis || cash;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="現金餘額"
          value={NT(cash?.currentCash ?? cashFlow?.currentBalance)}
          sub={cash?.riskLevel ? `風險：${cash.riskLevel}` : undefined}
          color={cash?.riskLevel === 'critical' ? 'text-red-600' : cash?.riskLevel === 'high' ? 'text-orange-600' : 'text-emerald-600'}
          icon="💰"
        />
        <KpiCard
          label="本月銷貨額"
          value={NT(profit?.totalSales)}
          sub="（採購 + PMS 收入）"
          color="text-blue-600"
          icon="📈"
        />
        <KpiCard
          label="本月採購額"
          value={NT(profit?.totalPurchase)}
          sub="（進貨支出）"
          color="text-gray-700"
          icon="🛒"
        />
        <KpiCard
          label="毛利率"
          value={pct(profit?.grossMargin)}
          sub={`目標 ${profit?.targetGrossMargin ?? 36}% | ${profit?.status === 'achieved' ? '✓ 達標' : '⚠ 未達標'}`}
          color={profit?.status === 'achieved' ? 'text-emerald-600' : 'text-red-500'}
          icon="📊"
        />
      </div>

      {/* Cash Flow Forecast quick view */}
      {cash && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>30 天現金流預測</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">當前現金</p>
              <p className="font-bold text-blue-700">{NT(cash.currentCash)}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">預計流入</p>
              <p className="font-bold text-green-700">+{NT(cash.totalExpectedInflow)}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">預計流出</p>
              <p className="font-bold text-red-700">-{NT(cash.totalExpectedOutflow)}</p>
            </div>
            <div className={`text-center p-3 rounded-lg ${cash.predictedBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500 mb-1">預測餘額</p>
              <p className={`font-bold ${cash.predictedBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{NT(cash.predictedBalance)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {riskBadge(cash.riskLevel)}
            <button onClick={() => onTabSwitch('cashflow')} className="text-xs text-cyan-600 hover:underline">
              查看詳細預測 →
            </button>
          </div>
        </div>
      )}

      {/* Payables quick view */}
      {pay && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>應付帳齡概況</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {(pay.buckets || []).map(b => (
              <div key={b.range} className={`p-3 rounded-lg border ${b.range === '90+' ? 'border-red-200 bg-red-50' : b.range === '60-90' ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs text-gray-500">{b.range} 天</p>
                <p className={`font-bold text-sm mt-1 ${b.range === '90+' ? 'text-red-700' : b.range === '60-90' ? 'text-orange-700' : 'text-gray-800'}`}>{NT(b.total)}</p>
                <p className="text-xs text-gray-400">{b.count} 筆 ({b.percentage}%)</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">應付總額：<strong>{NT(pay.totalUnpaid)}</strong></span>
            <button onClick={() => onTabSwitch('payables')} className="text-xs text-cyan-600 hover:underline">
              查看帳齡明細 →
            </button>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {rep?.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>優先行動建議</SectionTitle>
          <div className="space-y-3">
            {rep.recommendations.map((r, i) => (
              <div key={i} className="flex gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{r.priority}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-800">{r.action}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.description}</p>
                  <p className="text-xs text-amber-700 mt-1">預期影響：{r.expectedImpact}｜時程：{r.timeline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Executive summary */}
      {rep?.executiveSummary && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
          <span className="font-semibold text-gray-900 mr-2">執行摘要</span>
          {rep.executiveSummary}
        </div>
      )}
    </div>
  );
}

function PnlTab({ data, onTrace }) {
  const warehouses = data.byWarehouse || [];
  const totals = warehouses.reduce((acc, w) => ({
    income: acc.income + w.totalIncome,
    expense: acc.expense + w.totalExpense,
    net: acc.net + w.netProfit,
  }), { income: 0, expense: 0, net: 0 });

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="總收入" value={NT(totals.income)} color="text-blue-600" icon="📥" />
        <KpiCard label="總支出" value={NT(totals.expense)} color="text-red-500" icon="📤" />
        <KpiCard label="淨損益" value={NT(totals.net)} color={totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'} icon="⚖️" />
      </div>

      {warehouses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">此期間無現金流資料</div>
      ) : warehouses.map(w => (
        <div key={w.warehouse} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Warehouse header */}
          <div className="px-5 py-3 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-gray-800">{w.warehouse}</h4>
            <div className="flex gap-6 text-sm">
              <span className="text-blue-600">收入 {NT(w.totalIncome)}</span>
              <span className="text-red-500">支出 {NT(w.totalExpense)}</span>
              <span className={`font-bold ${w.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                淨損益 {NT(w.netProfit)}
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Income */}
            <div className="p-4">
              <p className="text-xs font-semibold text-blue-600 mb-2">收入明細</p>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-50">
                  {w.incomeBySubject.map((item, i) => (
                    <tr key={i} className="hover:bg-blue-50/40 cursor-pointer" onClick={() => onTrace({ warehouseLabel: w.warehouse, flowType: 'income', subjectKey: item.subjectKey, subjectName: item.subject?.name })}>
                      <td className="py-1.5 text-gray-600">{item.subject?.name || item.subjectKey}</td>
                      <td className="py-1.5 text-right font-medium text-blue-700">{NT(item.amount)}</td>
                      <td className="py-1.5 pl-2 w-24">
                        <Bar value={item.amount} max={w.totalIncome} color="bg-blue-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-700">合計</td>
                    <td className="py-1.5 text-right text-blue-700">{NT(w.totalIncome)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Expense */}
            <div className="p-4">
              <p className="text-xs font-semibold text-red-500 mb-2">支出明細</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="py-1 text-left font-normal">廠商</th>
                    <th className="py-1 text-left font-normal">會計科目</th>
                    <th className="py-1 text-left font-normal">內容</th>
                    <th className="py-1 text-right font-normal">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {w.expenseBySubject.flatMap((item, i) =>
                    (item.items && item.items.length > 0 ? item.items : [{ supplierName: '', accountingSubjectName: item.subject?.name || item.subjectKey, description: '', amount: item.amount }]).map((tx, j) => (
                      <tr key={`${i}-${j}`} className="hover:bg-red-50/40 cursor-pointer" onClick={() => onTrace({ warehouseLabel: w.warehouse, flowType: 'expense', subjectKey: item.subjectKey, subjectName: item.subject?.name })}>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.supplierName || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.accountingSubjectName || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-gray-600 pr-2">{tx.description || <span className="text-gray-300">—</span>}</td>
                        <td className="py-1.5 text-right font-medium text-red-600 whitespace-nowrap">{NT(tx.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1.5 text-gray-700" colSpan={3}>合計</td>
                    <td className="py-1.5 text-right text-red-600">{NT(w.totalExpense)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-400 text-right">點擊各科目列可查看現金流明細</p>
    </div>
  );
}

function CashflowTab({ data }) {
  const riskColor = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-orange-600', critical: 'text-red-600' };
  const scenarioBg = { optimistic: 'bg-green-50 border-green-200', risk: 'bg-amber-50 border-amber-200', crisis: 'bg-red-50 border-red-200' };
  const scenarioColor = { optimistic: 'text-green-700', risk: 'text-amber-700', crisis: 'text-red-700' };

  return (
    <div className="space-y-5">
      {/* Main KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="當前現金餘額" value={NT(data.currentCash)} color="text-blue-600" icon="💰" />
        <KpiCard label="預計流入" value={NT(data.totalExpectedInflow)} color="text-emerald-600" icon="⬇️"
          sub={`${(data.inflows?.checks?.length || 0)} 張支票 + ${(data.inflows?.rentals?.length || 0)} 筆租金`} />
        <KpiCard label="預計流出" value={NT(data.totalExpectedOutflow)} color="text-red-500" icon="⬆️"
          sub={`${(data.outflows?.checks?.length || 0)} 張支票 + ${(data.outflows?.loans?.length || 0)} 筆貸款`} />
        <KpiCard label="預測餘額" value={NT(data.predictedBalance)}
          color={data.predictedBalance >= 0 ? 'text-emerald-600' : 'text-red-600'} icon="📊"
          sub={<span className={riskColor[data.riskLevel]}>{riskBadge(data.riskLevel)}</span>} />
      </div>

      {/* Scenarios */}
      <div>
        <SectionTitle>情境模擬</SectionTitle>
        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(data.scenarios || {}).map(([key, s]) => (
            <div key={key} className={`rounded-xl border p-4 ${scenarioBg[key]}`}>
              <p className={`font-semibold text-sm mb-1 ${scenarioColor[key]}`}>{s.label}</p>
              <p className={`text-xl font-bold ${scenarioColor[key]}`}>{NT(s.predictedBalance)}</p>
              <p className="text-xs text-gray-500 mt-1">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Outflows detail */}
      {data.outflows?.checks?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">到期支票（應付）— {data.outflows.checks.length} 張</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">到期日</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">收款人</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.outflows.checks.slice(0, 10).map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{c.dueDate}</td>
                  <td className="px-4 py-2">{c.payeeName || '—'}</td>
                  <td className="px-4 py-2 text-right text-red-600 font-medium">{NT(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.outflows.checks.length > 10 && (
            <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50">僅顯示前 10 筆，共 {data.outflows.checks.length} 筆</div>
          )}
        </div>
      )}

      {/* Inflows detail */}
      {data.inflows?.rentals?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-green-50">
            <p className="font-semibold text-sm text-green-700">待收租金 — {data.inflows.rentals.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">到期日</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.inflows.rentals.slice(0, 10).map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{r.dueDate}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-medium">{NT(r.expectedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loan repayments */}
      {data.outflows?.loans?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-orange-50">
            <p className="font-semibold text-sm text-orange-700">貸款月繳 — {data.outflows.loans.length} 筆</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">貸款名稱</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">月繳金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.outflows.loans.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{l.loanName}</td>
                  <td className="px-4 py-2 text-right text-orange-600 font-medium">{NT(l.monthlyPayment)}</td>
                </tr>
              ))}
              <tr className="bg-orange-50 font-semibold">
                <td className="px-4 py-2 text-right text-xs text-gray-600">合計</td>
                <td className="px-4 py-2 text-right text-orange-700">
                  {NT(data.outflows.loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProcurementTab({ data }) {
  const maxAmt = data.suppliers?.[0]?.amount || 1;
  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="採購總額" value={NT(data.totalAmount)} color="text-gray-800" icon="🛒" />
        <KpiCard label="供應商數量" value={data.supplierCount ?? 0} color="text-blue-600" icon="🏢"
          sub={`建議 ≥ 15 家`} />
        <KpiCard label="Top 1 集中度" value={pct(data.top1Concentration)}
          color={(data.top1Concentration || 0) > 20 ? 'text-red-600' : 'text-emerald-600'} icon="⚠️"
          sub="門檻 20%" />
        <KpiCard label="Top 3 集中度" value={pct(data.top3Concentration)}
          color={(data.top3Concentration || 0) > 50 ? 'text-orange-600' : 'text-emerald-600'} icon="📋"
          sub={`HHI: ${(data.hhiIndex || 0).toFixed(4)}`} />
      </div>

      {/* Risk alerts */}
      {data.risks?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 mb-2">風險警示</p>
          {data.risks.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${r.severity === 'high' ? 'bg-red-100 text-red-700' : r.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.severity}</span>
              <p className="text-sm text-amber-700">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Supplier breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">供應商採購佔比</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">排名</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">供應商</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">採購金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">佔比</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.suppliers || []).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{s.supplierName}</td>
                <td className="px-4 py-2 text-right">{NT(s.amount)}</td>
                <td className={`px-4 py-2 text-right font-medium ${Number(s.percentage) > 20 ? 'text-red-600' : Number(s.percentage) > 10 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {pct(s.percentage)}
                </td>
                <td className="px-4 py-2">
                  <Bar value={s.amount} max={maxAmt} color={Number(s.percentage) > 20 ? 'bg-red-400' : 'bg-cyan-400'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayablesTab({ data }) {
  const AGING_COLORS = { '0-30': 'text-gray-700 bg-gray-50', '30-60': 'text-amber-700 bg-amber-50', '60-90': 'text-orange-700 bg-orange-50', '90+': 'text-red-700 bg-red-50' };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="未核銷總額" value={NT(data.totalUnpaid)} color="text-gray-800" icon="📋" />
        <KpiCard label="當前現金餘額" value={NT(data.currentCash)} color="text-blue-600" icon="💰" />
        <KpiCard label="風險等級" value={data.riskLevel === 'high' ? '高風險' : data.riskLevel === 'medium' ? '中風險' : '低風險'}
          color={data.riskLevel === 'high' ? 'text-red-600' : data.riskLevel === 'medium' ? 'text-amber-600' : 'text-green-600'} icon="⚠️" />
      </div>

      {/* Aging buckets */}
      <div>
        <SectionTitle>帳齡分佈</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data.buckets || []).map(b => (
            <div key={b.range} className={`rounded-xl border p-4 ${AGING_COLORS[b.range] || 'bg-gray-50'}`}>
              <p className="text-xs font-medium opacity-70 mb-1">{b.range} 天</p>
              <p className="text-xl font-bold">{NT(b.total)}</p>
              <p className="text-xs opacity-60 mt-1">{b.count} 筆 — {b.percentage}%</p>
              <div className="mt-2 bg-white/60 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-current opacity-40" style={{ width: `${Math.min(100, b.percentage)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cash pressure */}
      {data.cashPressure?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>資金壓力預測</SectionTitle>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">期間</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">到期支出</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">預測餘額</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">資金充足率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.cashPressure.map((p, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{p.days} 天內</td>
                  <td className="px-4 py-2 text-right text-red-500">{NT(p.pendingOutflow)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${p.predictedBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{NT(p.predictedBalance)}</td>
                  <td className={`px-4 py-2 text-right ${p.sufficiency < 50 ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>{p.sufficiency}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* High risk overdue */}
      {data.overdueHighRisk?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50">
            <p className="font-semibold text-sm text-red-700">高風險逾期項目（超過 60 天 & 金額 &gt; 50,000）</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">客戶</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">發票日</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">逾期天數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.overdueHighRisk.map((r, i) => (
                <tr key={i} className="hover:bg-red-50/30">
                  <td className="px-4 py-2 font-medium">{r.supplierName || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.invoiceDate}</td>
                  <td className="px-4 py-2 text-right text-red-600 font-semibold">{r.daysOutstanding} 天</td>
                  <td className="px-4 py-2 text-right text-red-600 font-bold">{NT(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PnlSummaryTab({ data }) {
  const s = data.summary || {};
  const monthly = data.monthly || [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="PMS 收入（貸方）" value={NT(s.revenue)} color="text-blue-700" icon="📈" />
        <KpiCard label="進貨成本（已扣折讓）" value={NT(s.cogs)} color="text-amber-700" icon="📦" />
        <KpiCard label="進貨折讓合計" value={NT(s.allowances)} color="text-gray-600" icon="↩️" />
        <KpiCard label="費用" value={NT(s.expenses)} color="text-orange-700" icon="🧾" />
        <KpiCard label="毛利" value={NT(s.grossProfit)} color={s.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'} icon="◆" />
        <KpiCard label="淨利" value={NT(s.netProfit)} color={s.netProfit >= 0 ? 'text-cyan-700' : 'text-red-600'} icon="✓" />
      </div>
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">月度彙總</p>
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">月份</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">收入</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">進貨成本</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">折讓</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">費用</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">毛利</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">淨利</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map((m) => (
                  <tr key={m.month} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{m.month}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.cogs)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{NT(m.allowances)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{NT(m.expenses)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{NT(m.grossProfit)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.netProfit >= 0 ? 'text-cyan-700' : 'text-red-600'}`}>{NT(m.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RentalRoiTab({ data }) {
  const sum = data.summary || {};
  const rows = data.properties || [];
  const year = data.year;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="物件數" value={String(sum.totalProperties ?? 0)} color="text-gray-800" icon="🏠" />
        <KpiCard label={`${year} 實收合計`} value={NT(sum.totalIncome)} color="text-emerald-700" icon="💰" />
        <KpiCard label={`${year} 應收合計`} value={NT(sum.totalExpected)} color="text-blue-700" icon="📋" />
        <KpiCard label="整體回收率" value={pct(sum.overallCollectionRate)} color="text-indigo-700" icon="📊" />
        <KpiCard label="平均 ROI（有月租者）" value={pct(sum.avgRoi)} color="text-cyan-700" icon="📐" />
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">各物件（{year} 年）</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">物件</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">地址／單位</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">月租</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">實收</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">應收</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">ROI</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">回收率</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">尚無租賃物件或收入資料</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.name || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-[220px]">
                    {[r.buildingName, r.unitNo, r.address].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{NT(r.monthlyRent)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{NT(r.totalIncome)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{NT(r.expectedIncome)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{pct(r.roi)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct(r.collectionRate)}</td>
                  <td className="px-4 py-2 text-center text-xs text-gray-600">{r.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProcurementVsBreakfastTab({ data }) {
  const pi = data.productInfo;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="年月" value={data.yearMonth || '—'} color="text-gray-800" icon="📅" sub={`館別：${data.warehouse || '全部'}`} />
        <KpiCard label="當月早餐人數（PMS）" value={(data.totalBreakfastCount ?? 0).toLocaleString()} color="text-amber-700" icon="🍳" />
        <KpiCard label="住宿人數（PMS）" value={(data.totalGuestCount ?? 0).toLocaleString()} color="text-blue-700" icon="👥" />
        <KpiCard label="入住間數（PMS）" value={(data.totalOccupiedRooms ?? 0).toLocaleString()} color="text-cyan-700" icon="🛏" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="品項進貨數量"
          value={data.totalProcurementQty != null ? Number(data.totalProcurementQty).toLocaleString() : '—'}
          color="text-gray-800"
          icon="📦"
          sub={pi ? `${pi.name || ''}${pi.unit ? `（${pi.unit}）` : ''}` : '請輸入關鍵字以匯總進貨明細'}
        />
        <KpiCard label="品項進貨金額" value={NT(data.totalProcurementAmount)} color="text-emerald-700" icon="💵" />
        <KpiCard
          label="每人早餐耗用量（數量）"
          value={data.perBreakfastQty != null ? String(data.perBreakfastQty) : '—'}
          color="text-indigo-700"
          icon="📐"
          sub="進貨數量 ÷ 早餐人數"
        />
        <KpiCard
          label="每人早餐耗用金額"
          value={data.perBreakfastAmount != null ? NT(data.perBreakfastAmount) : '—'}
          color="text-violet-700"
          icon="💹"
          sub="進貨金額 ÷ 早餐人數"
        />
      </div>
      {pi && (
        <p className="text-xs text-gray-500 px-1">
          對應品項：{pi.code ? `${pi.code} ` : ''}{pi.name || '—'}（ID {pi.id}）
        </p>
      )}
    </div>
  );
}

function OccupancyStatsTab({ payload }) {
  const { groupBy, data } = payload || {};
  if (!data || !Array.isArray(data)) {
    return <div className="text-center py-10 text-gray-400">無資料</div>;
  }

  if (groupBy === 'month') {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">依月彙總</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500">年月</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">住宿人數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">早餐人數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">入住間數</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">總房數累計</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">天數列數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, i) => (
                <tr key={`${row.warehouse}-${row.yearMonth}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{row.warehouse || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{row.yearMonth}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.guestCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.breakfastCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.occupiedRooms || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.roomCount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{row.dayCount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
        <p className="font-semibold text-sm text-gray-700">依日明細</p>
        <p className="text-xs text-gray-400">共 {data.length} 筆批次</p>
      </div>
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">營業日</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">住宿人數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">早餐</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">入住間數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">總房數</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">住房率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, i) => (
              <tr key={`${row.warehouse}-${row.businessDate}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{row.warehouse || '—'}</td>
                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{row.businessDate || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.guestCount != null ? Number(row.guestCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.breakfastCount != null ? Number(row.breakfastCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.occupiedRooms != null ? Number(row.occupiedRooms).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.roomCount != null ? Number(row.roomCount).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {row.occupancyRate != null ? `${Number(row.occupancyRate).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenseApAgingTab({ data }) {
  const bucketCls = [
    'text-gray-700 bg-gray-50 border-gray-100',
    'text-amber-700 bg-amber-50 border-amber-100',
    'text-orange-700 bg-orange-50 border-orange-100',
    'text-red-700 bg-red-50 border-red-100',
  ];
  const totalAmt = data.totalUnpaid || 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="費用單未結總額" value={NT(data.totalUnpaid)} color="text-gray-800" icon="📋" />
        <KpiCard label="筆數" value={`${data.totalCount ?? 0} 筆`} color="text-cyan-700" icon="📑" />
      </div>
      <div>
        <SectionTitle>帳齡分佈（由發票日起算）</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data.buckets || []).map((b, i) => {
            const pct = totalAmt > 0 ? ((b.amount / totalAmt) * 100).toFixed(1) : '0';
            return (
              <div key={b.range} className={`rounded-xl border p-4 ${bucketCls[i] || bucketCls[0]}`}>
                <p className="text-xs font-medium opacity-80 mb-1">{b.range}</p>
                <p className="text-xl font-bold">{NT(b.amount)}</p>
                <p className="text-xs opacity-70 mt-1">{b.count} 筆 — {pct}%</p>
              </div>
            );
          })}
        </div>
      </div>
      {(data.topUnpaid || []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">金額前 20 筆（未結費用單）</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">發票／單號</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">發票日</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">廠商</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500">館別</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500">帳齡（天）</th>
                  <th className="px-4 py-2 text-center text-xs text-gray-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.topUnpaid.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{row.invoiceNo || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.invoiceDate || '—'}</td>
                    <td className="px-4 py-2">{row.supplierName || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{row.warehouse || '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{NT(row.amount)}</td>
                    <td className="px-4 py-2 text-right text-amber-700 font-medium">{row.daysOutstanding}</td>
                    <td className="px-4 py-2 text-center text-xs text-gray-500">{row.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProcurementStructureTab({ data }) {
  const maxSupp = data.topSuppliers?.[0]?.amount || 1;
  const maxCat = data.categoryBreakdown?.[0]?.amount || 1;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="進貨總額（期間）" value={NT(data.totalAmount)} color="text-gray-800" icon="🛒" />
        <KpiCard label="進貨單筆數" value={`${data.totalOrders ?? 0} 筆`} color="text-blue-600" icon="📦" />
        <KpiCard label="前三大廠商集中度" value={pct(data.concentration)} color="text-indigo-700" icon="📊" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">前十大供應商（依進貨金額）</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">排名</th>
              <th className="px-4 py-2 text-left text-xs text-gray-500">供應商</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">佔比</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">單據數</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.topSuppliers || []).map((s, i) => (
              <tr key={s.supplierId ?? i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 text-right">{NT(s.amount)}</td>
                <td className="px-4 py-2 text-right">{pct(s.percentage)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{s.count}</td>
                <td className="px-4 py-2"><Bar value={s.amount} max={maxSupp} color="bg-cyan-500" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <p className="font-semibold text-sm text-gray-700">品類金額結構（依明細列計）</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">品類</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">占進貨額</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500">明細列數</th>
              <th className="px-4 py-2 w-32 text-xs text-gray-500">分布</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data.categoryBreakdown || []).map((c) => (
              <tr key={c.category} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{c.category}</td>
                <td className="px-4 py-2 text-right">{NT(c.amount)}</td>
                <td className="px-4 py-2 text-right">{pct(c.percentage)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{c.count}</td>
                <td className="px-4 py-2"><Bar value={c.amount} max={maxCat} color="bg-indigo-400" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(data.monthlyTrend || []).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-semibold text-sm text-gray-700">月度進貨趨勢（依進貨單日期）</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-500">月份</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
                <th className="px-4 py-2 text-right text-xs text-gray-500">單據數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.monthlyTrend.map((m) => (
                <tr key={m.month} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{m.month}</td>
                  <td className="px-4 py-2 text-right">{NT(m.amount)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportTab({ data, onApprove, approving }) {
  const r = data.report || data.generated;
  if (!r) return <div className="text-center py-12 text-gray-400">此月份尚無報告資料</div>;

  const isLive = !data.report;
  const profit = r.profitAnalysis || {};
  const risk = r.riskAnalysis || {};
  const cashFlow = r.cashFlowAnalysis || {};

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${isLive ? 'bg-blue-50 border-blue-200' : r.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
        <div>
          <p className="font-semibold text-gray-800">{r.reportYear} 年 {r.reportMonth} 月 月度報告</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLive ? '即時預覽（月結後可正式核准）' : r.status === 'approved' ? `已核准 — ${r.approvedBy} 於 ${new Date(r.approvedAt).toLocaleDateString('zh-TW')}` : '待核准'}
          </p>
        </div>
        {!isLive && r.status !== 'approved' && (
          <button onClick={onApprove} disabled={approving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
            {approving ? '核准中...' : '核准報告'}
          </button>
        )}
      </div>

      {/* Executive summary */}
      {r.executiveSummary && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>執行摘要</SectionTitle>
          <p className="text-sm text-gray-700 leading-relaxed">{r.executiveSummary}</p>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="銷貨額" value={NT(profit.totalSales)} color="text-blue-600" icon="📈" />
        <KpiCard label="採購額" value={NT(profit.totalPurchase)} color="text-gray-700" icon="🛒" />
        <KpiCard label="毛利率" value={pct(profit.grossMargin)}
          color={profit.status === 'achieved' ? 'text-emerald-600' : 'text-red-500'} icon="📊"
          sub={`目標 ${profit.targetGrossMargin}%`} />
        <KpiCard label="現金餘額" value={NT(cashFlow.currentBalance)}
          color={cashFlow.currentBalance > 100000 ? 'text-emerald-600' : 'text-orange-600'} icon="💰" />
      </div>

      {/* Risk analysis */}
      {risk.supplierConcentration && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>風險分析</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">供應商集中度</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Top 1 供應商佔比</span><span className={`font-medium ${risk.supplierConcentration.top1Percentage > 20 ? 'text-red-600' : 'text-gray-700'}`}>{pct(risk.supplierConcentration.top1Percentage)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Top 3 供應商佔比</span><span className={`font-medium ${risk.supplierConcentration.top3Percentage > 50 ? 'text-orange-600' : 'text-gray-700'}`}>{pct(risk.supplierConcentration.top3Percentage)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">供應商數量</span><span className="font-medium">{risk.supplierConcentration.supplierCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">集中度風險</span>{riskBadge(risk.supplierConcentration.riskLevel)}</div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-3">現金風險</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">當前現金</span><span className="font-medium">{NT(risk.cashShortage?.currentCash)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">風險等級</span>{riskBadge(risk.cashShortage?.riskLevel)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {r.recommendations?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <SectionTitle>改善建議</SectionTitle>
          <div className="space-y-3">
            {r.recommendations.map((rec, i) => (
              <div key={i} className="flex gap-3 p-3 border border-amber-100 bg-amber-50 rounded-lg">
                <span className="flex-shrink-0 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">{rec.priority}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-800">{rec.action}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{rec.description}</p>
                  <p className="text-xs text-amber-700 mt-1">預期影響：{rec.expectedImpact}｜時程：{rec.timeline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══ SupplierPnlTab ═══════════════════════════════════════════════
function SupplierPnlTab({ data, search }) {
  const { rows = [], summary = {} } = data;
  const maxCost = rows[0]?.totalCost || 1;

  const filtered = search.trim()
    ? rows.filter(r => r.supplierName.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="廠商數量"   value={summary.supplierCount ?? 0} icon="🏢" color="text-blue-600" />
        <KpiCard label="採購總額"   value={NT(summary.totalPurchases)}  icon="🛒" color="text-gray-700" />
        <KpiCard label="退貨總額"   value={NT(summary.totalAllowances)} icon="↩" color="text-orange-600" />
        <KpiCard label="淨採購額"   value={NT(summary.totalNetPurchases)} icon="📦" color="text-cyan-700" />
        <KpiCard label="費用總額"   value={NT(summary.totalExpenses)}   icon="💸" color="text-red-600" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            廠商損益明細（共 {filtered.length} 筆{search.trim() ? '，已篩選' : ''}）
          </p>
          <p className="text-xs text-gray-400">依總支出降序排列</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-8">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">廠商名稱</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">採購金額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">退貨金額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">淨採購額</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">費用</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-32">總支出</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-40">佔比</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r, i) => (
                <tr key={r.supplierId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.supplierName}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-600">{NT(r.purchases)}</td>
                  <td className="px-4 py-2 text-right font-mono text-orange-600">
                    {r.allowances > 0 ? `-${NT(r.allowances)}` : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-cyan-700">{NT(r.netPurchases)}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-600">
                    {r.expenses > 0 ? NT(r.expenses) : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">{NT(r.totalCost)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-cyan-500 h-2 rounded-full" style={{ width: `${Math.min(100, (r.totalCost / maxCost) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">
                        {summary.totalCost > 0 ? `${((r.totalCost / summary.totalCost) * 100).toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">無符合條件的廠商資料</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold text-sm">
              <tr>
                <td className="px-4 py-2" />
                <td className="px-4 py-2 text-gray-700">合計</td>
                <td className="px-4 py-2 text-right font-mono">{NT(filtered.reduce((s,r)=>s+r.purchases,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-orange-600">{NT(filtered.reduce((s,r)=>s+r.allowances,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-cyan-700">{NT(filtered.reduce((s,r)=>s+r.netPurchases,0))}</td>
                <td className="px-4 py-2 text-right font-mono text-red-600">{NT(filtered.reduce((s,r)=>s+r.expenses,0))}</td>
                <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">{NT(filtered.reduce((s,r)=>s+r.totalCost,0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══ SupplierItemsTab ════════════════════════════════════════════
function SupplierItemsTab({ data, filterMeta }) {
  const { rows = [], totalAmount = 0, totalQty = 0 } = data;
  const [viewMode, setViewMode] = useState('detail'); // 'detail' | 'monthly'

  // ── Monthly pivot: 廠商 × 月份 ────────────────────────────────
  const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

  const monthlyPivot = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const m = parseInt(r.purchaseDate.slice(5, 7), 10);
      if (!map.has(r.supplierName)) {
        map.set(r.supplierName, { 1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0,10:0,11:0,12:0 });
      }
      map.get(r.supplierName)[m] += r.subtotal;
    }
    return Array.from(map.entries())
      .map(([name, months]) => ({
        supplierName: name,
        months,
        total: Object.values(months).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  // Column totals for monthly view footer
  const monthlyColTotals = useMemo(() =>
    MONTHS.reduce((acc, m) => {
      acc[m] = monthlyPivot.reduce((s, r) => s + r.months[m], 0);
      return acc;
    }, {}),
  [monthlyPivot]);

  // ── Export configs ─────────────────────────────────────────────
  const DETAIL_EXPORT_COLS = [
    { header: '日期',     key: 'purchaseDate', width: 14 },
    { header: '進貨單號', key: 'purchaseNo',   width: 22 },
    { header: '館別',     key: 'warehouse',    width: 12 },
    { header: '部門',     key: 'department',   width: 12 },
    { header: '廠商',     key: 'supplierName', width: 22 },
    { header: '品號',     key: 'productCode',  width: 16 },
    { header: '品名',     key: 'productName',  width: 32 },
    { header: '分類',     key: 'category',     width: 14 },
    { header: '單位',     key: 'unit',         width: 8  },
    { header: '數量',     key: 'quantity',     width: 8,  format: 'number'   },
    { header: '單價',     key: 'unitPrice',    width: 14, format: 'currency' },
    { header: '小計',     key: 'subtotal',     width: 16, format: 'currency' },
    { header: '備註',     key: 'note',         width: 24 },
  ];

  const MONTHLY_EXPORT_COLS = [
    { header: '廠商', key: 'supplierName', width: 22 },
    ...MONTHS.map(m => ({ header: `${m}月`, key: `m${m}`, width: 12, format: 'currency' })),
    { header: '合計', key: 'total', width: 14, format: 'currency' },
  ];

  const monthlyExportData = useMemo(() =>
    monthlyPivot.map(r => ({
      supplierName: r.supplierName,
      ...MONTHS.reduce((acc, m) => { acc[`m${m}`] = r.months[m] || 0; return acc; }, {}),
      total: r.total,
    })),
  [monthlyPivot]);

  const titleLabel = filterMeta.supplierName
    ? `廠商採購明細 — ${filterMeta.supplierName}`
    : '廠商採購明細（全部廠商）';

  // ── Print: detail view ─────────────────────────────────────────
  function handlePrintDetail() {
    const periodLabel = `${filterMeta.startDate} ～ ${filterMeta.endDate}${filterMeta.warehouse ? ` ／ ${filterMeta.warehouse}` : ''}`;
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.purchaseDate}</td><td>${r.purchaseNo}</td><td>${r.warehouse || ''}</td>
        <td>${r.supplierName}</td><td>${r.productCode}</td><td>${r.productName}</td>
        <td>${r.category || ''}</td><td>${r.unit || ''}</td>
        <td style="text-align:right">${r.quantity.toLocaleString()}</td>
        <td style="text-align:right">NT$ ${Number(r.unitPrice).toLocaleString()}</td>
        <td style="text-align:right">NT$ ${Number(r.subtotal).toLocaleString()}</td>
        <td>${r.note || ''}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel}</title>
<style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:12px}.summary{display:flex;gap:24px;margin-bottom:14px}.kpi{border:1px solid #ddd;border-radius:6px;padding:8px 16px}.kpi-label{font-size:10px;color:#888}.kpi-val{font-size:14px;font-weight:bold}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 7px;white-space:nowrap}th{background:#f5f5f5}tfoot td{background:#f0f0f0;font-weight:bold}@page{size:landscape;margin:15mm}</style>
</head><body>
<h2>${titleLabel}</h2>
<p class="meta">查詢期間：${periodLabel} ／ 列印時間：${new Date().toLocaleString('zh-TW')}</p>
<div class="summary">
  <div class="kpi"><div class="kpi-label">品項筆數</div><div class="kpi-val">${rows.length.toLocaleString()}</div></div>
  <div class="kpi"><div class="kpi-label">總數量</div><div class="kpi-val">${totalQty.toLocaleString()}</div></div>
  <div class="kpi"><div class="kpi-label">採購總金額</div><div class="kpi-val">NT$ ${Number(totalAmount).toLocaleString()}</div></div>
</div>
<table><thead><tr><th>日期</th><th>進貨單號</th><th>館別</th><th>廠商</th><th>品號</th><th>品名</th><th>分類</th><th>單位</th><th>數量</th><th>單價</th><th>小計</th><th>備註</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr><td colspan="8" style="text-align:right">合計</td><td style="text-align:right">${totalQty.toLocaleString()}</td><td></td><td style="text-align:right">NT$ ${Number(totalAmount).toLocaleString()}</td><td></td></tr></tfoot>
</table></body></html>`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  // ── Print: monthly pivot view ──────────────────────────────────
  function handlePrintMonthly() {
    const periodLabel = `${filterMeta.startDate} ～ ${filterMeta.endDate}${filterMeta.warehouse ? ` ／ ${filterMeta.warehouse}` : ''}`;
    const bodyRows = monthlyPivot.map(r => `
      <tr>
        <td>${r.supplierName}</td>
        ${MONTHS.map(m => `<td style="text-align:right">${r.months[m] ? Number(r.months[m]).toLocaleString() : ''}</td>`).join('')}
        <td style="text-align:right;font-weight:bold">${Number(r.total).toLocaleString()}</td>
      </tr>`).join('');
    const footRow = `<tr>
      <td style="font-weight:bold">合計</td>
      ${MONTHS.map(m => `<td style="text-align:right;font-weight:bold">${monthlyColTotals[m] ? Number(monthlyColTotals[m]).toLocaleString() : ''}</td>`).join('')}
      <td style="text-align:right;font-weight:bold">${Number(totalAmount).toLocaleString()}</td>
    </tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel} — 月份彙整</title>
<style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;white-space:nowrap}th{background:#f5f5f5;text-align:center}tfoot td{background:#f0f0f0}@page{size:landscape;margin:12mm}</style>
</head><body>
<h2>${titleLabel} — 月份採購金額彙整</h2>
<p class="meta">查詢期間：${periodLabel} ／ 共 ${monthlyPivot.length} 家廠商 ／ 列印時間：${new Date().toLocaleString('zh-TW')}</p>
<table>
<thead><tr><th>廠商／月份</th>${MONTHS.map(m=>`<th>${m}月</th>`).join('')}<th>合計</th></tr></thead>
<tbody>${bodyRows}</tbody>
<tfoot>${footRow}</tfoot>
</table></body></html>`;
    const win = window.open('', '_blank', 'width=1400,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const isMonthly = viewMode === 'monthly';

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="品項筆數"   value={rows.length.toLocaleString()} icon="📋" color="text-blue-600" />
        <KpiCard label="總數量"     value={totalQty.toLocaleString()}    icon="📦" color="text-gray-700" />
        <KpiCard label="採購總金額" value={NT(totalAmount)}               icon="💰" color="text-cyan-700" />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('detail')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              明細清單
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              月份彙整
            </button>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={isMonthly ? handlePrintMonthly : handlePrintDetail}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              列印
            </button>
            <ExportButtons
              data={isMonthly ? monthlyExportData : rows}
              columns={isMonthly ? MONTHLY_EXPORT_COLS : DETAIL_EXPORT_COLS}
              title={isMonthly ? `${titleLabel} — 月份彙整` : titleLabel}
              exportName={isMonthly ? '廠商月份採購彙整' : '廠商採購明細'}
              sheetName={isMonthly ? '月份彙整' : '採購明細'}
            />
          </div>
        </div>

        {/* ── Detail view ─────────────────────────────────────── */}
        {!isMonthly && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日期</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">進貨單號</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">館別</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">廠商</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">品號</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">品名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">分類</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">單位</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">數量</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">單價</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap">小計</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.purchaseDate}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{r.purchaseNo}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.warehouse || '—'}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{r.supplierName}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400 whitespace-nowrap">{r.productCode || '—'}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.productName}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{r.category || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{r.unit || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{r.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{NT(r.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900 whitespace-nowrap">{NT(r.subtotal)}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs max-w-[160px] truncate">{r.note || '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">查無符合條件的採購記錄</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold text-sm">
                  <tr>
                    <td colSpan={8} className="px-3 py-2.5 text-right text-gray-700">合計</td>
                    <td className="px-3 py-2.5 text-right text-gray-900">{totalQty.toLocaleString()}</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-cyan-700">{NT(totalAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* ── Monthly pivot view ──────────────────────────────── */}
        {isMonthly && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                    廠商／月份
                  </th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap min-w-[80px]">
                      {m}月
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap bg-cyan-50">
                    合計
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyPivot.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white z-10">
                      {r.supplierName}
                    </td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        {r.months[m] > 0 ? Number(r.months[m]).toLocaleString() : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-bold text-cyan-700 whitespace-nowrap tabular-nums bg-cyan-50">
                      {Number(r.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {monthlyPivot.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">查無符合條件的採購記錄</td></tr>
                )}
              </tbody>
              {monthlyPivot.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">合計</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                        {monthlyColTotals[m] > 0 ? Number(monthlyColTotals[m]).toLocaleString() : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold text-cyan-700 tabular-nums whitespace-nowrap bg-cyan-50">
                      {Number(totalAmount).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══ OccupancyCostTab ════════════════════════════════════════════
function OccupancyCostTab({ data, filterMeta }) {
  const { rows = [] } = data;
  const [viewMode, setViewMode] = useState('daily');
  const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

  // ── Anomaly detection: per-warehouse avg costPerGuest ─────────
  const warehouseAvg = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.costPerGuest == null) continue;
      if (!m.has(r.warehouse)) m.set(r.warehouse, []);
      m.get(r.warehouse).push(r.costPerGuest);
    }
    const out = new Map();
    for (const [wh, vals] of m)
      out.set(wh, vals.reduce((s,v)=>s+v,0) / vals.length);
    return out;
  }, [rows]);

  const isAnomaly = r => {
    const avg = warehouseAvg.get(r.warehouse);
    return avg != null && r.costPerGuest != null && r.costPerGuest > avg * 1.2;
  };

  const anomalyCount = rows.filter(isAnomaly).length;

  // ── Period totals ─────────────────────────────────────────────
  const totals = useMemo(() => {
    let occupiedRooms=0, guestCount=0, breakfastCount=0, purchaseTotal=0;
    for (const r of rows) {
      occupiedRooms  += r.occupiedRooms;
      guestCount     += r.guestCount;
      breakfastCount += r.breakfastCount;
      purchaseTotal  += r.purchaseTotal;
    }
    return {
      occupiedRooms, guestCount, breakfastCount, purchaseTotal,
      costPerRoom:      occupiedRooms  > 0 ? Math.round(purchaseTotal/occupiedRooms)  : null,
      costPerGuest:     guestCount     > 0 ? Math.round(purchaseTotal/guestCount)     : null,
      costPerBreakfast: breakfastCount > 0 ? Math.round(purchaseTotal/breakfastCount) : null,
    };
  }, [rows]);

  // ── Monthly pivot ─────────────────────────────────────────────
  const monthlyPivot = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const mo = parseInt(r.date.slice(5,7), 10);
      if (!m.has(r.warehouse)) m.set(r.warehouse, { warehouse: r.warehouse, months:{} });
      const w = m.get(r.warehouse);
      if (!w.months[mo]) w.months[mo] = { purchaseTotal:0, occupiedRooms:0, guestCount:0, breakfastCount:0 };
      const mb = w.months[mo];
      mb.purchaseTotal  += r.purchaseTotal;
      mb.occupiedRooms  += r.occupiedRooms;
      mb.guestCount     += r.guestCount;
      mb.breakfastCount += r.breakfastCount;
    }
    return Array.from(m.values()).map(w => ({
      ...w,
      total: Object.values(w.months).reduce((s,mb)=>s+mb.purchaseTotal, 0),
    }));
  }, [rows]);

  const monthColTotals = useMemo(() =>
    MONTHS.reduce((acc,mo) => {
      acc[mo] = monthlyPivot.reduce((s,r)=>s+(r.months[mo]?.purchaseTotal||0), 0);
      return acc;
    }, {}),
  [monthlyPivot]);

  // ── Export columns ────────────────────────────────────────────
  const DAILY_EXPORT_COLS = [
    { header:'日期',     key:'date',            width:14 },
    { header:'館別',     key:'warehouse',        width:12 },
    { header:'住宿間數', key:'occupiedRooms',    width:10, format:'number' },
    { header:'住宿人數', key:'guestCount',       width:10, format:'number' },
    { header:'早餐人數', key:'breakfastCount',   width:10, format:'number' },
    { header:'採購總額', key:'purchaseTotal',    width:14, format:'currency' },
    { header:'每間採購', key:'costPerRoom',      width:12, format:'currency' },
    { header:'每人採購', key:'costPerGuest',     width:12, format:'currency' },
    { header:'每份早餐', key:'costPerBreakfast', width:12, format:'currency' },
  ];
  const MONTHLY_EXPORT_COLS = [
    { header:'館別', key:'warehouse', width:14 },
    ...MONTHS.map(m => ({ header:`${m}月`, key:`m${m}`, width:12, format:'currency' })),
    { header:'合計', key:'total', width:14, format:'currency' },
  ];
  const monthlyExportData = useMemo(() =>
    monthlyPivot.map(r => ({
      warehouse: r.warehouse,
      ...MONTHS.reduce((acc,m) => { acc[`m${m}`] = r.months[m]?.purchaseTotal||0; return acc; }, {}),
      total: r.total,
    })),
  [monthlyPivot]);

  const titleLabel = `住宿成本效益${filterMeta.warehouse ? ` — ${filterMeta.warehouse}` : ''}${filterMeta.category ? ` ／ ${filterMeta.category}` : ''}`;

  // ── Print helper ──────────────────────────────────────────────
  function openPrint(html) {
    const win = window.open('','_blank','width=1300,height=800');
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  }

  function handlePrintDaily() {
    const css = `body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{color:#555;margin-bottom:10px}.kpis{display:flex;gap:14px;margin-bottom:12px;flex-wrap:wrap}.kpi{border:1px solid #ddd;border-radius:5px;padding:5px 12px}.kpi-l{font-size:10px;color:#888}.kpi-v{font-size:13px;font-weight:bold}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 7px;white-space:nowrap}th{background:#f5f5f5}tfoot td{background:#f0f0f0;font-weight:bold}.leg{font-size:10px;color:#c05621;margin-top:6px}@page{size:landscape;margin:12mm}`;
    const period = `${filterMeta.start} ~ ${filterMeta.end}`;
    const fmt = v => v!=null ? NT(v) : '—';
    const rowsH = rows.map(r => {
      const a = isAnomaly(r);
      return `<tr><td>${r.date}</td><td>${r.warehouse}</td><td style="text-align:right">${r.occupiedRooms}</td><td style="text-align:right">${r.guestCount}</td><td style="text-align:right">${r.breakfastCount}</td><td style="text-align:right">${NT(r.purchaseTotal)}</td><td style="text-align:right">${r.costPerRoom!=null?r.costPerRoom.toLocaleString():'—'}</td><td style="text-align:right${a?';color:#c05621;font-weight:bold':''}">${r.costPerGuest!=null?r.costPerGuest.toLocaleString():'—'}${a?' ▲':''}</td><td style="text-align:right">${r.costPerBreakfast!=null?r.costPerBreakfast.toLocaleString():'—'}</td></tr>`;
    }).join('');
    openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel}</title><style>${css}</style></head><body>
<h2>${titleLabel}</h2><p class="meta">期間：${period}${filterMeta.category?` / 分類：${filterMeta.category}`:''} / 列印：${new Date().toLocaleString('zh-TW')}</p>
<div class="kpis"><div class="kpi"><div class="kpi-l">住宿間數</div><div class="kpi-v">${totals.occupiedRooms.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">住宿人數</div><div class="kpi-v">${totals.guestCount.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">早餐人數</div><div class="kpi-v">${totals.breakfastCount.toLocaleString()}</div></div><div class="kpi"><div class="kpi-l">採購總額</div><div class="kpi-v">${NT(totals.purchaseTotal)}</div></div><div class="kpi"><div class="kpi-l">每間採購</div><div class="kpi-v">${fmt(totals.costPerRoom)}</div></div><div class="kpi"><div class="kpi-l">每人採購</div><div class="kpi-v">${fmt(totals.costPerGuest)}</div></div><div class="kpi"><div class="kpi-l">每份早餐</div><div class="kpi-v">${fmt(totals.costPerBreakfast)}</div></div></div>
<table><thead><tr><th>日期</th><th>館別</th><th>住宿間數</th><th>住宿人數</th><th>早餐人數</th><th>採購總額</th><th>每間採購</th><th>每人採購</th><th>每份早餐</th></tr></thead><tbody>${rowsH}</tbody>
<tfoot><tr><td colspan="2">合計/平均</td><td style="text-align:right">${totals.occupiedRooms.toLocaleString()}</td><td style="text-align:right">${totals.guestCount.toLocaleString()}</td><td style="text-align:right">${totals.breakfastCount.toLocaleString()}</td><td style="text-align:right">${NT(totals.purchaseTotal)}</td><td style="text-align:right">${totals.costPerRoom?.toLocaleString()||'—'}</td><td style="text-align:right">${totals.costPerGuest?.toLocaleString()||'—'}</td><td style="text-align:right">${totals.costPerBreakfast?.toLocaleString()||'—'}</td></tr></tfoot></table>
${anomalyCount>0?`<p class="leg">▲ 橘色 = 每人採購超過本期館別平均 120%（共 ${anomalyCount} 天）</p>`:''}
</body></html>`);
  }

  function handlePrintMonthly() {
    const css = `body{font-family:Arial,"Microsoft JhengHei",sans-serif;font-size:11px;padding:20px}h2{font-size:15px;margin:0 0 4px}.meta{color:#555;margin-bottom:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;white-space:nowrap}th{background:#f5f5f5;text-align:center}tfoot td{background:#f0f0f0}@page{size:landscape;margin:12mm}`;
    const bR = monthlyPivot.map(r => `<tr><td>${r.warehouse}</td>${MONTHS.map(m=>`<td style="text-align:right">${r.months[m]?.purchaseTotal>0?Math.round(r.months[m].purchaseTotal).toLocaleString():''}</td>`).join('')}<td style="text-align:right;font-weight:bold">${Math.round(r.total).toLocaleString()}</td></tr>`).join('');
    const fR = `<tr><td style="font-weight:bold">合計</td>${MONTHS.map(m=>`<td style="text-align:right;font-weight:bold">${monthColTotals[m]>0?Math.round(monthColTotals[m]).toLocaleString():''}</td>`).join('')}<td style="text-align:right;font-weight:bold">${Math.round(monthlyPivot.reduce((s,r)=>s+r.total,0)).toLocaleString()}</td></tr>`;
    openPrint(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titleLabel} — 月份彙整</title><style>${css}</style></head><body>
<h2>${titleLabel} — 月份採購彙整</h2><p class="meta">期間：${filterMeta.start} ~ ${filterMeta.end} / 列印：${new Date().toLocaleString('zh-TW')}</p>
<table><thead><tr><th>館別</th>${MONTHS.map(m=>`<th>${m}月</th>`).join('')}<th>合計</th></tr></thead><tbody>${bR}</tbody><tfoot>${fR}</tfoot></table>
</body></html>`);
  }

  const isMonthly = viewMode === 'monthly';

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="住宿間數"   value={totals.occupiedRooms.toLocaleString()}   icon="🛏️" color="text-indigo-600" />
        <KpiCard label="住宿人數"   value={totals.guestCount.toLocaleString()}       icon="👤" color="text-blue-600" />
        <KpiCard label="早餐人數"   value={totals.breakfastCount.toLocaleString()}   icon="🍳" color="text-teal-600" />
        <KpiCard label="採購總額"   value={NT(totals.purchaseTotal)}                  icon="🛒" color="text-gray-700" />
        <KpiCard label="每間採購"   value={totals.costPerRoom!=null ? NT(totals.costPerRoom) : '—'}          icon="🏠" color="text-cyan-700" />
        <KpiCard label="每人採購"   value={totals.costPerGuest!=null ? NT(totals.costPerGuest) : '—'}        icon="💰" color="text-cyan-700" />
        <KpiCard label="每份早餐成本" value={totals.costPerBreakfast!=null ? NT(totals.costPerBreakfast) : '—'} icon="☕" color="text-amber-700" />
      </div>

      {/* Anomaly banner */}
      {anomalyCount > 0 && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
          <span className="text-orange-500 font-bold text-sm">▲</span>
          <p className="text-sm text-orange-800">
            發現 <strong>{anomalyCount}</strong> 天「每人採購」超過本期館別平均的 120%，表格中以橘色標記。
          </p>
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('daily')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              每日明細
            </button>
            <button onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isMonthly ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              月份彙整
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={isMonthly ? handlePrintMonthly : handlePrintDaily}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              列印
            </button>
            <ExportButtons
              data={isMonthly ? monthlyExportData : rows}
              columns={isMonthly ? MONTHLY_EXPORT_COLS : DAILY_EXPORT_COLS}
              title={isMonthly ? `${titleLabel} — 月份彙整` : titleLabel}
              exportName={isMonthly ? '住宿成本月份彙整' : '住宿成本效益'}
              sheetName={isMonthly ? '月份彙整' : '每日明細'}
            />
          </div>
        </div>

        {/* Every-day detail */}
        {!isMonthly && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">日期</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">館別</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-indigo-500 whitespace-nowrap">住宿間數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-blue-500 whitespace-nowrap">住宿人數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-teal-500 whitespace-nowrap">早餐人數</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap">採購總額</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-cyan-600 whitespace-nowrap">每間採購</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-cyan-600 whitespace-nowrap">
                    每人採購 <span className="text-orange-400">⚡</span>
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-amber-600 whitespace-nowrap">每份早餐</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => {
                  const anomaly = isAnomaly(r);
                  return (
                    <tr key={i} className={`transition-colors ${anomaly ? 'bg-orange-50 hover:bg-orange-100/80' : r.hasPmsData === false ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                        {r.warehouse}
                        {r.hasPmsData === false && <span className="ml-1 text-[10px] text-gray-400 font-normal">(無PMS)</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-indigo-700 tabular-nums">{r.occupiedRooms || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-blue-700 tabular-nums">{r.guestCount || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-teal-700 tabular-nums">{r.breakfastCount || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{r.purchaseTotal > 0 ? NT(r.purchaseTotal) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-cyan-700 tabular-nums">{r.costPerRoom != null ? r.costPerRoom.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${anomaly ? 'text-orange-600' : 'text-cyan-700'}`}>
                        {r.costPerGuest != null ? (
                          <span className="flex items-center justify-end gap-1">
                            {r.costPerGuest.toLocaleString()}
                            {anomaly && <span className="text-xs text-orange-500" title="超過平均 120%">▲</span>}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700 tabular-nums">{r.costPerBreakfast != null ? r.costPerBreakfast.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">查無符合條件的資料</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-gray-50 border-t font-semibold text-sm">
                  <tr>
                    <td colSpan={2} className="px-3 py-2.5 text-right text-gray-600">合計 / 平均</td>
                    <td className="px-3 py-2.5 text-right text-indigo-700">{totals.occupiedRooms.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-blue-700">{totals.guestCount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-teal-700">{totals.breakfastCount.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">{NT(totals.purchaseTotal)}</td>
                    <td className="px-3 py-2.5 text-right text-cyan-700">{totals.costPerRoom?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-cyan-700">{totals.costPerGuest?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right text-amber-700">{totals.costPerBreakfast?.toLocaleString() ?? '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Monthly pivot */}
        {isMonthly && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10">館別／月份</th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 whitespace-nowrap min-w-[80px]">{m}月</th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-700 whitespace-nowrap bg-cyan-50">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyPivot.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white z-10">{r.warehouse}</td>
                    {MONTHS.map(m => {
                      const mb = r.months[m];
                      return (
                        <td key={m} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums"
                          title={mb ? `住宿間數：${mb.occupiedRooms} ／ 住宿人數：${mb.guestCount} ／ 早餐：${mb.breakfastCount}` : ''}>
                          {mb?.purchaseTotal > 0 ? Math.round(mb.purchaseTotal).toLocaleString() : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-bold text-cyan-700 whitespace-nowrap tabular-nums bg-cyan-50">
                      {Math.round(r.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {monthlyPivot.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">查無資料</td></tr>
                )}
              </tbody>
              {monthlyPivot.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">合計</td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-3 py-2.5 text-right font-semibold text-gray-800 tabular-nums">
                        {monthColTotals[m] > 0 ? Math.round(monthColTotals[m]).toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right font-bold text-cyan-700 tabular-nums bg-cyan-50">
                      {Math.round(monthlyPivot.reduce((s,r)=>s+r.total,0)).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="px-4 py-2 text-xs text-gray-400 border-t">數值為採購總額（NT$）；游標停在格子上可看住宿間數／人數詳情</p>
          </div>
        )}
      </div>
    </div>
  );
}
