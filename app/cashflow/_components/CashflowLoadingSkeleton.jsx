'use client';

import Navigation from '@/components/Navigation';

export default function CashflowLoadingSkeleton() {
  return (
    <div className="min-h-screen page-bg-cashflow">
      <Navigation borderColor="border-emerald-600" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm h-24 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-6 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
        </div>
      </main>
    </div>
  );
}
