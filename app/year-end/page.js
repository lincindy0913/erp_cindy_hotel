'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

function formatNumber(num) {
  if (num == null || isNaN(num)) return '0';
  return Number(num).toLocaleString('zh-TW');
}

function formatCurrency(num) {
  if (num == null || isNaN(num)) return '$0';
  return '$' + Number(num).toLocaleString('zh-TW');
}

export default function YearEndPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name || '';

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Historical records
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Expanded detail
  const [expandedId, setExpandedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('inventory');

  // Validation
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Backup readiness
  const [backupReady, setBackupReady] = useState(null);

  // Execution
  const [step, setStep] = useState(1); // 1=validate, 2=preview, 3=confirm
  const [confirmText, setConfirmText] = useState('');
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Statement viewer modal
  const [statementModal, setStatementModal] = useState(null); // { loading, data }
  async function handleViewStatement(statementId) {
    setStatementModal({ loading: true, data: null });
    try {
      const res = await fetch(`/api/year-end/reports/${statementId}`);
      const data = await res.json();
      setStatementModal({ loading: false, data });
    } catch {
      setStatementModal({ loading: false, data: null });
    }
  }

  useEffect(() => {
    fetchRecords();
  }, []);

  async function fetchRecords() {
    setLoading(true);
    try {
      const res = await fetch('/api/year-end');
      const data = await res.json();
      if (data.records) {
        setRecords(data.records);
      }
    } catch (error) {
      console.error('載入年度結轉記錄失敗:', error);
    }
    setLoading(false);
  }

  // Check if the selected year has already been rolled over
  const yearRecord = records.find(r => r.year === selectedYear);
  const isYearCompleted = yearRecord?.status === '已完成';

  // Check backup readiness before validation
  async function checkBackupReady() {
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      const backups = Array.isArray(data) ? data : (data.backups || []);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentFull = backups.find(b =>
        b.tier === 'tier1_full' && new Date(b.createdAt) >= sevenDaysAgo
      );
      setBackupReady(!!recentFull);
    } catch {
      setBackupReady(false);
    }
  }

  // Validate pre-conditions
  async function handleValidate() {
    setValidating(true);
    setValidationResult(null);
    setExecutionResult(null);
    setBackupReady(null);
    setStep(1);

    // Check backup readiness first
    await checkBackupReady();

    try {
      const res = await fetch('/api/year-end/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear })
      });
      const data = await res.json();
      setValidationResult(data);
      if (data.valid) {
        setStep(2);
      }
    } catch (error) {
      setValidationResult({ valid: false, warnings: [{ type: 'error', message: '驗證失敗: ' + error.message }] });
    }
    setValidating(false);
  }

  // Execute year-end rollover
  async function handleExecute() {
    setExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch('/api/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          rolledOverBy: userName,
          preCheckSummary: validationResult?.summary || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setExecutionResult(data);
        fetchRecords();
      } else {
        setExecutionResult({ error: data.error?.message || '結轉失敗' });
      }
    } catch (error) {
      setExecutionResult({ error: '結轉失敗: ' + error.message });
    }
    setExecuting(false);
  }

  // Load detail for a record
  async function handleToggleDetail(record) {
    if (expandedId === record.id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }
    setExpandedId(record.id);
    setDetailData(null);
    setDetailLoading(true);
    setDetailTab('inventory');
    try {
      const res = await fetch(`/api/year-end/${record.id}`);
      const data = await res.json();
      setDetailData(data);
    } catch (error) {
      console.error('載入詳情失敗:', error);
    }
    setDetailLoading(false);
  }

  // Reset the flow
  function handleReset() {
    setStep(1);
    setValidationResult(null);
    setExecutionResult(null);
    setConfirmText('');
    setBackupReady(null);
  }

  const expectedConfirmText = `確認結轉 ${selectedYear} 年度`;

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    yearOptions.push(y);
  }

  // Status badge
  function StatusBadge({ status }) {
    const styles = {
      '進行中': 'bg-yellow-100 text-yellow-700',
      '已完成': 'bg-green-100 text-green-700',
      '失敗': 'bg-red-100 text-red-700'
    };
    const dotStyles = {
      '進行中': 'bg-yellow-400',
      '已完成': 'bg-green-500',
      '失敗': 'bg-red-500'
    };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        <span className={`w-2 h-2 rounded-full ${dotStyles[status] || 'bg-gray-400'}`}></span>
        {status}
      </span>
    );
  }

  // Render financial statement content
  function renderStatementContent(statement) {
    if (!statement?.statementData) return <p className="text-gray-500 text-sm">無資料</p>;
    const data = statement.statementData;

    switch (statement.statementType) {
      case '損益表':
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-violet-700">{selectedYear || data.year} 年度損益表</h4>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-violet-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">營業收入</p>
                <p className="text-lg font-bold text-violet-700">{formatCurrency(data.revenue?.totalRevenue)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">營業成本</p>
                <p className="text-lg font-bold text-orange-600">{formatCurrency(data.costOfGoodsSold)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">營業毛利</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(data.grossProfit)}</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${data.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-xs text-gray-500">稅前淨利</p>
                <p className={`text-lg font-bold ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(data.netIncome)}
                </p>
              </div>
            </div>

            {/* Revenue breakdown */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">收入明細</h5>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">發票銷售收入</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(data.revenue?.salesRevenue)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">PMS 營業收入</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(data.revenue?.pmsIncome)}</td>
                  </tr>
                  <tr className="bg-violet-50">
                    <td className="py-2 px-2 font-medium text-violet-700">營業收入合計</td>
                    <td className="py-2 px-2 text-right font-bold text-violet-700">{formatCurrency(data.revenue?.totalRevenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Expense breakdown */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">費用明細</h5>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">一般費用</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(data.operatingExpenses?.expenses)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">部門費用</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(data.operatingExpenses?.departmentExpenses)}</td>
                  </tr>
                  <tr className="bg-orange-50">
                    <td className="py-2 px-2 font-medium text-orange-700">營業費用合計</td>
                    <td className="py-2 px-2 text-right font-bold text-orange-700">{formatCurrency(data.operatingExpenses?.totalExpenses)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Monthly breakdown */}
            {data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">月度明細</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-violet-50">
                        <th className="text-left p-2 border border-violet-200">月份</th>
                        <th className="text-right p-2 border border-violet-200">收入</th>
                        <th className="text-right p-2 border border-violet-200">成本</th>
                        <th className="text-right p-2 border border-violet-200">毛利</th>
                        <th className="text-right p-2 border border-violet-200">費用</th>
                        <th className="text-right p-2 border border-violet-200">淨利</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthlyBreakdown.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2 border border-gray-200">{MONTH_NAMES[m.month - 1]}</td>
                          <td className="text-right p-2 border border-gray-200">{formatCurrency(m.revenue)}</td>
                          <td className="text-right p-2 border border-gray-200">{formatCurrency(m.cogs)}</td>
                          <td className="text-right p-2 border border-gray-200">{formatCurrency(m.grossProfit)}</td>
                          <td className="text-right p-2 border border-gray-200">{formatCurrency(m.expenses)}</td>
                          <td className={`text-right p-2 border border-gray-200 font-medium ${m.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(m.netIncome)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case '資產負債表':
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-violet-700">{data.year} 年度資產負債表</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assets */}
              <div className="border border-violet-200 rounded-lg p-4">
                <h5 className="font-medium text-violet-700 mb-3">資產</h5>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-600">現金及約當現金</td>
                      <td className="py-2 text-right">{formatCurrency(data.assets?.currentAssets?.cashAndEquivalents)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-600">存貨</td>
                      <td className="py-2 text-right">{formatCurrency(data.assets?.currentAssets?.inventory)}</td>
                    </tr>
                    <tr className="bg-violet-50">
                      <td className="py-2 px-2 font-medium">資產合計</td>
                      <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.assets?.totalAssets)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Liabilities & Equity */}
              <div className="border border-violet-200 rounded-lg p-4">
                <h5 className="font-medium text-violet-700 mb-3">負債與權益</h5>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-600">應付帳款</td>
                      <td className="py-2 text-right">{formatCurrency(data.liabilities?.currentLiabilities?.accountsPayable)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-600">長期貸款</td>
                      <td className="py-2 text-right">{formatCurrency(data.liabilities?.longTermLiabilities?.totalLongTermLiabilities)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-600">保留盈餘</td>
                      <td className="py-2 text-right">{formatCurrency(data.equity?.retainedEarnings)}</td>
                    </tr>
                    <tr className="bg-violet-50">
                      <td className="py-2 px-2 font-medium">負債及權益合計</td>
                      <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.balanceCheck?.totalLiabilitiesAndEquity)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance check */}
            <div className={`rounded-lg p-3 text-sm ${data.balanceCheck?.isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span className="font-medium">
                {data.balanceCheck?.isBalanced ? 'O 資產負債平衡' : '! 資產負債不平衡'}
              </span>
              <span className="ml-3">
                資產 {formatCurrency(data.balanceCheck?.totalAssets)} | 負債+權益 {formatCurrency(data.balanceCheck?.totalLiabilitiesAndEquity)}
              </span>
            </div>

            {/* Loan details */}
            {data.liabilities?.longTermLiabilities?.loanDetails?.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">貸款明細</h5>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 border border-gray-200">貸款名稱</th>
                      <th className="text-left p-2 border border-gray-200">銀行</th>
                      <th className="text-right p-2 border border-gray-200">餘額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.liabilities.longTermLiabilities.loanDetails.map((loan, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="p-2 border border-gray-200">{loan.name}</td>
                        <td className="p-2 border border-gray-200">{loan.bank}</td>
                        <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(loan.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case '現金流量表':
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-violet-700">{data.year} 年度現金流量表</h4>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">營業活動</p>
                <p className={`text-lg font-bold ${data.operatingActivities?.netOperating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(data.operatingActivities?.netOperating)}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">投資活動</p>
                <p className={`text-lg font-bold ${data.investingActivities?.netInvesting >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(data.investingActivities?.netInvesting)}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">理財活動</p>
                <p className={`text-lg font-bold ${data.financingActivities?.netFinancing >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                  {formatCurrency(data.financingActivities?.netFinancing)}
                </p>
              </div>
              <div className={`rounded-lg p-3 text-center ${data.netCashChange >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className="text-xs text-gray-500">淨現金變動</p>
                <p className={`text-lg font-bold ${data.netCashChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(data.netCashChange)}
                </p>
              </div>
            </div>

            {/* Activities detail */}
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[400px]">
              <thead>
                <tr className="bg-violet-50">
                  <th className="text-left p-2 border border-violet-200">項目</th>
                  <th className="text-right p-2 border border-violet-200">流入</th>
                  <th className="text-right p-2 border border-violet-200">流出</th>
                  <th className="text-right p-2 border border-violet-200">淨額</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">營業活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.operatingActivities?.income)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.operatingActivities?.expenses)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.operatingActivities?.netOperating)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">投資活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.investingActivities?.inflow)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.investingActivities?.outflow)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.investingActivities?.netInvesting)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">理財活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.financingActivities?.inflow)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.financingActivities?.outflow)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.financingActivities?.netFinancing)}</td>
                </tr>
                <tr className="bg-violet-50 font-medium">
                  <td className="p-2 border border-violet-200">合計</td>
                  <td className="p-2 border border-violet-200"></td>
                  <td className="p-2 border border-violet-200"></td>
                  <td className="text-right p-2 border border-violet-200 font-bold text-violet-700">{formatCurrency(data.netCashChange)}</td>
                </tr>
              </tbody>
            </table>
            </div>

            {/* Monthly breakdown */}
            {data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">月度明細</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-violet-50">
                        <th className="text-left p-2 border border-violet-200">月份</th>
                        <th className="text-right p-2 border border-violet-200">營業</th>
                        <th className="text-right p-2 border border-violet-200">投資</th>
                        <th className="text-right p-2 border border-violet-200">理財</th>
                        <th className="text-right p-2 border border-violet-200">淨額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthlyBreakdown.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2 border border-gray-200">{MONTH_NAMES[m.month - 1]}</td>
                          <td className={`text-right p-2 border border-gray-200 ${m.operating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(m.operating)}
                          </td>
                          <td className={`text-right p-2 border border-gray-200 ${m.investing >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatCurrency(m.investing)}
                          </td>
                          <td className={`text-right p-2 border border-gray-200 ${m.financing >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                            {formatCurrency(m.financing)}
                          </td>
                          <td className={`text-right p-2 border border-gray-200 font-medium ${m.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(m.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-400">
              總交易筆數: {data.totalTransactions || 0}
            </div>
          </div>
        );

      default:
        return (
          <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        );
    }
  }

  return (
    <div className="min-h-screen page-bg-year-end">
      <Navigation borderColor="border-violet-500" />

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-violet-800">年度結轉</h2>
            <p className="text-sm text-gray-500 mt-1">年末結帳、庫存結轉、現金餘額結轉及財務報表產生</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 font-medium">年度:</label>
            <select
              value={selectedYear}
              onChange={e => {
                setSelectedYear(parseInt(e.target.value));
                handleReset();
              }}
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

            {/* ========================================== */}
            {/* Historical Records Table */}
            {/* ========================================== */}
            {records.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-violet-200">
                <div className="px-6 py-4 border-b border-violet-100">
                  <h3 className="text-lg font-semibold text-violet-800">歷史年度結轉紀錄</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-violet-50">
                        <th className="text-left px-4 py-3 text-violet-700 font-medium">年度</th>
                        <th className="text-left px-4 py-3 text-violet-700 font-medium">狀態</th>
                        <th className="text-left px-4 py-3 text-violet-700 font-medium">執行者</th>
                        <th className="text-left px-4 py-3 text-violet-700 font-medium">執行時間</th>
                        <th className="text-right px-4 py-3 text-violet-700 font-medium">庫存快照</th>
                        <th className="text-right px-4 py-3 text-violet-700 font-medium">帳戶快照</th>
                        <th className="text-right px-4 py-3 text-violet-700 font-medium">保留盈餘</th>
                        <th className="text-center px-4 py-3 text-violet-700 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id}>
                          <td colSpan={8} className="p-0">
                            {/* Main row */}
                            <div className={`flex items-center hover:bg-violet-50/50 transition-colors cursor-pointer ${expandedId === record.id ? 'bg-violet-50/50' : ''}`}
                              onClick={() => record.status === '已完成' && handleToggleDetail(record)}
                            >
                              <div className="flex-none w-[80px] px-4 py-3 font-medium text-gray-800">{record.year}</div>
                              <div className="flex-none w-[100px] px-4 py-3"><StatusBadge status={record.status} /></div>
                              <div className="flex-none w-[120px] px-4 py-3 text-gray-600">{record.rolledOverBy || '-'}</div>
                              <div className="flex-none w-[160px] px-4 py-3 text-gray-600">
                                {record.rolledOverAt ? new Date(record.rolledOverAt).toLocaleString('zh-TW') : '-'}
                              </div>
                              <div className="flex-none w-[100px] px-4 py-3 text-right text-gray-600">{record.inventoryCount}</div>
                              <div className="flex-none w-[100px] px-4 py-3 text-right text-gray-600">{record.balanceCount}</div>
                              <div className="flex-none w-[120px] px-4 py-3 text-right font-medium text-gray-800">
                                {record.retainedEarnings != null ? formatCurrency(record.retainedEarnings) : '-'}
                              </div>
                              <div className="flex-1 px-4 py-3 text-center">
                                {record.status === '已完成' && (
                                  <button className="text-xs text-violet-600 hover:text-violet-800 underline">
                                    {expandedId === record.id ? '收合' : '展開詳情'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded detail */}
                            {expandedId === record.id && (
                              <div className="border-t border-violet-100 bg-violet-50/30 px-6 py-4">
                                {detailLoading && (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600"></div>
                                    <span className="ml-2 text-gray-500 text-sm">載入詳情...</span>
                                  </div>
                                )}

                                {detailData && (
                                  <div>
                                    {/* Tabs */}
                                    <div className="flex flex-wrap gap-1 mb-4 border-b border-violet-200">
                                      {[
                                        { key: 'inventory', label: '庫存快照', statementId: null },
                                        { key: 'balance', label: '帳戶餘額', statementId: null },
                                        ...detailData.financialStatements.map(s => ({
                                          key: `statement-${s.id}`,
                                          label: s.statementType,
                                          statementId: s.id
                                        }))
                                      ].map(tab => (
                                        <button
                                          key={tab.key}
                                          onClick={(e) => { e.stopPropagation(); setDetailTab(tab.key); }}
                                          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                            detailTab === tab.key
                                              ? 'border-violet-600 text-violet-700'
                                              : 'border-transparent text-gray-500 hover:text-violet-600'
                                          }`}
                                        >
                                          {tab.label}
                                        </button>
                                      ))}
                                    </div>

                                    {/* Tab content: Inventory */}
                                    {detailTab === 'inventory' && (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                          <thead>
                                            <tr className="bg-violet-100/50">
                                              <th className="text-left p-2 border border-violet-200">商品代碼</th>
                                              <th className="text-left p-2 border border-violet-200">商品名稱</th>
                                              <th className="text-right p-2 border border-violet-200">成本單價</th>
                                              <th className="text-right p-2 border border-violet-200">結存數量</th>
                                              <th className="text-right p-2 border border-violet-200">結存金額</th>
                                              <th className="text-center p-2 border border-violet-200">狀態</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {detailData.inventorySnapshots.length === 0 ? (
                                              <tr><td colSpan={6} className="p-4 text-center text-gray-500">無庫存快照資料</td></tr>
                                            ) : (
                                              detailData.inventorySnapshots.map((item) => (
                                                <tr key={item.id} className={`hover:bg-gray-50 ${item.isNegative ? 'bg-red-50' : ''}`}>
                                                  <td className="p-2 border border-gray-200 font-mono text-xs">{item.productCode}</td>
                                                  <td className="p-2 border border-gray-200">{item.productName}</td>
                                                  <td className="text-right p-2 border border-gray-200">{formatCurrency(item.costPrice)}</td>
                                                  <td className="text-right p-2 border border-gray-200">{formatNumber(item.closingQuantity)}</td>
                                                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(item.closingValue)}</td>
                                                  <td className="text-center p-2 border border-gray-200">
                                                    {item.isNegative ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                                        </svg>
                                                        調整歸零
                                                      </span>
                                                    ) : (
                                                      <span className="text-green-600 text-xs">正常</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))
                                            )}
                                          </tbody>
                                        </table>
                                        {detailData.inventorySnapshots.length > 0 && (
                                          <div className="mt-2 flex gap-4 text-xs text-gray-500">
                                            <span>共 {detailData.inventorySnapshots.length} 項商品</span>
                                            <span>
                                              總值: {formatCurrency(detailData.inventorySnapshots.reduce((s, i) => s + i.closingValue, 0))}
                                            </span>
                                            <span>
                                              負庫存: {detailData.inventorySnapshots.filter(i => i.isNegative).length} 項
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Tab content: Balance */}
                                    {detailTab === 'balance' && (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                          <thead>
                                            <tr className="bg-violet-100/50">
                                              <th className="text-left p-2 border border-violet-200">帳戶名稱</th>
                                              <th className="text-left p-2 border border-violet-200">帳戶類型</th>
                                              <th className="text-right p-2 border border-violet-200">期末餘額</th>
                                              <th className="text-right p-2 border border-violet-200">下年度期初</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {detailData.balanceRecords.length === 0 ? (
                                              <tr><td colSpan={4} className="p-4 text-center text-gray-500">無帳戶餘額資料</td></tr>
                                            ) : (
                                              detailData.balanceRecords.map((rec) => (
                                                <tr key={rec.id} className="hover:bg-gray-50">
                                                  <td className="p-2 border border-gray-200">{rec.accountName}</td>
                                                  <td className="p-2 border border-gray-200">{rec.accountType || '-'}</td>
                                                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(rec.closingBalance)}</td>
                                                  <td className="text-right p-2 border border-gray-200 font-medium text-violet-600">{formatCurrency(rec.nextYearOpeningBalance)}</td>
                                                </tr>
                                              ))
                                            )}
                                          </tbody>
                                        </table>
                                        {detailData.balanceRecords.length > 0 && (
                                          <div className="mt-2 flex gap-4 text-xs text-gray-500">
                                            <span>共 {detailData.balanceRecords.length} 個帳戶</span>
                                            <span>
                                              餘額合計: {formatCurrency(detailData.balanceRecords.reduce((s, r) => s + r.closingBalance, 0))}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Tab content: Financial statements */}
                                    {detailData.financialStatements.map(statement => (
                                      detailTab === `statement-${statement.id}` && (
                                        <div key={statement.id} className="overflow-x-auto">
                                          {renderStatementContent(statement)}
                                        </div>
                                      )
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* Current Year Rollover Section */}
            {/* ========================================== */}
            {!isYearCompleted && !executionResult?.success && (
              <div className="bg-white rounded-xl shadow-sm border border-violet-200">
                <div className="px-6 py-4 border-b border-violet-100">
                  <h3 className="text-lg font-semibold text-violet-800">{selectedYear} 年度結轉</h3>
                  <p className="text-sm text-gray-500 mt-1">依序完成前置驗證、預覽確認及結轉執行</p>
                </div>

                <div className="px-6 py-4">
                  {/* Step indicator */}
                  <div className="flex items-center gap-2 mb-6">
                    {[
                      { num: 1, label: '驗證前置條件' },
                      { num: 2, label: '預覽確認' },
                      { num: 3, label: '執行結轉' }
                    ].map((s, i) => (
                      <div key={s.num} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          step >= s.num
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                        }`}>
                          {step > s.num ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : s.num}
                        </div>
                        <span className={`ml-2 text-sm ${step >= s.num ? 'text-violet-700 font-medium' : 'text-gray-400'}`}>
                          {s.label}
                        </span>
                        {i < 2 && <div className={`w-12 h-0.5 mx-3 ${step > s.num ? 'bg-violet-400' : 'bg-gray-200'}`}></div>}
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Validate */}
                  {step === 1 && (
                    <div className="space-y-4">
                      <div className="text-center py-6">
                        <div className="w-16 h-16 mx-auto mb-4 bg-violet-100 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-semibold text-gray-800">驗證前置條件</h4>
                        <p className="text-sm text-gray-500 mt-1">檢查所有月份是否已鎖定、未沖銷發票及未兌現支票</p>
                      </div>

                      <div className="text-center">
                        <button
                          onClick={handleValidate}
                          disabled={validating}
                          className="px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium disabled:opacity-50"
                        >
                          {validating ? (
                            <span className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              驗證中...
                            </span>
                          ) : '開始驗證'}
                        </button>
                      </div>

                      {/* Backup readiness warning */}
                      {backupReady === false && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                          <p className="text-sm font-medium text-red-800">警告：近7天內無全量備份</p>
                          <p className="text-xs text-red-600 mt-1">建議在執行年度結轉前進行 Tier 1 全量備份</p>
                          <a href="/admin/backup" className="text-xs text-blue-600 hover:underline mt-2 inline-block">前往備份管理 →</a>
                        </div>
                      )}

                      {/* Validation results */}
                      {validationResult && !validationResult.valid && (
                        <div className="space-y-4 mt-6">
                          {/* Already completed */}
                          {validationResult.alreadyCompleted && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                              <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-green-700">{selectedYear} 年度已完成結轉</span>
                            </div>
                          )}

                          {/* Month status checklist */}
                          {validationResult.monthStatuses && validationResult.monthStatuses.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-3">月結狀態確認（12個月 x 各館別）</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-violet-50">
                                      <th className="text-left p-2 border border-violet-200">月份</th>
                                      {validationResult.monthStatuses[0]?.warehouses?.map((w, i) => (
                                        <th key={i} className="text-center p-2 border border-violet-200">{w.warehouseName}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {validationResult.monthStatuses.map((ms) => (
                                      <tr key={ms.month} className="hover:bg-gray-50">
                                        <td className="p-2 border border-gray-200 font-medium">{MONTH_NAMES[ms.month - 1]}</td>
                                        {ms.warehouses.map((w, i) => (
                                          <td key={i} className="text-center p-2 border border-gray-200">
                                            {w.isLocked ? (
                                              <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                            ) : (
                                              <div className="flex flex-col items-center">
                                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="text-red-500 mt-0.5">{w.status}</span>
                                              </div>
                                            )}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Warnings */}
                          {validationResult.warnings && validationResult.warnings.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-gray-700">注意事項</h4>
                              {validationResult.warnings.map((w, i) => (
                                <div
                                  key={i}
                                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                                    w.type === 'error'
                                      ? 'bg-red-50 border-red-200'
                                      : 'bg-yellow-50 border-yellow-200'
                                  }`}
                                >
                                  <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${w.type === 'error' ? 'text-red-500' : 'text-yellow-500'}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                  </svg>
                                  <div>
                                    <p className={`text-sm font-medium ${w.type === 'error' ? 'text-red-700' : 'text-yellow-700'}`}>
                                      {w.message}
                                    </p>
                                    {w.details && (
                                      <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                                        {w.details.map((d, j) => <li key={j}>{d}</li>)}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                            <strong>提醒:</strong> 所有月份必須為「已鎖定」狀態才能執行年度結轉。請先完成月結作業。
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Preview */}
                  {step === 2 && validationResult && (
                    <div className="space-y-6">
                      {/* Validation passed banner */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                        <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-green-800 font-medium">前置條件驗證通過</p>
                          <p className="text-green-600 text-sm">所有月份已鎖定，可以進行年度結轉</p>
                        </div>
                      </div>

                      {/* Preview cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Inventory preview */}
                        <div className="border border-violet-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                            <h4 className="font-medium text-violet-700">庫存結轉</h4>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">館別數</span>
                              <span className="font-medium">{validationResult.summary?.warehouseCount || 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">負庫存商品</span>
                              <span className={`font-medium ${validationResult.summary?.negativeInventoryCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {validationResult.summary?.negativeInventoryCount || 0}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 mt-3">將對所有庫存商品建立結存快照</p>
                        </div>

                        {/* Cash accounts preview */}
                        <div className="border border-violet-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <h4 className="font-medium text-emerald-700">現金帳戶結轉</h4>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">結轉方式</span>
                              <span className="font-medium">期末餘額結轉期初</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 mt-3">所有現金帳戶的 currentBalance 將設為新年度的 openingBalance</p>
                        </div>

                        {/* P&L preview */}
                        <div className="border border-violet-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                            </div>
                            <h4 className="font-medium text-blue-700">損益計算</h4>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">未沖銷發票</span>
                              <span className="font-medium">{validationResult.summary?.uncollectedAP || 0}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">未兌支票</span>
                              <span className="font-medium">{validationResult.summary?.unclearedChecks || 0}</span>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400 mt-3">將產生損益表、資產負債表及現金流量表</p>
                        </div>
                      </div>

                      {/* Warnings (advisory) */}
                      {validationResult.warnings && validationResult.warnings.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-gray-700">注意事項（不影響結轉執行）</h4>
                          {validationResult.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-yellow-50 border-yellow-200">
                              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              <p className="text-sm text-yellow-700">{w.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <button
                          onClick={handleReset}
                          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                        >
                          重新驗證
                        </button>
                        <button
                          onClick={() => setStep(3)}
                          className="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium text-sm"
                        >
                          下一步：確認結轉
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Confirm & Execute */}
                  {step === 3 && (
                    <div className="space-y-6">
                      {/* Big warning */}
                      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-red-800">年度結轉為不可逆操作，請確認所有資料正確</h4>
                            <ul className="mt-3 space-y-1 text-sm text-red-700">
                              <li>- 所有庫存商品將建立結存快照</li>
                              <li>- 現金帳戶的期末餘額將設為下年度期初餘額</li>
                              <li>- 年度損益將計算並記錄為保留盈餘</li>
                              <li>- 將產生損益表、資產負債表、現金流量表</li>
                              <li>- 此操作無法撤銷</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Confirmation text input */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          請輸入「<span className="text-violet-600 font-bold">{expectedConfirmText}</span>」以確認執行
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={e => setConfirmText(e.target.value)}
                          placeholder={expectedConfirmText}
                          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => { setStep(2); setConfirmText(''); }}
                          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
                        >
                          上一步
                        </button>
                        <button
                          onClick={handleExecute}
                          disabled={confirmText !== expectedConfirmText || executing}
                          className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {executing ? (
                            <span className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              執行結轉中...
                            </span>
                          ) : '確認執行年度結轉'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* Execution Result */}
            {/* ========================================== */}
            {executionResult && (
              <div className="bg-white rounded-xl shadow-sm border border-violet-200">
                <div className="px-6 py-4 border-b border-violet-100">
                  <h3 className="text-lg font-semibold text-violet-800">結轉結果</h3>
                </div>
                <div className="px-6 py-4">
                  {executionResult.error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-red-700 font-medium">{executionResult.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Success banner */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                        <svg className="w-8 h-8 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-green-800 font-bold text-lg">{selectedYear} 年度結轉完成</p>
                          <p className="text-green-600 text-sm">
                            執行時間: {executionResult.rolledOverAt ? new Date(executionResult.rolledOverAt).toLocaleString('zh-TW') : '-'}
                          </p>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-violet-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500">庫存商品數</p>
                          <p className="text-2xl font-bold text-violet-700">{executionResult.summary?.inventoryProducts || 0}</p>
                        </div>
                        <div className="bg-violet-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500">庫存總值</p>
                          <p className="text-xl font-bold text-violet-700">{formatCurrency(executionResult.summary?.inventoryTotalValue)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-gray-500">現金帳戶數</p>
                          <p className="text-2xl font-bold text-emerald-700">{executionResult.summary?.cashAccounts || 0}</p>
                        </div>
                        <div className={`rounded-lg p-4 text-center ${
                          executionResult.summary?.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                          <p className="text-xs text-gray-500">稅前淨利（保留盈餘）</p>
                          <p className={`text-xl font-bold ${
                            executionResult.summary?.netIncome >= 0 ? 'text-green-700' : 'text-red-700'
                          }`}>
                            {formatCurrency(executionResult.summary?.netIncome)}
                          </p>
                        </div>
                      </div>

                      {/* P&L detail */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">營業收入</p>
                          <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.revenue)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">營業成本</p>
                          <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.cogs)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">營業費用</p>
                          <p className="text-lg font-medium text-gray-800">{formatCurrency(executionResult.summary?.expenses)}</p>
                        </div>
                      </div>

                      {/* Generated statements */}
                      {executionResult.summary?.statements && executionResult.summary.statements.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">已產生財務報表</h4>
                          <div className="space-y-2">
                            {executionResult.summary.statements.map((s) => (
                              <div key={s.id} className="flex items-center justify-between p-3 bg-violet-50 rounded-lg border border-violet-200">
                                <div>
                                  <span className="text-sm font-medium text-violet-700">{s.type}</span>
                                  <span className="text-xs text-gray-400 ml-2">
                                    {new Date(s.generatedAt).toLocaleString('zh-TW')}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleViewStatement(s.id)}
                                  className="text-xs text-violet-600 hover:text-violet-800 underline"
                                >
                                  查看明細
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Completed sections */}
                      {executionResult.completedSections && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">完成項目</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {[
                              { key: 'inventory', label: '庫存結轉' },
                              { key: 'cashBalance', label: '現金餘額結轉' },
                              { key: 'profitLoss', label: '損益計算' },
                              { key: 'statements', label: '財務報表' }
                            ].map(section => (
                              <div key={section.key} className={`flex items-center gap-2 p-2 rounded ${
                                executionResult.completedSections[section.key]
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-gray-50 text-gray-500'
                              }`}>
                                {executionResult.completedSections[section.key] ? (
                                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                <span className="text-sm">{section.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Already completed message (from records) */}
            {isYearCompleted && !executionResult && (
              <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6">
                <div className="flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-green-800 font-bold text-lg">{selectedYear} 年度已完成結轉</p>
                    <p className="text-green-600 text-sm">
                      由 {yearRecord?.rolledOverBy || '-'} 於 {yearRecord?.rolledOverAt ? new Date(yearRecord.rolledOverAt).toLocaleString('zh-TW') : '-'} 執行
                    </p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  請在上方歷史紀錄表中點選「展開詳情」查看庫存快照、帳戶餘額及財務報表。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* Statement Viewer Modal */}
      {/* ========================================== */}
      {statementModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-violet-200 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-violet-800">
                {statementModal.data?.statementType || '財務報表'}
              </h3>
              <button
                onClick={() => setStatementModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4">
              {statementModal.loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                  <span className="ml-3 text-gray-500">載入報表中...</span>
                </div>
              )}
              {!statementModal.loading && statementModal.data && (
                <>
                  <div className="text-xs text-gray-400 mb-4">
                    產生時間：{statementModal.data.generatedAt ? new Date(statementModal.data.generatedAt).toLocaleString('zh-TW') : '-'}
                    {statementModal.data.generatedBy && ` ｜ 由 ${statementModal.data.generatedBy}`}
                    {statementModal.data.yearEnd && ` ｜ ${statementModal.data.yearEnd.year} 年度`}
                  </div>
                  {renderStatementContent(statementModal.data)}
                </>
              )}
              {!statementModal.loading && !statementModal.data && (
                <p className="text-gray-500 text-center py-8">載入失敗，請重試</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
