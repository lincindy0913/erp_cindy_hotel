'use client';

export default function PmsIncomeSortIcon({ field, sortField, sortDir }) {
  if (sortField !== field) return <span className="text-gray-300 ml-1">&#8597;</span>;
  return <span className="text-teal-600 ml-1">{sortDir === 'asc' ? '&#9650;' : '&#9660;'}</span>;
}
