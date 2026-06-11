'use client';

const COLOR_MAP = {
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-red-50 border-red-200 text-red-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
};

export function SummaryCard({ label, value, sub, color = 'gray', small = false }) {
  return (
    <div className={`rounded-lg border p-3 ${COLOR_MAP[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-bold ${small ? 'text-lg' : 'text-xl'}`}>{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-70">{sub}</p>}
    </div>
  );
}
