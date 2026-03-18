'use client';

import { useState, useCallback } from 'react';

/**
 * 依欄位排序列資料；accessors[colKey](row) 回傳可比較值
 */
export function sortRows(rows, sortKey, dir, accessors = {}) {
  if (!sortKey || !Array.isArray(rows) || rows.length === 0) return [...rows];
  const get = accessors[sortKey] || ((r) => r[sortKey]);
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va = get(a);
    let vb = get(b);
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return mul * (va - vb);
    const da = typeof va === 'string' && /^\d{4}-\d{2}/.test(va) ? new Date(va).getTime() : NaN;
    const db = typeof vb === 'string' && /^\d{4}-\d{2}/.test(vb) ? new Date(vb).getTime() : NaN;
    if (!Number.isNaN(da) && !Number.isNaN(db)) return mul * (da - db);
    const na = Number(va);
    const nb = Number(vb);
    if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return mul * (na - nb);
    return mul * String(va).localeCompare(String(vb), 'zh-Hant', { numeric: true, sensitivity: 'base' });
  });
}

export function useColumnSort(defaultKey = null, defaultDir = 'desc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const toggleSort = useCallback(
    (key) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );
  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir };
}

/** Tailwind 表格抬頭 */
export function SortableTh({ label, colKey, sortKey, sortDir, onSort, className = '', align = 'left' }) {
  const asc = sortKey === colKey && sortDir === 'asc';
  const desc = sortKey === colKey && sortDir === 'desc';
  const alignCls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const btnCls =
    align === 'right'
      ? 'inline-flex flex-row-reverse items-center gap-1'
      : 'inline-flex items-center gap-1';
  return (
    <th className={`${className} ${alignCls} text-sm font-medium text-gray-700 whitespace-nowrap`}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`${btnCls} rounded px-1 py-0.5 hover:bg-gray-100/80 text-left max-w-full`}
      >
        <span>{label}</span>
        <span
          className="flex flex-col leading-[0.65] text-[9px] select-none shrink-0"
          aria-hidden
        >
          <span className={asc ? 'text-gray-900 font-black' : 'text-gray-300'}>▲</span>
          <span className={desc ? 'text-gray-900 font-black' : 'text-gray-300'}>▼</span>
        </span>
      </button>
    </th>
  );
}

/** 內聯 style 表格（expenses / employee-advances） */
export function SortableThInline({ label, colKey, sortKey, sortDir, onSort, thStyle = {}, align = 'left' }) {
  const asc = sortKey === colKey && sortDir === 'asc';
  const desc = sortKey === colKey && sortDir === 'desc';
  return (
    <th style={{ ...thStyle, textAlign: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left' }}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexDirection: align === 'right' ? 'row-reverse' : 'row',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          font: 'inherit',
          fontWeight: 600,
          color: '#374151',
        }}
      >
        <span>{label}</span>
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.65, fontSize: 9 }}>
          <span style={{ color: asc ? '#111' : '#d1d5db', fontWeight: asc ? 900 : 400 }}>▲</span>
          <span style={{ color: desc ? '#111' : '#d1d5db', fontWeight: desc ? 900 : 400 }}>▼</span>
        </span>
      </button>
    </th>
  );
}
