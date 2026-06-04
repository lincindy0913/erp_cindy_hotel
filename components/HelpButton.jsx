'use client';

import Link from 'next/link';

/**
 * 情境式說明按鈕 — 連到手冊對應章節
 *
 * Usage:
 *   <HelpButton anchor="十八工程管理" />
 *   <HelpButton />  ← 連到手冊首頁
 */
export default function HelpButton({ anchor = '', label = '使用說明', className = '' }) {
  const href = anchor ? `/manual#${anchor}` : '/manual';
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={`inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors ${className}`}
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-300 hover:border-blue-400 font-bold leading-none">
        ?
      </span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
