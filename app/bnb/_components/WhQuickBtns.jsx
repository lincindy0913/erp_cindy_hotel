'use client';

export default function WhQuickBtns({ list = [], value, onChange }) {
  return list.map(wh => (
    <button key={wh} type="button"
      onClick={() => onChange(value === wh ? '' : wh)}
      className={`text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap ${value === wh ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'}`}>
      {wh}
    </button>
  ));
}
