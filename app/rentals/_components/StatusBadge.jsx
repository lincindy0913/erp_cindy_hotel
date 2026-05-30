'use client';

export default function StatusBadge({ value, list }) {
  const item = list.find(s => s.value === value);
  if (!item) return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{value}</span>;
  return <span className={`text-xs px-2 py-0.5 rounded ${item.color}`}>{item.label}</span>;
}
