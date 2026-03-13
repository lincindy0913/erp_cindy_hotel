'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const ANALYTICS_TABS = [
  { key: 'price', label: '價格分析' },
  { key: 'pnl-warehouse', label: '館別損益表' },
  { key: 'supplier-risk', label: '供應商風險' },
  { key: 'payables', label: '應付帳齡' },
  { key: 'cashflow-forecast', label: '現金流預測' },
  { key: 'department', label: '部門支出' },
  { key: 'business-report', label: '月度報告' },
  { key: 'breakfast-procurement', label: '早餐與採購比較' },
];

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('price');
  const [products, setProducts] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceComparison, setPriceComparison] = useState([]);
  const [departmentExpenses, setDepartmentExpenses] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [timeRange, setTimeRange] = useState('6');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Supplier risk state
  const [supplierRisk, setSupplierRisk] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // Payables aging state
  const [payablesAging, setPayablesAging] = useState(null);
  const [payablesLoading, setPayablesLoading] = useState(false);

  // Cash flow forecast state
  const [cashForecast, setCashForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastDays, setForecastDays] = useState(30);

  // Business report state
  const [businessReport, setBusinessReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportApproving, setReportApproving] = useState(false);

  // 館別損益表（從 cashflow 依會計科目彙總）
  const [pnlByWarehouse, setPnlByWarehouse] = useState(null);
  const [pnlWarehouseLoading, setPnlWarehouseLoading] = useState(false);
  const [pnlStartDate, setPnlStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [pnlEndDate, setPnlEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pnlWarehouseFilter, setPnlWarehouseFilter] = useState('');

  // 早餐與採購比較（依早餐人數判斷品項叫貨是否過高，例：牛奶）
  const [breakfastYearMonth, setBreakfastYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [breakfastWarehouse, setBreakfastWarehouse] = useState('');
  const [breakfastKeyword, setBreakfastKeyword] = useState('');
  const [breakfastProductId, setBreakfastProductId] = useState('');
  const [breakfastResult, setBreakfastResult] = useState(null);
  const [breakfastLoading, setBreakfastLoading] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState([]);

  useEffect(() => {
    fetchProducts();
    fetchPriceComparison();
    fetchDepartmentExpenses();
  }, []);

  useEffect(() => {
    if (activeTab === 'supplier-risk' && !supplierRisk) fetchSupplierRisk();
    if (activeTab === 'payables' && !payablesAging) fetchPayablesAging();
    if (activeTab === 'cashflow-forecast' && !cashForecast) fetchCashForecast();
    if (activeTab === 'business-report') fetchBusinessReport(reportMonth);
    if (activeTab === 'pnl-warehouse') fetchPnlByWarehouse();
    if (activeTab === 'breakfast-procurement') fetchWarehouseOptions();
  }, [activeTab]);

  async function fetchPnlByWarehouse() {
    setPnlWarehouseLoading(true);
    setPnlByWarehouse(null);
    try {
      const params = new URLSearchParams({ startDate: pnlStartDate, endDate: pnlEndDate });
      if (pnlWarehouseFilter.trim()) params.set('warehouse', pnlWarehouseFilter.trim());
      const res = await fetch(`/api/analytics/pnl-by-warehouse?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPnlByWarehouse(data);
      }
    } catch (e) {
      console.error('取得館別損益表失敗:', e);
    }
    setPnlWarehouseLoading(false);
  }

  async function fetchWarehouseOptions() {
    try {
      const end = new Date();
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      const params = new URLSearchParams({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      });
      const res = await fetch(`/api/pms-income/batches?${params}`);
      if (res.ok) {
        const list = await res.json();
        const wh = [...new Set((list || []).map(b => b.warehouse).filter(Boolean))].sort();
        setWarehouseOptions(wh);
      }
    } catch (e) {
      console.error('取得館別列表失敗:', e);
    }
  }

  async function fetchBreakfastProcurement() {
    setBreakfastLoading(true);
    setBreakfastResult(null);
    try {
      const params = new URLSearchParams({ yearMonth: breakfastYearMonth });
      if (breakfastWarehouse.trim()) params.set('warehouse', breakfastWarehouse.trim());
      if (breakfastProductId) params.set('productId', breakfastProductId);
      if (breakfastKeyword.trim()) params.set('keyword', breakfastKeyword.trim());
      const res = await fetch(`/api/analytics/procurement-vs-breakfast?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBreakfastResult(data);
      } else {
        const err = await res.json();
        setBreakfastResult({ error: err.error?.message || '查詢失敗' });
      }
    } catch (e) {
      console.error('早餐與採購查詢失敗:', e);
      setBreakfastResult({ error: e.message || '查詢失敗' });
    }
    setBreakfastLoading(false);
  }

  useEffect(() => {
    if (selectedProduct) {
      fetchPriceHistory(selectedProduct);
    } else {
      setPriceHistory([]);
    }
  }, [selectedProduct]);

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
    }
  }

  async function fetchPriceHistory(productId) {
    try {
      const response = await fetch(`/api/price-history?productId=${productId}`);
      const data = await response.json();
      setPriceHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得歷史價格失敗:', error);
      setPriceHistory([]);
    }
  }

  async function fetchPriceComparison() {
    try {
      const response = await fetch('/api/price-comparison');
      const data = await response.json();
      setPriceComparison(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得比價資料失敗:', error);
      setPriceComparison([]);
    }
  }

  async function fetchDepartmentExpenses() {
    try {
      const response = await fetch(`/api/department-expenses?year=${selectedYear}`);
      const data = await response.json();
      setDepartmentExpenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得部門支出失敗:', error);
      setDepartmentExpenses([]);
    }
  }

  async function fetchSupplierRisk() {
    setRiskLoading(true);
    try {
      const res = await fetch('/api/analytics/supplier-risk');
      if (res.ok) {
        const data = await res.json();
        setSupplierRisk(data);
      }
    } catch (error) {
      console.error('取得供應商風險資料失敗:', error);
    }
    setRiskLoading(false);
  }

  async function fetchPayablesAging() {
    setPayablesLoading(true);
    try {
      const res = await fetch('/api/analytics/payables-aging');
      if (res.ok) {
        const data = await res.json();
        setPayablesAging(data);
      }
    } catch (error) {
      console.error('取得應付帳齡資料失敗:', error);
    }
    setPayablesLoading(false);
  }

  async function fetchCashForecast() {
    setForecastLoading(true);
    try {
      const res = await fetch(`/api/analytics/cash-flow-forecast?days=${forecastDays}`);
      if (res.ok) {
        const data = await res.json();
        setCashForecast(data);
      }
    } catch (error) {
      console.error('取得現金流預測失敗:', error);
    }
    setForecastLoading(false);
  }

  async function fetchBusinessReport(month) {
    setReportLoading(true);
    setBusinessReport(null);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setBusinessReport(data);
      }
    } catch (error) {
      console.error('取得月度報告失敗:', error);
    }
    setReportLoading(false);
  }

  async function approveReport() {
    setReportApproving(true);
    try {
      const res = await fetch(`/api/analytics/business-report?month=${reportMonth}`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json();
        setBusinessReport(prev => ({ ...prev, report: data.report }));
      }
    } catch (error) {
      console.error('簽核失敗:', error);
    }
    setReportApproving(false);
  }

  // 按月份分組部門支出
  const groupedExpenses = departmentExpenses.reduce((acc, exp) => {
    const key = `${exp.year}-${exp.month}`;
    if (!acc[key]) {
      acc[key] = { year: exp.year, month: exp.month, total: 0, items: [] };
    }
    acc[key].total += parseFloat(exp.totalAmount || 0);
    acc[key].items.push(exp);
    return acc;
  }, {});

  return (
    <div className="min-h-screen page-bg-analytics">
      <Navigation borderColor="border-cyan-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">決策分析</h2>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg shadow-sm p-1">
          {ANALYTICS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Supplier Risk Tab */}
        {activeTab === 'supplier-risk' && (
          <div className="space-y-6">
            {riskLoading ? (
              <div className="text-center py-12 text-gray-500">載入供應商風險分析中...</div>
            ) : supplierRisk ? (
              <>
                {/* Risk Summary */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg shadow-sm p-4">
                    <p className="text-xs text-gray-500">供應商數量</p>
                    <p className="text-2xl font-bold mt-1">{supplierRisk.supplierCount || 0}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4">
                    <p className="text-xs text-gray-500">HHI 指數</p>
                    <p className={`text-2xl font-bold mt-1 ${(supplierRisk.hhi || 0) > 0.15 ? 'text-red-600' : 'text-green-600'}`}>
                      {(supplierRisk.hhi || 0).toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{(supplierRisk.hhi || 0) > 0.15 ? '集中度過高' : '集中度正常'}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4">
                    <p className="text-xs text-gray-500">Top 1 佔比</p>
                    <p className={`text-2xl font-bold mt-1 ${(supplierRisk.top1Percentage || 0) > 20 ? 'text-orange-600' : 'text-green-600'}`}>
                      {(supplierRisk.top1Percentage || 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4">
                    <p className="text-xs text-gray-500">Top 3 佔比</p>
                    <p className={`text-2xl font-bold mt-1 ${(supplierRisk.top3Percentage || 0) > 50 ? 'text-orange-600' : 'text-green-600'}`}>
                      {(supplierRisk.top3Percentage || 0).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Risk Alerts */}
                {supplierRisk.alerts?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-amber-800 mb-2">風險警示</h4>
                    <ul className="space-y-1">
                      {supplierRisk.alerts.map((alert, i) => (
                        <li key={i} className="text-sm text-amber-700">• {alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Supplier Table */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h3 className="font-medium text-gray-700">供應商採購佔比</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">排名</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">供應商</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">採購金額</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">佔比</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">風險等級</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(supplierRisk.suppliers || []).map((s, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                          <td className="px-4 py-3 font-medium">{s.supplierName}</td>
                          <td className="px-4 py-3 text-right">NT$ {Number(s.amount || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">{(s.percentage || 0).toFixed(1)}%</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              s.riskLevel === 'high' ? 'bg-red-100 text-red-700' :
                              s.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {s.riskLevel === 'high' ? '高' : s.riskLevel === 'medium' ? '中' : '低'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">無法載入供應商風險資料</div>
            )}
          </div>
        )}

        {/* 館別損益表（從 cashflow 依會計科目） */}
        {activeTab === 'pnl-warehouse' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <label className="text-sm text-gray-600">區間</label>
              <input
                type="date"
                value={pnlStartDate}
                onChange={e => setPnlStartDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
              <span className="text-gray-400">～</span>
              <input
                type="date"
                value={pnlEndDate}
                onChange={e => setPnlEndDate(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
              <label className="text-sm text-gray-600 ml-2">館別篩選（選填）</label>
              <input
                type="text"
                value={pnlWarehouseFilter}
                onChange={e => setPnlWarehouseFilter(e.target.value)}
                placeholder="留空＝全部"
                className="px-3 py-1.5 border rounded-lg text-sm w-32"
              />
              <button
                onClick={fetchPnlByWarehouse}
                disabled={pnlWarehouseLoading}
                className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 disabled:opacity-50"
              >
                {pnlWarehouseLoading ? '查詢中…' : '查詢'}
              </button>
            </div>
            <p className="text-sm text-gray-500">
              資料來源：<Link href="/cashflow" className="text-cyan-600 hover:underline">現金流</Link>（含租屋收入、PMS 收入、貸款支出、出納支出等），依館別與會計科目彙總。
            </p>
            {pnlWarehouseLoading ? (
              <div className="text-center py-12 text-gray-500">載入館別損益表中…</div>
            ) : pnlByWarehouse?.byWarehouse?.length > 0 ? (
              <div className="space-y-8">
                {pnlByWarehouse.byWarehouse.map((row, idx) => (
                  <div key={idx} className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
                      <h3 className="font-medium text-gray-700">館別：{row.warehouse}</h3>
                      <div className="flex gap-6 text-sm">
                        <span className="text-green-600">收入合計 NT$ {Number(row.totalIncome || 0).toLocaleString()}</span>
                        <span className="text-red-600">支出合計 NT$ {Number(row.totalExpense || 0).toLocaleString()}</span>
                        <span className="font-medium">損益 NT$ {Number(row.netProfit || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 p-4">
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2">收入（按會計科目）</h4>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="py-2 pr-2">會計科目</th>
                              <th className="py-2 text-right">金額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(row.incomeBySubject || []).map((item, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1.5 pr-2">{item.subject?.name ?? item.name ?? '-'}</td>
                                <td className="py-1.5 text-right text-green-700">NT$ {Number(item.amount || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                            {(!row.incomeBySubject || row.incomeBySubject.length === 0) && (
                              <tr><td colSpan={2} className="py-2 text-gray-400">無</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2">支出（按會計科目）</h4>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="py-2 pr-2">會計科目</th>
                              <th className="py-2 text-right">金額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(row.expenseBySubject || []).map((item, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="py-1.5 pr-2">{item.subject?.name ?? item.name ?? '-'}</td>
                                <td className="py-1.5 text-right text-red-700">NT$ {Number(item.amount || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                            {(!row.expenseBySubject || row.expenseBySubject.length === 0) && (
                              <tr><td colSpan={2} className="py-2 text-gray-400">無</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : pnlByWarehouse && (!pnlByWarehouse.byWarehouse || pnlByWarehouse.byWarehouse.length === 0) ? (
              <div className="text-center py-12 text-gray-400">此區間無現金流資料，請調整日期或館別後再查詢。</div>
            ) : null}
          </div>
        )}

        {/* Payables Aging Tab */}
        {activeTab === 'payables' && (
          <div className="space-y-6">
            {payablesLoading ? (
              <div className="text-center py-12 text-gray-500">載入應付帳齡分析中...</div>
            ) : payablesAging ? (
              <>
                {/* Aging Buckets */}
                <div className="grid grid-cols-4 gap-4">
                  {(payablesAging.buckets || []).map((b, i) => (
                    <div key={i} className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                      i === 0 ? 'border-green-400' : i === 1 ? 'border-yellow-400' : i === 2 ? 'border-orange-400' : 'border-red-400'
                    }`}>
                      <p className="text-xs text-gray-500">{b.label}</p>
                      <p className="text-2xl font-bold mt-1">NT$ {Number(b.amount || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-1">{b.count || 0} 筆</p>
                    </div>
                  ))}
                </div>

                {/* Cash Pressure Forecast */}
                {payablesAging.cashPressure && (
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="font-medium text-gray-700 mb-4">資金壓力預測</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">7 天內應付</p>
                        <p className="text-xl font-bold text-gray-800">NT$ {Number(payablesAging.cashPressure.days7 || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">14 天內應付</p>
                        <p className="text-xl font-bold text-gray-800">NT$ {Number(payablesAging.cashPressure.days14 || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">30 天內應付</p>
                        <p className="text-xl font-bold text-gray-800">NT$ {Number(payablesAging.cashPressure.days30 || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Supplier Detail */}
                {payablesAging.bySupplier?.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h3 className="font-medium text-gray-700">供應商應付明細</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">供應商</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">應付金額</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">逾期金額</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">帳齡分佈</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {payablesAging.bySupplier.slice(0, 20).map((s, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{s.supplierName}</td>
                            <td className="px-4 py-3 text-right">NT$ {Number(s.totalAmount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-red-600">NT$ {Number(s.overdueAmount || 0).toLocaleString()}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                {s.aging && Object.entries(s.aging).map(([k, v]) => (
                                  v > 0 && <span key={k} className="text-xs px-1 bg-gray-100 rounded">{k}: ${Number(v).toLocaleString()}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">無法載入應付帳齡資料</div>
            )}
          </div>
        )}

        {/* Cash Flow Forecast Tab */}
        {activeTab === 'cashflow-forecast' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 mb-4">
              <label className="text-sm text-gray-600">預測天數：</label>
              <select
                value={forecastDays}
                onChange={e => { setForecastDays(Number(e.target.value)); setCashForecast(null); }}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value={7}>7 天</option>
                <option value={14}>14 天</option>
                <option value={30}>30 天</option>
                <option value={60}>60 天</option>
                <option value={90}>90 天</option>
              </select>
              <button onClick={fetchCashForecast} className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700">重新預測</button>
            </div>

            {forecastLoading ? (
              <div className="text-center py-12 text-gray-500">計算現金流預測中...</div>
            ) : cashForecast ? (
              <>
                {/* Scenario Cards */}
                <div className="grid grid-cols-3 gap-4">
                  {['optimistic', 'risk', 'crisis'].map(scenario => {
                    const data = cashForecast[scenario];
                    if (!data) return null;
                    const labels = { optimistic: '樂觀情境', risk: '風險情境', crisis: '危機情境' };
                    const colors = { optimistic: 'border-green-400 bg-green-50', risk: 'border-yellow-400 bg-yellow-50', crisis: 'border-red-400 bg-red-50' };
                    return (
                      <div key={scenario} className={`rounded-lg shadow-sm p-5 border-l-4 ${colors[scenario]}`}>
                        <p className="text-sm font-medium text-gray-700 mb-3">{labels[scenario]}</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500">期末預估餘額</p>
                            <p className="text-xl font-bold">{data.endBalance != null ? `NT$ ${Number(data.endBalance).toLocaleString()}` : '-'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-xs text-gray-500">預計流入</p>
                              <p className="text-sm font-medium text-green-700">+{Number(data.totalInflow || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">預計流出</p>
                              <p className="text-sm font-medium text-red-700">-{Number(data.totalOutflow || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Forecast Detail */}
                {cashForecast.dailyForecast?.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h3 className="font-medium text-gray-700">每日現金流預測（樂觀情境）</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">流入</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">流出</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">淨流量</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">預估餘額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {cashForecast.dailyForecast.map((d, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{d.date}</td>
                              <td className="px-4 py-2 text-right text-green-600">+{Number(d.inflow || 0).toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-red-600">-{Number(d.outflow || 0).toLocaleString()}</td>
                              <td className={`px-4 py-2 text-right font-medium ${(d.net || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {Number(d.net || 0).toLocaleString()}
                              </td>
                              <td className={`px-4 py-2 text-right font-medium ${(d.balance || 0) >= 0 ? '' : 'text-red-700'}`}>
                                NT$ {Number(d.balance || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-400">無法載入現金流預測資料</div>
            )}
          </div>
        )}

        {/* Price Analysis Tab (existing content) */}
        {activeTab === 'price' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* 歷史價格分析 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">歷史價格分析</h3>
            <div className="space-y-4">
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">選擇產品...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              
              {priceHistory.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">日期</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">供應商</th>
                        <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">價格</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {priceHistory.slice(0, 10).map(ph => (
                        <tr key={ph.id}>
                          <td className="px-3 py-2 text-sm">{ph.purchaseDate}</td>
                          <td className="px-3 py-2 text-sm">{ph.supplierName}</td>
                          <td className="px-3 py-2 text-sm text-right">NT$ {parseFloat(ph.unitPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                  {selectedProduct ? '該產品尚無歷史價格資料' : '請選擇產品查看歷史價格'}
                </div>
              )}
            </div>
          </div>

          {/* 比價分析 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">💰 供應商比價</h3>
            <div className="space-y-4">
              {priceComparison.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">供應商</th>
                        <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">價格</th>
                        <th className="px-3 py-2 text-center text-sm font-medium text-gray-700">最低價</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {priceComparison.map((comp, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-sm">{comp.productName}</td>
                          <td className="px-3 py-2 text-sm">{comp.supplierName}</td>
                          <td className="px-3 py-2 text-sm text-right">NT$ {parseFloat(comp.unitPrice).toFixed(2)}</td>
                          <td className="px-3 py-2 text-center">
                            {comp.isMinPrice ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                ✓ 最低
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                  尚無比價資料
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Business Report Tab */}
        {activeTab === 'business-report' && (
          <div className="space-y-6">
            {/* Month selector */}
            <div className="flex items-center gap-4 bg-white rounded-lg shadow-sm p-4">
              <label className="text-sm text-gray-600 font-medium">選擇月份：</label>
              <input
                type="month"
                value={`${reportMonth.substring(0, 4)}-${reportMonth.substring(4, 6)}`}
                onChange={e => {
                  const val = e.target.value.replace('-', '');
                  setReportMonth(val);
                  fetchBusinessReport(val);
                }}
                className="px-3 py-1.5 border rounded-lg text-sm"
              />
              <button
                onClick={() => fetchBusinessReport(reportMonth)}
                className="px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700"
              >
                重新載入
              </button>
            </div>

            {reportLoading ? (
              <div className="text-center py-12 text-gray-500">載入月度報告中...</div>
            ) : businessReport ? (() => {
              const r = businessReport.report || businessReport.generated;
              if (!r) return <div className="text-center py-12 text-gray-400">無報告資料</div>;
              const profit = r.profitAnalysis || {};
              const risk = r.riskAnalysis || {};
              const cashFlow = r.cashFlowAnalysis || {};
              const recs = r.decisionRecommendations || [];
              const isLive = !businessReport.report;
              const isApproved = r.status === 'approved';

              return (
                <div className="space-y-4">
                  {/* Report header */}
                  <div className="bg-white rounded-lg shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {r.reportYear}年{r.reportMonth}月 經營分析報告
                        </h3>
                        {r.reportNo && <p className="text-xs text-gray-400 mt-0.5">報告編號：{r.reportNo}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            isLive ? 'bg-blue-100 text-blue-700' :
                            isApproved ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {isLive ? '即時預覽' : isApproved ? '已簽核' : '草稿'}
                          </span>
                          {r.generatedAt && (
                            <span className="text-xs text-gray-400">
                              生成於 {new Date(r.generatedAt).toLocaleDateString('zh-TW')}
                            </span>
                          )}
                          {isApproved && r.approvedBy && (
                            <span className="text-xs text-green-600">簽核人：{r.approvedBy}</span>
                          )}
                        </div>
                      </div>
                      {!isLive && !isApproved && (
                        <button
                          onClick={approveReport}
                          disabled={reportApproving}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {reportApproving ? '簽核中...' : '簽核批准'}
                        </button>
                      )}
                    </div>
                    {r.executiveSummary && (
                      <p className="mt-3 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                        {r.executiveSummary}
                      </p>
                    )}
                  </div>

                  {/* Profit Analysis */}
                  {profit.totalSales !== undefined && (
                    <div className="bg-white rounded-lg shadow-sm p-5">
                      <h4 className="font-semibold text-gray-700 mb-4">利潤分析</h4>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">銷貨額</p>
                          <p className="text-lg font-bold text-gray-800 mt-1">NT$ {Number(profit.totalSales || 0).toLocaleString()}</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">採購額</p>
                          <p className="text-lg font-bold text-gray-800 mt-1">NT$ {Number(profit.totalPurchase || 0).toLocaleString()}</p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">毛利</p>
                          <p className={`text-lg font-bold mt-1 ${(profit.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            NT$ {Number(profit.grossProfit || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-center p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">毛利率</p>
                          <p className={`text-lg font-bold mt-1 ${(profit.grossMargin || 0) >= (profit.targetGrossMargin || 36) ? 'text-green-700' : 'text-amber-600'}`}>
                            {profit.grossMargin || 0}%
                          </p>
                          <p className="text-xs text-gray-400">目標 {profit.targetGrossMargin || 36}%</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          profit.status === 'achieved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {profit.status === 'achieved' ? '✅ 達成目標' : `⚠️ 目標達成率 ${profit.achievement}%`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Risk Analysis */}
                  {risk.supplierConcentration && (
                    <div className="bg-white rounded-lg shadow-sm p-5">
                      <h4 className="font-semibold text-gray-700 mb-4">風險分析</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 mb-2">廠商集中度風險</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">最大廠商佔比</span>
                              <span className={`font-medium ${(risk.supplierConcentration.top1Percentage || 0) > 20 ? 'text-red-600' : 'text-green-600'}`}>
                                {risk.supplierConcentration.top1Percentage || 0}%
                                {(risk.supplierConcentration.top1Percentage || 0) > 20 ? ' 🔴' : ' ✅'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Top 3 廠商佔比</span>
                              <span className={`font-medium ${(risk.supplierConcentration.top3Percentage || 0) > 50 ? 'text-red-600' : 'text-green-600'}`}>
                                {risk.supplierConcentration.top3Percentage || 0}%
                                {(risk.supplierConcentration.top3Percentage || 0) > 50 ? ' 🔴' : ' ✅'}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">廠商數量</span>
                              <span className="font-medium text-gray-700">{risk.supplierConcentration.supplierCount || 0} 家</span>
                            </div>
                            <div className="mt-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                risk.supplierConcentration.riskLevel === 'high' ? 'bg-red-100 text-red-700' :
                                risk.supplierConcentration.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {risk.supplierConcentration.riskLevel === 'high' ? '高風險' :
                                 risk.supplierConcentration.riskLevel === 'medium' ? '中風險' : '低風險'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium text-gray-700 mb-2">現金流風險</p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">當前現金餘額</span>
                              <span className={`font-medium ${(risk.cashShortage?.currentCash || 0) < 100000 ? 'text-red-600' : 'text-green-600'}`}>
                                NT$ {Number(risk.cashShortage?.currentCash || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="mt-2">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                risk.cashShortage?.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                                risk.cashShortage?.riskLevel === 'high' ? 'bg-amber-100 text-amber-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {risk.cashShortage?.riskLevel === 'critical' ? '危急' :
                                 risk.cashShortage?.riskLevel === 'high' ? '高風險' : '正常'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Decision Recommendations */}
                  {recs.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-5">
                      <h4 className="font-semibold text-gray-700 mb-4">決策建議（按優先級）</h4>
                      <div className="space-y-3">
                        {recs.map((rec, i) => (
                          <div key={i} className={`p-4 rounded-lg border-l-4 ${
                            rec.priority === 1 ? 'bg-red-50 border-red-400' :
                            rec.priority === 2 ? 'bg-amber-50 border-amber-400' :
                            'bg-blue-50 border-blue-400'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <span className={`text-sm font-semibold ${
                                  rec.priority === 1 ? 'text-red-800' :
                                  rec.priority === 2 ? 'text-amber-800' :
                                  'text-blue-800'
                                }`}>
                                  {rec.priority}. {rec.action}
                                </span>
                                <p className={`text-xs mt-1 ${
                                  rec.priority === 1 ? 'text-red-600' :
                                  rec.priority === 2 ? 'text-amber-600' :
                                  'text-blue-600'
                                }`}>{rec.description}</p>
                                {rec.expectedImpact && (
                                  <p className="text-xs text-gray-500 mt-1">預期效果：{rec.expectedImpact}</p>
                                )}
                              </div>
                              {rec.timeline && (
                                <span className="text-xs text-gray-400 whitespace-nowrap ml-4">{rec.timeline}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-center py-12 text-gray-400">無法載入月度報告</div>
            )}
          </div>
        )}

        {/* 部門支出 Tab */}
        {activeTab === 'department' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">部門支出分析</h3>
          <div className="space-y-4">
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value));
                fetchDepartmentExpenses();
              }}
            >
              {[2024, 2023, 2022].map(year => (
                <option key={year} value={year}>{year} 年</option>
              ))}
            </select>
            
            {departmentExpenses.length > 0 ? (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">年月</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">部門</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">類別</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">稅額</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">總金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {departmentExpenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="px-4 py-3 text-sm">{exp.year}年{exp.month}月</td>
                        <td className="px-4 py-3 text-sm">{exp.department}</td>
                        <td className="px-4 py-3 text-sm">{exp.category}</td>
                        <td className="px-4 py-3 text-sm text-right">NT$ {parseFloat(exp.tax).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right">NT$ {parseFloat(exp.totalAmount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                尚無部門支出資料
              </div>
            )}
          </div>
        </div>
        )}

        {/* 早餐與採購比較：依早餐人數判斷品項叫貨是否過高（例：牛奶） */}
        {activeTab === 'breakfast-procurement' && (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              資料來源：<Link href="/pms-income" className="text-cyan-600 hover:underline">PMS 收入</Link>的「早餐人數、住宿人數、住宿間數」與進貨採購。請先在 PMS 收入匯入或建立每日資料時填寫營運指標。
            </p>
            <div className="flex flex-wrap items-end gap-4 bg-white rounded-lg shadow-sm p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
                <input
                  type="month"
                  value={breakfastYearMonth}
                  onChange={e => setBreakfastYearMonth(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別（選填）</label>
                <select
                  value={breakfastWarehouse}
                  onChange={e => setBreakfastWarehouse(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40"
                >
                  <option value="">全部</option>
                  {warehouseOptions.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">品項關鍵字（例：牛奶）</label>
                <input
                  type="text"
                  value={breakfastKeyword}
                  onChange={e => { setBreakfastKeyword(e.target.value); setBreakfastProductId(''); }}
                  placeholder="輸入品名或代碼"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48"
                />
              </div>
              <button
                onClick={fetchBreakfastProcurement}
                disabled={breakfastLoading || !breakfastKeyword.trim()}
                className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 disabled:opacity-50"
              >
                {breakfastLoading ? '查詢中…' : '查詢'}
              </button>
            </div>
            {breakfastResult && (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                {breakfastResult.error ? (
                  <div className="p-4 text-amber-700 bg-amber-50">{breakfastResult.error}</div>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h3 className="font-medium text-gray-700">
                        {breakfastYearMonth} {breakfastResult.warehouse && `－ ${breakfastResult.warehouse}`}
                        {breakfastResult.productInfo && ` · ${breakfastResult.productInfo.name || breakfastResult.productInfo.code}`}
                      </h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">當月早餐人數</p>
                        <p className="text-xl font-bold mt-1">{Number(breakfastResult.totalBreakfastCount || 0).toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">當月住宿人數</p>
                        <p className="text-xl font-bold mt-1">{Number(breakfastResult.totalGuestCount || 0).toLocaleString()}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">當月採購數量</p>
                        <p className="text-xl font-bold mt-1">{Number(breakfastResult.totalProcurementQty || 0).toLocaleString()} {breakfastResult.productInfo?.unit || ''}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">當月採購金額</p>
                        <p className="text-xl font-bold mt-1">NT$ {Number(breakfastResult.totalProcurementAmount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex flex-wrap gap-4">
                      <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-100">
                        <p className="text-xs text-cyan-700">平均每人早餐用量（數量）</p>
                        <p className="text-lg font-bold text-cyan-800 mt-1">
                          {breakfastResult.perBreakfastQty != null ? `${breakfastResult.perBreakfastQty} ${breakfastResult.productInfo?.unit || ''}/人` : '－'}
                        </p>
                      </div>
                      <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-100">
                        <p className="text-xs text-cyan-700">平均每人早餐金額</p>
                        <p className="text-lg font-bold text-cyan-800 mt-1">
                          {breakfastResult.perBreakfastAmount != null ? `NT$ ${breakfastResult.perBreakfastAmount.toFixed(2)}/人` : '－'}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 text-sm text-gray-600">
                      若每人早餐用量或金額明顯高於常態，可能表示該品項叫貨過高，可對照歷史月份或他館數據調整採購。
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
