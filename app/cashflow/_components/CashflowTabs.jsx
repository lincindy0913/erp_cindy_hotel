'use client';

import { TABS } from '../_hooks/useCashflow';

export default function CashflowTabs({ activeTab, setActiveTab, fetchTransactions, fetchSummary }) {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => {
            setActiveTab(tab.key);
            if (tab.key === 'transactions') fetchTransactions();
            if (tab.key === 'forecast') fetchSummary();
          }}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === tab.key
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
