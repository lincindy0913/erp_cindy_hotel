'use client';

import { SortableTh } from '@/components/SortableTh';

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

const LOAN_STATUS_BADGES = {
  '使用中': 'bg-green-100 text-green-800',
  '已結清': 'bg-blue-100 text-blue-800',
  '已停用': 'bg-gray-100 text-gray-600'
};

const OWNER_TYPES = ['公司', '個人'];

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

function formatDate(d) {
  if (!d) return '-';
  return d;
}

export default function OverviewTab({
  activeLoans,
  totalBalance,
  thisMonthDue,
  monthlyYear,
  monthlyMonth,
  overdueLoans,
  filterWarehouse,
  setFilterWarehouse,
  filterStatus,
  setFilterStatus,
  filterOwnerType,
  setFilterOwnerType,
  warehouses,
  isLoggedIn,
  openAddLoan,
  filteredLoans,
  sortedFilteredLoans,
  loanOvKey,
  loanOvDir,
  toggleLoanOv,
  getDueDateWarning,
  openEditLoan,
  deleteLoan,
}) {
  return (
    <div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">貸款總數</p>
          <p className="text-2xl font-bold text-indigo-700">{activeLoans.length}</p>
          <p className="text-xs text-gray-400 mt-1">使用中</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500">貸款餘額合計</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalBalance)}</p>
          <p className="text-xs text-gray-400 mt-1">所有使用中貸款</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">本月待核實</p>
          <p className="text-2xl font-bold text-yellow-700">{thisMonthDue}</p>
          <p className="text-xs text-gray-400 mt-1">{monthlyYear}/{monthlyMonth}月暫估</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">已到期貸款</p>
          <p className="text-2xl font-bold text-red-700">{overdueLoans}</p>
          <p className="text-xs text-gray-400 mt-1">需關注</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部館別</option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部狀態</option>
          <option value="使用中">使用中</option>
          <option value="已結清">已結清</option>
          <option value="已停用">已停用</option>
        </select>
        <select value={filterOwnerType} onChange={e => setFilterOwnerType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部類型</option>
          {OWNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex-1" />
        {isLoggedIn && (
          <button onClick={openAddLoan} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
            + 新增貸款
          </button>
        )}
      </div>

      {/* Loans Table */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <SortableTh label="貸款編號" colKey="loanCode" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                <SortableTh label="銀行" colKey="bankName" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                <SortableTh label="館別" colKey="warehouse" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                <SortableTh label="原始金額" colKey="originalAmount" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="right" />
                <SortableTh label="目前餘額" colKey="currentBalance" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="right" />
                <SortableTh label="年利率" colKey="annualRate" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                <SortableTh label="到期日" colKey="endDate" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                <SortableTh label="扣款帳戶" colKey="deductAccount" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                <SortableTh label="狀態" colKey="status" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-gray-400">暫無貸款資料</td>
                </tr>
              ) : sortedFilteredLoans.map(loan => {
                const warning = getDueDateWarning(loan.endDate);
                return (
                  <tr key={loan.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">{loan.loanCode}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{loan.loanName}</div>
                      <div className="text-xs text-gray-400">{loan.ownerType}{loan.ownerName ? ` - ${loan.ownerName}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{loan.bankName}</td>
                    <td className="px-4 py-3 text-gray-700">{loan.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(loan.originalAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(loan.currentBalance)}</td>
                    <td className="px-4 py-3 text-center">{loan.annualRate}%</td>
                    <td className="px-4 py-3 text-center">
                      <div>{formatDate(loan.endDate)}</div>
                      {warning && (
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${warning.class}`}>
                          {warning.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">{loan.deductAccount?.name || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${LOAN_STATUS_BADGES[loan.status] || 'bg-gray-100'}`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isLoggedIn && (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => openEditLoan(loan)} className="text-indigo-600 hover:text-indigo-800 text-xs px-2 py-1 rounded hover:bg-indigo-50">
                            編輯
                          </button>
                          <button onClick={() => deleteLoan(loan)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
