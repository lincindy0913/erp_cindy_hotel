'use client';

import { TABS } from '../_hooks/useRentalsPage';

export default function RentalTabBar({ activeTab, expiringContractCount, switchTab }) {
  return (
    <div className="no-print flex gap-1 mb-6 border-b overflow-x-auto">
      {TABS.map(tab => (
        <button key={tab.key} onClick={() => switchTab(tab.key)}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors inline-flex items-center gap-1 ${
            activeTab === tab.key
              ? 'border-teal-500 text-teal-700 bg-teal-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}>
          {tab.label}
          {tab.key === 'contracts' && expiringContractCount > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-semibold min-w-[18px] text-center">
              {expiringContractCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
