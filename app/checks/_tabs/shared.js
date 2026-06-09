'use client';

import { parseLocalDate } from '@/lib/localDate';

export const STATUS_MAP = {
  pending: { label: '待處理', color: 'bg-gray-100 text-gray-700' },
  due: { label: '到期', color: 'bg-orange-100 text-orange-700' },
  cleared: { label: '已兌現', color: 'bg-green-100 text-green-700' },
  bounced: { label: '退票', color: 'bg-red-100 text-red-700' },
  void: { label: '作廢', color: 'bg-gray-300 text-gray-600' }
};

export function StatusBadge({ status }) {
  const info = STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-sm font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

export function getDueDateColor(dueDate) {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(dueDate);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 font-bold';
  if (diffDays === 0) return 'text-red-600 font-bold';
  if (diffDays <= 3) return 'text-orange-600 font-semibold';
  if (diffDays <= 7) return 'text-yellow-600';
  if (diffDays <= 30) return 'text-gray-600';
  return 'text-gray-500';
}

export function getDueDateLabel(dueDate) {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(dueDate);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `(逾期 ${Math.abs(diffDays)} 天)`;
  if (diffDays === 0) return '(今日到期)';
  if (diffDays <= 7) return `(${diffDays} 天後到期)`;
  return '';
}

export function Modal({ isOpen, onClose, title, children, width = 'max-w-lg' }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 no-print">
      <div className={`bg-white rounded-xl shadow-2xl ${width} w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
