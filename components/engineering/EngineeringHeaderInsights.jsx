'use client';

import Link from 'next/link';
import { useState } from 'react';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * 工程會計頂部：流程說明、全模組 KPI、逾期期數提醒
 */
export default function EngineeringHeaderInsights({ stats, onSwitchTab }) {
  const [helpOpen, setHelpOpen] = useState(false);

  if (!stats) return null;

  const {
    projectCount,
    activeProjects,
    sumBudget,
    sumClient,
    sumVendorContracts,
    paidExecuted,
    sumIncome,
    overdueTerms,
    dueThisWeek,
  } = stats;

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHelpOpen((o) => !o)}
          className="w-full px-4 py-3 flex items-center justify-between text-left text-sm font-medium text-amber-900 bg-amber-50/80 hover:bg-amber-50 border-b border-amber-100"
        >
          <span>請款流程說明（工程付款單 vs 費用／一般付款）</span>
          <span className="text-amber-600">{helpOpen ? '▼' : '▶'}</span>
        </button>
        {helpOpen && (
          <div className="px-4 py-3 text-sm text-gray-700 space-y-2 bg-white">
            <p>
              <strong className="text-gray-900">工程模組「付款單」</strong>
              ：綁定<strong>工程案／廠商合約期數</strong>之發包請款，送出後由<strong>出納</strong>執行；與工地進度、期數核銷一致時請由此建立。
            </p>
            <p>
              <strong className="text-gray-900">費用／採購／一般付款申請</strong>
              ：人事行政、零星採購、未綁工程合約期數之支出，請至「<Link href="/expenses" className="text-amber-700 underline">費用</Link>」「<Link href="/purchasing" className="text-amber-700 underline">進貨</Link>」或財務付款流程，避免與工程期數混淆。
            </p>
            <p className="text-xs text-gray-500">
              材料「領用」於本頁登錄後與合約／期數勾稽；若需同步扣減庫存，請另依公司規範於進銷存開立調撥或領料單。
            </p>
          </div>
        )}
      </div>

      {(overdueTerms > 0 || dueThisWeek > 0) && (
        <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3 ${overdueTerms > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {overdueTerms > 0 && (
            <p className="text-sm text-red-800 font-medium">
              有 <strong>{overdueTerms}</strong> 筆合約期數已過應付日且仍有未付金額（請查「合約與期數」或「專案管理」）。
            </p>
          )}
          {dueThisWeek > 0 && (
            <p className="text-sm text-amber-900">
              本週內到期期數：<strong>{dueThisWeek}</strong> 筆
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={() => onSwitchTab('contracts')} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50">
              合約與期數
            </button>
            <button type="button" onClick={() => onSwitchTab('projectMgmt')} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50">
              專案管理
            </button>
            <button type="button" onClick={() => onSwitchTab('payments')} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700">
              付款單
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">工程案（進行中）</p>
          <p className="text-lg font-bold text-gray-800">{activeProjects} <span className="text-xs font-normal text-gray-400">/ {projectCount}</span></p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">預算合計</p>
          <p className="text-lg font-bold text-gray-800">${formatNum(sumBudget)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">業主合約額（登錄）</p>
          <p className="text-lg font-bold text-indigo-800">${formatNum(sumClient)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">廠商發包合計</p>
          <p className="text-lg font-bold text-amber-800">${formatNum(sumVendorContracts)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">工程付款已執行</p>
          <p className="text-lg font-bold text-green-700">${formatNum(paidExecuted)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">收款登錄累計</p>
          <p className="text-lg font-bold text-teal-700">${formatNum(sumIncome)}</p>
        </div>
      </div>
    </div>
  );
}
