'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { formatNum } from '@/lib/engineering/format-utils';

const ENG_FILTER_KEY = 'engineering_filters';

export default function ProjectsTab({
  projects = [],
  contracts = [],
  suppliers = [],
  warehouseDepartments = {},
  onAdd,
  onEdit,
  onDelete,
}) {
  // ── 篩選 state（localStorage 持久化）──────────────────────────────
  const [searchDateFrom, setSearchDateFrom] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENG_FILTER_KEY) || '{}').dateFrom || ''; } catch { return ''; }
  });
  const [searchDateTo, setSearchDateTo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENG_FILTER_KEY) || '{}').dateTo || ''; } catch { return ''; }
  });
  const [searchSupplierId, setSearchSupplierId] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENG_FILTER_KEY) || '{}').warehouse || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ENG_FILTER_KEY, JSON.stringify({
        dateFrom: searchDateFrom, dateTo: searchDateTo, warehouse: searchWarehouse,
      }));
    } catch {}
  }, [searchDateFrom, searchDateTo, searchWarehouse]);

  const { sortKey, sortDir, toggleSort } = useColumnSort('code', 'asc');

  const filteredProjects = useMemo(() => projects.filter(p => {
    if (searchDateFrom) { const pEnd = p.endDate || '9999-12-31'; if (pEnd < searchDateFrom) return false; }
    if (searchDateTo)   { const pStart = p.startDate || '0000-01-01'; if (pStart > searchDateTo) return false; }
    if (searchWarehouse) { const whName = p.warehouseRef?.name || p.warehouse || ''; if (whName !== searchWarehouse) return false; }
    if (searchSupplierId) {
      const sid = parseInt(searchSupplierId);
      const hasSupplier = (p.contracts || []).some(c => c.supplierId === sid);
      if (!hasSupplier) return false;
    }
    return true;
  }), [projects, searchDateFrom, searchDateTo, searchWarehouse, searchSupplierId]);

  const sortedProjects = useMemo(() => sortRows(filteredProjects, sortKey, sortDir, {
    code: p => p.code || '',
    name: p => p.name || '',
    clientName: p => p.clientName || '',
    whDept: p => p.warehouseRef?.name || p.warehouse || '',
    location: p => p.location || '',
    startDate: p => p.startDate || '',
    endDate: p => p.endDate || '',
    budget: p => Number(p.budget || 0),
    status: p => p.status || '',
  }), [filteredProjects, sortKey, sortDir]);

  function buildProjectRows() {
    return sortedProjects.map(p => {
      const projContracts = contracts.filter(c =>
        c.projectId === p.id &&
        (!searchSupplierId || String(c.supplierId) === searchSupplierId)
      );
      const totalContractAmt = projContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
      const supplierNames = [...new Set(projContracts.map(c => c.supplier?.name).filter(Boolean))].join('、');
      return { ...p, totalContractAmt, supplierNames };
    });
  }

  function handlePrint() {
    if (sortedProjects.length === 0) return;
    const rows = buildProjectRows();
    const grandTotal = rows.reduce((s, p) => s + Number(p.budget || 0), 0);
    const grandContract = rows.reduce((s, p) => s + p.totalContractAmt, 0);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>工程案列表</title>
<style>body{font-family:"Microsoft JhengHei",sans-serif;margin:20px;font-size:12px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px}th{background:#f5f5f5}.right{text-align:right}.total{font-weight:bold;background:#fef3c7}@media print{body{margin:0}}</style>
</head><body><h2>工程案列表</h2><div style="text-align:right;font-size:10px;color:#999">${new Date().toLocaleString('zh-TW')}</div>
<table><thead><tr><th>代碼</th><th>名稱</th><th>業主</th><th>館別</th><th>廠商</th><th>起日</th><th>迄日</th><th class="right">預算</th><th class="right">合約總額</th><th>狀態</th></tr></thead><tbody>
${rows.map(p => `<tr><td>${p.code||''}</td><td>${p.name||''}</td><td>${p.clientName||''}</td><td>${p.warehouseRef?.name||p.warehouse||''}</td><td>${p.supplierNames||''}</td><td>${p.startDate||''}</td><td>${p.endDate||''}</td><td class="right">${formatNum(p.budget)}</td><td class="right">${formatNum(p.totalContractAmt)}</td><td>${p.status||''}</td></tr>`).join('')}
<tr class="total"><td colspan="7">合計（${rows.length} 筆）</td><td class="right">${formatNum(grandTotal)}</td><td class="right">${formatNum(grandContract)}</td><td></td></tr>
</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  function handleExportCsv() {
    if (sortedProjects.length === 0) return;
    const rows = buildProjectRows();
    const header = ['代碼', '名稱', '業主', '館別', '廠商', '起日', '迄日', '預算', '合約總額', '狀態'];
    const csvRows = rows.map(p =>
      [p.code||'', p.name||'', p.clientName||'', p.warehouseRef?.name||p.warehouse||'', p.supplierNames||'', p.startDate||'', p.endDate||'', p.budget||0, p.totalContractAmt, p.status||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    );
    const csv = '﻿' + [header.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '工程案列表.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const warehouses = (warehouseDepartments?.list || []).filter(w => w.type === 'building');
  const isFiltered = searchDateFrom || searchDateTo || searchSupplierId || searchWarehouse;

  return (
    <>
      {/* 篩選列 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="pt-from" className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input id="pt-from" type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label htmlFor="pt-to" className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input id="pt-to" type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label htmlFor="pt-sup" className="block text-xs text-gray-500 mb-1">廠商</label>
            <select id="pt-sup" value={searchSupplierId} onChange={e => setSearchSupplierId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[140px]">
              <option value="">全部</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pt-wh" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="pt-wh" value={searchWarehouse} onChange={e => setSearchWarehouse(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[120px]">
              <option value="">全部</option>
              {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setSearchDateFrom(''); setSearchDateTo(''); setSearchSupplierId(''); setSearchWarehouse(''); }}
            className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >清除</button>
          <button type="button" onClick={handlePrint} className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">列印</button>
          <button type="button" onClick={handleExportCsv} className="px-4 py-1.5 bg-white border border-green-600 text-green-700 rounded-lg hover:bg-green-50 text-sm">匯出 CSV</button>
          {isFiltered && (
            <span className="text-xs text-amber-600">篩選中：{filteredProjects.length} / {projects.length} 筆</span>
          )}
        </div>
      </div>

      {/* 工程案表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">工程案列表</h3>
          <button onClick={onAdd} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增工程案</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <SortableTh label="代碼" colKey="code" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="名稱" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="業主" colKey="clientName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="館別／部門" colKey="whDept" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="工程地點／建造(使)造號碼" colKey="location" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="起日" colKey="startDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="迄日" colKey="endDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <SortableTh label="預算" colKey="budget" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" align="right" />
                <SortableTh label="狀態" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 py-2" />
                <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    {isFiltered ? '無符合條件的工程案' : '尚無工程案，請新增'}
                  </td>
                </tr>
              ) : sortedProjects.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/engineering/${p.id}`} className="text-amber-700 hover:underline">{p.code}</Link>
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/engineering/${p.id}`} className="hover:text-amber-700 hover:underline">{p.name}</Link>
                  </td>
                  <td className="px-4 py-2">{p.clientName || '－'}</td>
                  <td className="px-4 py-2">{p.warehouseRef?.name || p.warehouse || '－'} {p.departmentRef ? `／${p.departmentRef.name}` : ''}</td>
                  <td className="px-4 py-2 text-xs">{p.location || '－'} {(p.buildingNo || p.permitNo) ? `（${[p.buildingNo, p.permitNo].filter(Boolean).join('、')}）` : ''}</td>
                  <td className="px-4 py-2">{p.startDate || '－'}</td>
                  <td className="px-4 py-2">{p.endDate || '－'}</td>
                  <td className="px-4 py-2 text-right">{formatNum(p.budget)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.status === '已結案' ? 'bg-gray-200' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => onEdit(p)} className="text-amber-600 hover:underline mr-2">編輯</button>
                    <button onClick={() => onDelete(p)} className="text-red-600 hover:underline">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
