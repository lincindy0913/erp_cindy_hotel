'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * 通用流程說明卡片（仿 EngineeringHeaderInsights 樣式）
 *
 * Props:
 *   title   string          — 標題列文字
 *   steps   Array<{         — 流程步驟清單
 *     label: string,        — 步驟名稱（粗體）
 *     desc:  string,        — 補充說明
 *     link?: { href, text } — 選填：附連結
 *   }>
 *   color   'amber'|'slate'|'violet'|'blue'  — 配色（預設 amber）
 *   defaultOpen  boolean    — 預設展開（預設 false）
 */
export default function ModuleGuideCard({ title, steps = [], color = 'amber', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  const palette = {
    amber:  { header: 'bg-amber-50/80 text-amber-900 border-amber-100 hover:bg-amber-50', chevron: 'text-amber-600', border: 'border-amber-100' },
    slate:  { header: 'bg-slate-50/80 text-slate-900 border-slate-100 hover:bg-slate-50',  chevron: 'text-slate-500',  border: 'border-slate-100'  },
    violet: { header: 'bg-violet-50/80 text-violet-900 border-violet-100 hover:bg-violet-50', chevron: 'text-violet-500', border: 'border-violet-100' },
    blue:   { header: 'bg-blue-50/80 text-blue-900 border-blue-100 hover:bg-blue-50',    chevron: 'text-blue-500',   border: 'border-blue-100'   },
  }[color] ?? palette?.amber;

  return (
    <div className={`bg-white rounded-xl border ${palette.border} shadow-sm overflow-hidden mb-6`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left text-sm font-medium ${palette.header} border-b ${palette.border}`}
      >
        <span>{title}</span>
        <span className={palette.chevron}>{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <ol className="px-4 py-3 space-y-2 text-sm text-gray-700">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center font-medium mt-0.5">
                {i + 1}
              </span>
              <span>
                <strong className="text-gray-900">{step.label}</strong>
                {step.desc && <span className="text-gray-500"> — {step.desc}</span>}
                {step.link && (
                  <Link href={step.link.href} className="ml-1 text-indigo-600 underline text-xs">
                    {step.link.text}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
