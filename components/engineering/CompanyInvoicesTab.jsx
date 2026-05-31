'use client';
import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';

function makeCompanyInvPeriods() {
  const today = new Date();
  const minRoc = (today.getFullYear() - 1911) - 2;
  const maxRoc = (today.getFullYear() - 1911) + 1;
  const result = [];
  for (let y = minRoc; y <= maxRoc; y++) {
    result.push(`${y}.1-2`, `${y}.3-4`, `${y}.5-6`, `${y}.7-8`, `${y}.9-10`, `${y}.11-12`);
  }
  return result;
}
const COMPANY_INV_PERIODS = makeCompanyInvPeriods();

export default function CompanyInvoicesTab({ projects, onUnassignedCountChange }) {
  const [companyInvoices, setCompanyInvoices] = useState([]);
  const [companyInvLoading, setCompanyInvLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [updating, setUpdating] = useState({});

  const { showToast } = useToast();

  useEffect(() => {
    fetchCompanyInvoices();
  }, []);

  async function fetchCompanyInvoices(pid, period) {
    setCompanyInvLoading(true);
    try {
      const params = new URLSearchParams({ type: 'invoice' });
      if (pid) params.set('projectId', pid);
      if (period) params.set('period', period);
      const res = await fetch(`/api/company-expenses?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCompanyInvoices(list);
      onUnassignedCountChange?.(list.filter(r => !r.projectId).length);
    } catch { setCompanyInvoices([]); }
    finally { setCompanyInvLoading(false); }
  }

  async function updateInvoiceProject(invoiceId, projectId) {
    setUpdating(prev => ({ ...prev, [invoiceId]: true }));
    try {
      const res = await fetch(`/api/company-expenses/input-invoice/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId ? Number(projectId) : null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setCompanyInvoices(prev => {
        const next = prev.map(r => r.id === invoiceId ? { ...r, projectId: updated.projectId, project: updated.project } : r);
        onUnassignedCountChange?.(next.filter(r => !r.projectId).length);
        return next;
      });
    } catch {
      showToast('案件更新失敗', 'error');
    } finally {
      setUpdating(prev => ({ ...prev, [invoiceId]: false }));
    }
  }

  const filtered = companyInvoices.filter(r => !vendorFilter || (r.vendorName || '').includes(vendorFilter));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
          <option value="">全部案件</option>
          {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          <option value="null">未分配</option>
        </select>
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
          <option value="">全部期間</option>
          {COMPANY_INV_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
          placeholder="廠商名稱搜尋…" className="border rounded px-3 py-1.5 text-sm w-36" />
        <button onClick={() => fetchCompanyInvoices(projectFilter || undefined, periodFilter || undefined)}
          className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">
          {companyInvLoading ? '載入中…' : '查詢'}
        </button>
        {(projectFilter || periodFilter || vendorFilter) && (
          <button onClick={() => { setProjectFilter(''); setPeriodFilter(''); setVendorFilter(''); fetchCompanyInvoices(); }}
            className="text-xs text-gray-500 hover:text-gray-700 border rounded px-2 py-1.5">清除</button>
        )}
        <span className="text-xs text-gray-500 ml-auto">
          共 {filtered.length} 筆｜合計 NT${filtered.reduce((s, r) => s + Number(r.totalAmount || 0), 0).toLocaleString('zh-TW')}
        </span>
      </div>

      {!projectFilter && (() => {
        const byProject = {};
        companyInvoices.forEach(r => {
          const key = r.project ? `${r.project.id}` : 'null';
          const label = r.project ? r.project.name : '未分配（待歸檔）';
          if (!byProject[key]) byProject[key] = { label, cnt: 0, total: 0 };
          byProject[key].cnt++;
          byProject[key].total += Number(r.totalAmount || 0);
        });
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(byProject).map(([key, v]) => (
              <div key={key}
                onClick={() => { setProjectFilter(key); fetchCompanyInvoices(key === 'null' ? 'null' : key); }}
                className={`bg-white rounded-lg shadow-sm p-3 border-l-4 cursor-pointer hover:shadow ${key === 'null' ? 'border-amber-400' : 'border-teal-500'}`}>
                <p className="text-xs text-gray-500 truncate">{v.label}</p>
                <p className="text-sm font-bold mt-1">NT${v.total.toLocaleString('zh-TW')}</p>
                <p className="text-xs text-gray-400">{v.cnt} 筆</p>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">期別</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">日期</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">發票號碼</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">廠商名稱</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">品名</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">未稅</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">含稅</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">案件</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">地點</th>
            </tr>
          </thead>
          <tbody>
            {companyInvoices.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">{companyInvLoading ? '載入中…' : '無資料'}</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className={`border-t hover:bg-gray-50 ${!r.projectId ? 'bg-amber-50' : ''}`}>
                <td className="px-3 py-1.5 text-xs text-gray-500">{r.period || '—'}</td>
                <td className="px-3 py-1.5 text-xs">{r.invoiceDate}</td>
                <td className="px-3 py-1.5 text-xs font-mono">{r.invoiceNo || '—'}</td>
                <td className="px-3 py-1.5 text-xs">{r.vendorName || '—'}</td>
                <td className="px-3 py-1.5 text-xs max-w-[180px] truncate" title={r.itemName}>{r.itemName || '—'}</td>
                <td className="px-3 py-1.5 text-xs text-right">{Number(r.amount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-1.5 text-xs text-right font-medium">{Number(r.totalAmount).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-1.5 text-xs">
                  <select
                    value={r.projectId ? String(r.projectId) : ''}
                    onChange={e => updateInvoiceProject(r.id, e.target.value || null)}
                    disabled={!!updating[r.id]}
                    className={`border rounded px-1.5 py-0.5 text-xs max-w-[150px] ${r.projectId ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-amber-50 text-amber-700 border-amber-200'} ${updating[r.id] ? 'opacity-50' : ''}`}
                  >
                    <option value="">未分配</option>
                    {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-500">{r.location || '—'}</td>
              </tr>
            ))}
          </tbody>
          {companyInvoices.length > 0 && (
            <tfoot className="bg-gray-50 font-semibold text-sm">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right text-xs">合計</td>
                <td className="px-3 py-2 text-right text-xs">{companyInvoices.reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-xs text-teal-700">{companyInvoices.reduce((s, r) => s + Number(r.totalAmount || 0), 0).toLocaleString('zh-TW')}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
