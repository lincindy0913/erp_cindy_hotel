'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';

const ASSET_TYPE_OPTIONS = [
  { value: 'BUILDING', label: '建物' },
  { value: 'LAND', label: '土地' },
  { value: 'MIXED', label: '混合' },
  { value: 'OTHER', label: '其他' },
];

function fmtMoney(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return String(n);
  return x.toLocaleString('zh-TW');
}

function AssetsPageInner() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const linkOpenedRef = useRef(false);

  const userPerms = session?.user?.permissions || [];
  const isAdmin = session?.user?.role === 'admin';
  const canWildcard = isAdmin || userPerms.includes('*');
  const canCreate = canWildcard || hasPermission(userPerms, PERMISSIONS.RENTAL_CREATE);
  const canEdit = canWildcard || hasPermission(userPerms, PERMISSIONS.RENTAL_EDIT);

  const [assets, setAssets] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [linkedTaxes, setLinkedTaxes] = useState([]);
  const [linkedMaint, setLinkedMaint] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [plYear, setPlYear] = useState(new Date().getFullYear());
  const [plData, setPlData] = useState(null);
  const [plLoading, setPlLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    assetType: 'BUILDING',
    address: '',
    areaSqm: '',
    acquisitionDate: '',
    notes: '',
    rentalPropertyId: '',
  });

  const highlightPropertyId = searchParams.get('propertyId');
  const highlightAssetId = searchParams.get('id');
  const linkProperty = searchParams.get('linkProperty');

  const loadAssets = useCallback(async () => {
    const res = await fetch('/api/assets');
    const data = await res.json();
    if (!res.ok) {
      showToast(data?.error?.message || data?.error || '載入資產失敗', 'error');
      setAssets([]);
      return;
    }
    setAssets(Array.isArray(data) ? data : []);
  }, [showToast]);

  const loadProperties = useCallback(async () => {
    const res = await fetch('/api/rentals/properties');
    const data = await res.json();
    if (!res.ok) {
      setProperties([]);
      return;
    }
    setProperties(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadAssets(), loadProperties()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadAssets, loadProperties]);

  useEffect(() => {
    if (!highlightAssetId || assets.length === 0) return;
    const id = parseInt(highlightAssetId, 10);
    if (Number.isNaN(id)) return;
    const row = assets.find((a) => a.id === id);
    if (row) setSelected(row);
  }, [highlightAssetId, assets]);

  useEffect(() => {
    if (linkOpenedRef.current || !linkProperty || properties.length === 0) return;
    linkOpenedRef.current = true;
    setEditing(null);
    setForm((f) => ({ ...f, rentalPropertyId: linkProperty }));
    setShowModal(true);
  }, [linkProperty, properties.length]);

  useEffect(() => {
    const pid = selected?.rentalPropertyId;
    if (!pid) {
      setLinkedTaxes([]);
      setLinkedMaint([]);
      setPlData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLinkedLoading(true);
      try {
        const [tRes, mRes] = await Promise.all([
          fetch(`/api/rentals/taxes?propertyId=${pid}`),
          fetch(`/api/rentals/maintenance?propertyId=${pid}`),
        ]);
        const tData = await tRes.json();
        const mData = await mRes.json();
        if (cancelled) return;
        setLinkedTaxes(tRes.ok && Array.isArray(tData) ? tData : []);
        setLinkedMaint(mRes.ok && Array.isArray(mData) ? mData : []);
      } catch {
        if (!cancelled) {
          setLinkedTaxes([]);
          setLinkedMaint([]);
        }
      } finally {
        if (!cancelled) setLinkedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected?.rentalPropertyId]);

  async function fetchPL(pid, year) {
    if (!pid) return;
    setPlLoading(true);
    setPlData(null);
    try {
      const res = await fetch(`/api/rentals/reports/operating?propertyId=${pid}&year=${year}`);
      const data = await res.json();
      if (res.ok && data.rows?.length > 0) setPlData(data.rows[0]);
      else setPlData({ empty: true });
    } catch { setPlData({ empty: true }); }
    setPlLoading(false);
  }

  useEffect(() => {
    if (selected?.rentalPropertyId) fetchPL(selected.rentalPropertyId, plYear);
  }, [selected?.rentalPropertyId, plYear]);

  const propertyOptions = useMemo(() => {
    return properties.filter((p) => {
      if (!p.asset) return true;
      if (editing && p.asset.id === editing.id) return true;
      return false;
    });
  }, [properties, editing]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: '',
      assetType: 'BUILDING',
      address: '',
      areaSqm: '',
      acquisitionDate: '',
      notes: '',
      rentalPropertyId: linkProperty || '',
    });
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({
      name: a.name || '',
      assetType: a.assetType || 'BUILDING',
      address: a.address || '',
      areaSqm: a.areaSqm != null ? String(a.areaSqm) : '',
      acquisitionDate: a.acquisitionDate || '',
      notes: a.notes || '',
      rentalPropertyId: a.rentalPropertyId != null ? String(a.rentalPropertyId) : '',
    });
    setShowModal(true);
  }

  async function saveModal() {
    if (!form.name.trim()) {
      showToast('請填寫資產名稱', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        assetType: form.assetType,
        address: form.address.trim() || null,
        areaSqm: form.areaSqm === '' ? null : form.areaSqm,
        acquisitionDate: form.acquisitionDate || null,
        notes: form.notes.trim() || null,
        rentalPropertyId: form.rentalPropertyId === '' ? null : form.rentalPropertyId,
      };
      const url = editing ? `/api/assets/${editing.id}` : '/api/assets';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error?.message || data?.error || '儲存失敗', 'error');
        return;
      }
      showToast(editing ? '已更新' : '已建立', 'success');
      setShowModal(false);
      await loadAssets();
      await loadProperties();
      if (editing && selected?.id === editing.id) {
        setSelected(data);
      }
      if (!editing && data?.id) {
        setSelected(data);
      }
    } catch (e) {
      showToast('儲存失敗', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset(a) {
    if (!canEdit) return;
    if (!confirm(`確定刪除資產「${a.name}」？`)) return;
    const res = await fetch(`/api/assets/${a.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data?.error?.message || data?.error || '刪除失敗', 'error');
      return;
    }
    showToast('已刪除', 'success');
    if (selected?.id === a.id) setSelected(null);
    await loadAssets();
    await loadProperties();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-teal-500" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">資產管理</h2>
            <p className="text-sm text-gray-600 mt-1">
              資產主檔可選擇綁定一筆租屋物業；房屋稅／地價稅與維護費仍請於「租屋管理」內登錄，此處僅彙總顯示。
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              新增資產
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-500 py-8">載入中…</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-teal-50">
                <tr>
                  <th className="text-left px-3 py-2">名稱</th>
                  <th className="text-left px-3 py-2">類型</th>
                  <th className="text-left px-3 py-2">地址</th>
                  <th className="text-right px-3 py-2">面積（㎡）</th>
                  <th className="text-left px-3 py-2">綁定物業</th>
                  <th className="text-center px-3 py-2 w-40">操作</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">尚無資產資料</td>
                  </tr>
                ) : (
                  assets.map((a) => {
                    const rowHighlight =
                      (highlightPropertyId && String(a.rentalPropertyId || '') === highlightPropertyId) ||
                      (highlightAssetId && String(a.id) === highlightAssetId);
                    return (
                      <tr
                        key={a.id}
                        className={`border-t cursor-pointer hover:bg-gray-50 ${rowHighlight ? 'bg-amber-50' : ''} ${selected?.id === a.id ? 'bg-teal-50/60' : ''}`}
                        onClick={() => setSelected(a)}
                      >
                        <td className="px-3 py-2 font-medium">{a.name}</td>
                        <td className="px-3 py-2">
                          {ASSET_TYPE_OPTIONS.find((o) => o.value === a.assetType)?.label || a.assetType}
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={a.address || ''}>
                          {a.address || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {a.areaSqm != null ? String(a.areaSqm) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {a.rentalProperty ? (
                            <Link
                              href={`/rentals?tab=properties`}
                              className="text-teal-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {a.rentalProperty.name}
                            </Link>
                          ) : (
                            <span className="text-gray-400">未綁定</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <>
                              <button type="button" className="text-blue-600 hover:underline text-xs mr-2" onClick={() => openEdit(a)}>編輯</button>
                              <button type="button" className="text-red-600 hover:underline text-xs" onClick={() => deleteAsset(a)}>刪除</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-white">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">選取：{selected.name}</h3>
            <div className="text-sm text-gray-600 space-y-1 mb-4">
              <p>類型：{ASSET_TYPE_OPTIONS.find((o) => o.value === selected.assetType)?.label || selected.assetType}</p>
              {selected.address && <p>地址：{selected.address}</p>}
              {selected.areaSqm && <p>面積：{String(selected.areaSqm)} ㎡</p>}
              {selected.acquisitionDate && <p>取得日期：{selected.acquisitionDate}</p>}
              {selected.rentalPropertyId ? (
                <p>
                  租屋物業：
                  <Link className="text-teal-700 hover:underline ml-1" href="/rentals?tab=properties">
                    {selected.rentalProperty?.name || `#${selected.rentalPropertyId}`}
                  </Link>
                  <span className="mx-2 text-gray-300">|</span>
                  <Link className="text-teal-700 hover:underline" href="/rentals?tab=taxes">前往稅款</Link>
                  <span className="mx-2 text-gray-300">|</span>
                  <Link className="text-teal-700 hover:underline" href="/rentals?tab=maintenance">前往維護費</Link>
                </p>
              ) : (
                <p className="text-gray-500">尚未綁定物業，稅款與維護費請至「租屋管理」登錄。</p>
              )}
            </div>

            {selected.rentalPropertyId && (
              <>
                {/* 損益卡 */}
                <div className="mb-5">
                  <div className="flex items-center gap-3 mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">年度損益卡</h4>
                    <select value={plYear} onChange={e => setPlYear(Number(e.target.value))}
                      className="border rounded px-2 py-1 text-xs">
                      {[0,1,2,3].map(d => {
                        const y = new Date().getFullYear() - d;
                        return <option key={y} value={y}>{y} 年</option>;
                      })}
                    </select>
                    <button onClick={() => fetchPL(selected.rentalPropertyId, plYear)}
                      className="text-xs text-teal-600 hover:text-teal-800 underline">重新載入</button>
                  </div>
                  {plLoading ? (
                    <p className="text-xs text-gray-400">載入中…</p>
                  ) : plData && !plData.empty ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                      <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                        <p className="text-xs text-gray-500">租金收入</p>
                        <p className="text-base font-bold text-teal-700">NT$ {fmtMoney(plData.rentIncome)}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                        <p className="text-xs text-gray-500">稅費合計</p>
                        <p className="text-base font-bold text-red-600">NT$ {fmtMoney(plData.taxAmount)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">（含維修 {fmtMoney(plData.maintenanceAmount)}）</p>
                      </div>
                      <div className={`rounded-lg p-3 border ${plData.netProfit >= 0 ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                        <p className="text-xs text-gray-500">年度淨額</p>
                        <p className={`text-base font-bold ${plData.netProfit >= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                          NT$ {fmtMoney(plData.netProfit)}
                        </p>
                        {plData.profitMarginPercent != null && (
                          <p className="text-xs text-gray-400 mt-0.5">利潤率 {plData.profitMarginPercent}%</p>
                        )}
                      </div>
                      {plData.netProfitPerSqm != null ? (
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                          <p className="text-xs text-gray-500">每坪淨收益</p>
                          <p className="text-base font-bold text-purple-700">NT$ {fmtMoney(plData.netProfitPerSqm)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{String(plData.areaSqm)} ㎡</p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="text-xs text-gray-400">每坪淨收益</p>
                          <p className="text-xs text-gray-400 mt-1">（請在資產主檔填入面積）</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">{plYear} 年無收支資料</p>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-gray-700 mb-2">稅款（該物業）</h4>
                {linkedLoading ? (
                  <p className="text-xs text-gray-400 mb-4">載入稅款與維護…</p>
                ) : (
                  <>
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-xs border">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-2 py-1">年度</th>
                            <th className="text-left px-2 py-1">類型</th>
                            <th className="text-right px-2 py-1">金額</th>
                            <th className="text-left px-2 py-1">狀態</th>
                            <th className="text-left px-2 py-1">到期日</th>
                            <th className="text-left px-2 py-1">憑證號</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedTaxes.length === 0 ? (
                            <tr><td colSpan={6} className="px-2 py-2 text-gray-400">無稅款紀錄</td></tr>
                          ) : (
                            linkedTaxes.slice(0, 15).map((t) => (
                              <tr key={t.id} className="border-t">
                                <td className="px-2 py-1">{t.taxYear}</td>
                                <td className="px-2 py-1">{t.taxType}</td>
                                <td className="px-2 py-1 text-right">{fmtMoney(t.amount)}</td>
                                <td className="px-2 py-1">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {t.status === 'paid' ? '已繳' : '待繳'}
                                  </span>
                                </td>
                                <td className="px-2 py-1">{t.dueDate || '—'}</td>
                                <td className="px-2 py-1 text-gray-400">{t.certNo || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <h4 className="text-sm font-semibold text-gray-700 mb-2">維護費（該物業）</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-2 py-1">日期</th>
                            <th className="text-left px-2 py-1">類別</th>
                            <th className="text-right px-2 py-1">金額</th>
                            <th className="text-left px-2 py-1">性質</th>
                            <th className="text-left px-2 py-1">狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linkedMaint.length === 0 ? (
                            <tr><td colSpan={5} className="px-2 py-2 text-gray-400">無維護紀錄</td></tr>
                          ) : (
                            linkedMaint.slice(0, 15).map((m) => (
                              <tr key={m.id} className="border-t">
                                <td className="px-2 py-1">{m.maintenanceDate}</td>
                                <td className="px-2 py-1">{m.category}</td>
                                <td className="px-2 py-1 text-right">{fmtMoney(m.amount)}</td>
                                <td className="px-2 py-1">
                                  {m.isCapitalized && <span className="bg-blue-100 text-blue-700 px-1 rounded mr-1">資本化</span>}
                                  {m.isRecurring && <span className="bg-gray-100 text-gray-600 px-1 rounded">例行</span>}
                                </td>
                                <td className="px-2 py-1">{m.status || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {(linkedTaxes.length > 15 || linkedMaint.length > 15) && (
                      <p className="text-xs text-gray-500 mt-2">僅顯示前 15 筆，完整資料請至租屋管理各分頁。</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !saving && setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editing ? '編輯資產' : '新增資產'}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600">名稱 *</label>
                <input
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-600">資產類型</label>
                <select
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.assetType}
                  onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
                >
                  {ASSET_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-600">地址</label>
                <input
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-600">面積（㎡）</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.areaSqm}
                  onChange={(e) => setForm((f) => ({ ...f, areaSqm: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-600">取得日期（選填）</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.acquisitionDate}
                  onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-600">綁定租屋物業（選填，一物業僅能綁一筆資產）</label>
                <select
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={form.rentalPropertyId}
                  onChange={(e) => setForm((f) => ({ ...f, rentalPropertyId: e.target.value }))}
                >
                  <option value="">不綁定</option>
                  {propertyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.buildingName ? `${p.buildingName} · ` : ''}{p.name}{p.unitNo ? `（${p.unitNo}）` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-600">備註</label>
                <textarea
                  className="w-full border rounded px-3 py-2 mt-1"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300" onClick={() => setShowModal(false)}>取消</button>
              <button type="button" disabled={saving} className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50" onClick={saveModal}>
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={(
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-teal-500" />
        <div className="max-w-7xl mx-auto px-4 py-6 text-gray-500">載入中…</div>
      </div>
    )}
    >
      <AssetsPageInner />
    </Suspense>
  );
}
