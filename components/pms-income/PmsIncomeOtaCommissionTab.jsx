'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '@/context/ToastContext';

const OTA_SOURCES = ['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', 'OTA-易遊網', 'OTA-MOMO', 'OTA-Klook', 'OTA-KKday', 'OTA-雄獅', 'OTA-可樂旅遊', '代訂中心'];
const SOURCE_COLORS = {
  'OTA-Booking':  'bg-blue-100 text-blue-700',
  'OTA-Agoda':    'bg-red-100 text-red-700',
  'OTA-Expedia':  'bg-yellow-100 text-yellow-800',
  'OTA-易遊網':   'bg-green-100 text-green-700',
  'OTA-MOMO':     'bg-pink-100 text-pink-700',
  'OTA-Klook':    'bg-orange-100 text-orange-700',
  'OTA-KKday':    'bg-teal-100 text-teal-700',
  'OTA-雄獅':     'bg-indigo-100 text-indigo-700',
  'OTA-可樂旅遊': 'bg-violet-100 text-violet-700',
  '代訂中心':     'bg-purple-100 text-purple-700',
};

function cfgForSource(cfgList, source) {
  return cfgList.find(c => {
    const n = c.companyName.toLowerCase();
    if (source === 'OTA-Booking') return /booking/.test(n);
    if (source === 'OTA-Agoda')   return /agoda/.test(n);
    if (source === 'OTA-Expedia') return /expedia/.test(n);
    if (source === 'OTA-易遊網')  return /易遊|eztravel/.test(n);
    if (source === 'OTA-MOMO')    return /momo/.test(n);
    if (source === 'OTA-Klook')   return /klook/.test(n);
    if (source === 'OTA-KKday')   return /kkday/.test(n);
    return c.companyName === source;
  });
}

/**
 * 試算佣金：
 *  1. 若 wireTransfer > 0：佣金 = totalRevenue - wireTransfer（OTA 付 NET 款給飯店）
 *  2. 否則用設定費率：佣金 = totalRevenue × configRate
 *  3. 若兩者皆無資料則為 null（無法試算）
 */
function estimateCommission(r, cfg) {
  const total = Number(r.totalRevenue) || 0;
  if (total === 0) return null;
  const wire = Number(r.wireTransfer) || 0;
  if (wire > 0 && wire < total) return Math.round(total - wire);
  if (cfg) return Math.round(total * Number(cfg.commissionPercentage) / 100);
  return null;
}

function fmt(n) {
  if (n == null || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}

// ── CSV 解析（支援引號逸脫） ──
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return null;

  function splitLine(line) {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(nonEmpty[0]).map(h => h.replace(/^"|"$/g, ''));
  const rows = nonEmpty.slice(1).map(splitLine);
  return { headers, rows };
}

// ── Booking.com 欄位自動偵測 ──
function autoDetectMapping(headers) {
  const map = { reservationId: -1, guestName: -1, commission: -1, totalPrice: -1, checkIn: -1, netPayment: -1 };
  headers.forEach((h, i) => {
    const s = h.toLowerCase().replace(/[\s_\-]/g, '');
    if (map.reservationId < 0 && /reservation|confirm|booking.*no|bookingno|訂房|預訂|序號/.test(s)) map.reservationId = i;
    if (map.guestName < 0    && /guest|name|客人|旅客|姓名/.test(s))                                 map.guestName = i;
    if (map.commission < 0   && /commission|佣金/.test(s))                                           map.commission = i;
    if (map.totalPrice < 0   && /totalprice|totalamount|grandtotal|totalbooking|總金額|房費|total/.test(s)) map.totalPrice = i;
    if (map.checkIn < 0      && /checkin|arrival|入住|到達/.test(s))                                 map.checkIn = i;
    if (map.netPayment < 0   && /net|payment|匯款|淨額/.test(s))                                    map.netPayment = i;
  });
  return map;
}

function toNum(v) {
  if (v == null || v === '') return 0;
  return parseFloat(String(v).replace(/[,$\s]/g, '')) || 0;
}

// ── Booking.com 帳單匯入與比對 ──
function BookingStatementPanel({ bookingRows }) {
  const fileRef = useRef(null);
  const [csvData, setCsvData] = useState(null);  // { headers, rows }
  const [mapping, setMapping] = useState(null);  // autoDetectMapping result
  const [matchResult, setMatchResult] = useState(null);
  const [parseError, setParseError] = useState('');
  const [showAll, setShowAll] = useState(false);

  function handleFile(file) {
    if (!file) return;
    setParseError('');
    setCsvData(null);
    setMatchResult(null);

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const parsed = parseCSV(text);
      if (!parsed) { setParseError('CSV 解析失敗，請確認檔案格式正確'); return; }
      const detected = autoDetectMapping(parsed.headers);
      setCsvData(parsed);
      setMapping(detected);
    };
    reader.onerror = () => setParseError('讀取失敗');
    reader.readAsText(file, 'UTF-8');
  }

  function runMatch() {
    if (!csvData || !mapping) return;
    const results = csvData.rows
      .filter(row => row.some(c => c))  // skip blank rows
      .map(row => {
        const rawId = mapping.reservationId >= 0 ? row[mapping.reservationId] : '';
        const resId = rawId.replace(/^[^0-9A-Za-z]/, '').trim();
        const guestName = mapping.guestName >= 0 ? row[mapping.guestName] : '';
        const csvCommission = toNum(mapping.commission >= 0 ? row[mapping.commission] : '');
        const csvTotal = toNum(mapping.totalPrice >= 0 ? row[mapping.totalPrice] : '');
        const csvNet = toNum(mapping.netPayment >= 0 ? row[mapping.netPayment] : '');
        const checkIn = mapping.checkIn >= 0 ? row[mapping.checkIn] : '';

        // 比對邏輯：先用訂房序號比對，再用住客名稱模糊比對
        const match = bookingRows.find(r => {
          if (resId) {
            if (r.bookingNo && r.bookingNo.includes(resId)) return true;
            if (r.bookingRef && r.bookingRef.includes(resId)) return true;
            if (r.reservationNo && r.reservationNo.includes(resId)) return true;
          }
          if (guestName && r.guestName) {
            const a = guestName.toLowerCase().replace(/\s/g, '');
            const b = r.guestName.toLowerCase().replace(/\s/g, '');
            if (a.length >= 3 && b.includes(a.slice(0, 4))) return true;
          }
          return false;
        });

        const sysCommission = match?.commission || 0;
        const commissionDiff = csvCommission ? Math.round(Math.abs(csvCommission - sysCommission)) : null;

        return { resId, guestName, checkIn, csvCommission, csvTotal, csvNet, match, commissionDiff, hasDiff: commissionDiff > 50 };
      });

    setMatchResult(results);
  }

  const matched = matchResult?.filter(r => r.match) || [];
  const unmatched = matchResult?.filter(r => !r.match) || [];
  const diffRows = matchResult?.filter(r => r.hasDiff) || [];

  return (
    <div className="border border-blue-100 rounded-xl bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-900">Booking.com 帳單比對</span>
        <span className="text-xs text-blue-500">上傳 CSV 帳單，自動比對系統訂單與佣金差異</span>
      </div>

      {/* 上傳區 */}
      <div
        className="border-2 border-dashed border-blue-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
        <p className="text-sm text-blue-700">點擊上傳 Booking.com CSV 帳單</p>
        <p className="text-xs text-blue-400 mt-0.5">支援 UTF-8 或 Windows CSV，含「訂房編號」與「佣金」欄位</p>
      </div>

      {parseError && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{parseError}</p>}

      {csvData && mapping && (
        <div className="space-y-3">
          {/* 欄位偵測結果 */}
          <div className="bg-white rounded-lg border border-blue-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-800">偵測到欄位對應（可確認是否正確）</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[
                ['訂房編號', 'reservationId'],
                ['住客姓名', 'guestName'],
                ['佣金',     'commission'],
                ['總金額',   'totalPrice'],
                ['入住日期', 'checkIn'],
                ['NET 收款', 'netPayment'],
              ].map(([label, key]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="text-gray-500 shrink-0">{label}：</span>
                  <select
                    className="flex-1 border border-gray-200 rounded px-1 py-0.5 text-xs"
                    value={mapping[key]}
                    onChange={e => setMapping(prev => ({ ...prev, [key]: parseInt(e.target.value) }))}
                  >
                    <option value={-1}>（未偵測）</option>
                    {csvData.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">CSV 共 {csvData.rows.length} 筆、{csvData.headers.length} 欄</p>
          </div>

          <button
            onClick={runMatch}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            開始比對
          </button>
        </div>
      )}

      {matchResult && (
        <div className="space-y-3">
          {/* 比對結果摘要 */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-green-700">{matched.length}</div>
              <div className="text-green-600">已比對</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-700">{unmatched.length}</div>
              <div className="text-amber-600">未比對</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-red-700">{diffRows.length}</div>
              <div className="text-red-600">佣金差異</div>
            </div>
          </div>

          {diffRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2">
              <p className="text-xs font-semibold text-red-800 mb-1">⚠ 佣金差異 &gt; NT$50 的訂單</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-red-700">
                    <tr>
                      <th className="text-left px-2 py-1">訂房編號</th>
                      <th className="text-left px-2 py-1">住客</th>
                      <th className="text-right px-2 py-1">帳單佣金</th>
                      <th className="text-right px-2 py-1">系統佣金</th>
                      <th className="text-right px-2 py-1">差額</th>
                      <th className="text-center px-2 py-1">PMS 發票號</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {diffRows.map((r, i) => (
                      <tr key={i} className="bg-white">
                        <td className="px-2 py-1 font-mono text-gray-600">{r.resId || '—'}</td>
                        <td className="px-2 py-1">{r.match?.guestName || r.guestName || '—'}</td>
                        <td className="px-2 py-1 text-right text-blue-700">{r.csvCommission.toLocaleString('zh-TW')}</td>
                        <td className="px-2 py-1 text-right text-gray-600">{(r.match?.commission || 0).toLocaleString('zh-TW')}</td>
                        <td className="px-2 py-1 text-right font-bold text-red-700">{r.commissionDiff.toLocaleString('zh-TW')}</td>
                        <td className="px-2 py-1 text-center">
                          {r.match?.invoiceNo
                            ? <span className="font-mono text-indigo-700">{r.match.invoiceNo}</span>
                            : <span className="text-amber-500">未開</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
              <p className="text-xs font-semibold text-amber-800 mb-1">未比對到系統訂單（{unmatched.length} 筆）</p>
              <p className="text-xs text-amber-600 mb-1.5">以下帳單項目無法在系統中找到對應訂房記錄，請手動確認</p>
              <div className="flex flex-wrap gap-1">
                {(showAll ? unmatched : unmatched.slice(0, 8)).map((r, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                    {r.resId || r.guestName || `第 ${i + 1} 筆`}
                  </span>
                ))}
                {!showAll && unmatched.length > 8 && (
                  <button onClick={() => setShowAll(true)} className="text-xs text-amber-600 hover:underline">+{unmatched.length - 8} 筆…</button>
                )}
              </div>
            </div>
          )}

          {diffRows.length === 0 && unmatched.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 font-medium">
              ✓ 所有帳單訂單均已比對，且佣金金額無明顯差異
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PmsIncomeOtaCommissionTab({ WAREHOUSES = [] }) {
  const { showToast } = useToast();
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sourceFilter, setSourceFilter] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [applying, setApplying] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showBookingImport, setShowBookingImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '1000' });
      if (warehouse) params.set('warehouse', warehouse);
      if (month) params.set('month', month);
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (res.ok) {
        const all = await res.json();
        setRows(all.filter(r => {
          const src = r.sourceOverride || r.source;
          return OTA_SOURCES.includes(src);
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/pms-income/travel-agency-config')
      .then(r => r.ok ? r.json() : [])
      .then(setConfigs)
      .catch(() => {});
  }, []);

  const displayed = rows.filter(r => {
    if (sourceFilter !== '全部' && (r.sourceOverride || r.source) !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hit = (r.guestName    || '').toLowerCase().includes(q)
               || (r.companyName  || '').toLowerCase().includes(q)
               || (r.bookingRef   || '').toLowerCase().includes(q)
               || (r.bookingNo    || '').toLowerCase().includes(q)
               || (r.reservationNo|| '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  // 試算佣金（每筆）
  const withEstimate = useMemo(() => displayed.map(r => {
    const src = r.sourceOverride || r.source;
    const cfg = cfgForSource(configs, src);
    const estimated = estimateCommission(r, cfg);
    return { ...r, estimated };
  }), [displayed, configs]);

  // 套用試算結果（只套用佣金為 0 且有試算值的訂單）
  async function applyEstimates() {
    const toUpdate = withEstimate.filter(r => !r.commission && r.estimated !== null);
    if (toUpdate.length === 0) { showToast('所有 OTA 訂單已有佣金資料，無需試算套用', 'info'); return; }
    if (!confirm(`確定要將 ${toUpdate.length} 筆 OTA 訂單的試算佣金套用為實際佣金嗎？`)) return;
    setApplying(true);
    let ok = 0;
    for (const r of toUpdate) {
      try {
        const res = await fetch(`/api/pms-income/reservations/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commission: r.estimated }),
        });
        if (res.ok) ok++;
      } catch {}
    }
    setApplying(false);
    showToast(`已套用 ${ok} 筆試算佣金`, ok > 0 ? 'success' : 'error');
    if (ok > 0) load();
  }

  // Per-source aggregations
  const bySource = {};
  for (const r of rows) {
    const src = r.sourceOverride || r.source;
    const cfg = cfgForSource(configs, src);
    const estimated = estimateCommission(r, cfg);
    if (!bySource[src]) bySource[src] = { count: 0, totalRevenue: 0, totalCommission: 0, totalEstimated: 0 };
    bySource[src].count++;
    bySource[src].totalRevenue += r.totalRevenue || 0;
    bySource[src].totalCommission += r.commission || 0;
    bySource[src].totalEstimated += estimated || r.commission || 0;
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission || 0), 0);
  const totalEstimated = withEstimate.reduce((s, r) => s + (r.estimated ?? r.commission ?? 0), 0);
  const avgRate = totalRevenue > 0 ? totalCommission / totalRevenue : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">來源</label>
          <select className="border rounded px-2 py-1 text-sm" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {['全部', ...OTA_SOURCES].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">搜尋（住客 / 公司 / BJ號）</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="BJ88201280 / 姓名..."
            className="border rounded px-2 py-1 text-sm w-44"
          />
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
        <button onClick={() => setShowEstimate(v => !v)}
          className={`px-3 py-1 text-sm rounded border transition-colors ${showEstimate ? 'bg-amber-600 text-white border-amber-600' : 'border-amber-400 text-amber-700 hover:bg-amber-50'}`}
          title="從日報表的 NET 收款反推 OTA 佣金（wireTransfer），或用設定費率試算">
          {showEstimate ? '隱藏試算' : '試算佣金'}
        </button>
        {showEstimate && (
          <button onClick={applyEstimates} disabled={applying}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {applying ? '套用中…' : '套用試算 → 存入佣金'}
          </button>
        )}
        <button
          onClick={() => setShowBookingImport(v => !v)}
          className={`px-3 py-1 text-sm rounded border transition-colors ${showBookingImport ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-400 text-blue-700 hover:bg-blue-50'}`}
        >
          {showBookingImport ? '隱藏帳單比對' : 'Booking 帳單比對'}
        </button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'OTA/代訂 訂單數', value: `${rows.length} 筆`, color: '' },
          { label: '總住宿收入', value: totalRevenue.toLocaleString('zh-TW'), color: '' },
          { label: '已記錄佣金', value: totalCommission.toLocaleString('zh-TW'), color: 'text-red-600' },
          showEstimate
            ? { label: '試算佣金合計', value: totalEstimated.toLocaleString('zh-TW'), color: 'text-amber-600' }
            : { label: '平均佣金率', value: (avgRate * 100).toFixed(2) + '%', color: '' },
        ].map(k => (
          <div key={k.label} className="bg-white border rounded-lg p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-lg font-semibold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Per-source breakdown */}
      {Object.keys(bySource).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(bySource).map(([src, s]) => {
            const cfg = cfgForSource(configs, src);
            const actualRate = s.totalRevenue > 0 ? s.totalCommission / s.totalRevenue * 100 : null;
            const configRate = cfg ? Number(cfg.commissionPercentage) : null;
            const rateDiff = actualRate !== null && configRate !== null ? Math.abs(actualRate - configRate) : null;
            return (
              <div key={src} className="bg-white border rounded-lg p-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-700'}`}>{src}</span>
                <div className="text-sm font-semibold">{s.count} 筆</div>
                <div className="text-xs text-gray-500">收入：{s.totalRevenue.toLocaleString('zh-TW')}</div>
                <div className="text-xs text-red-600">佣金：{s.totalCommission.toLocaleString('zh-TW')}</div>
                {actualRate !== null && (
                  <div className="text-xs text-gray-400">實際費率：{actualRate.toFixed(2)}%</div>
                )}
                {configRate !== null && (
                  <div className={`text-xs mt-0.5 ${rateDiff !== null && rateDiff > 2 ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                    設定費率：{configRate}%{rateDiff !== null && rateDiff > 2 ? ` ⚠ 差異 ${rateDiff.toFixed(1)}%` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無 OTA / 代訂中心佣金資料。請先匯入含訂房序號的日營業報表。</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">公司 / 來源</th>
                <th className="px-3 py-2 text-center">平台</th>
                <th className="px-3 py-2 text-right">住宿金額</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">NET 收款</th>
                <th className="px-3 py-2 text-right">已記錄佣金</th>
                {showEstimate && <th className="px-3 py-2 text-right text-amber-600">試算佣金</th>}
                <th className="px-3 py-2 text-right hidden sm:table-cell">費率</th>
                <th className="px-3 py-2 text-center">PMS 發票號</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {withEstimate.map(r => {
                const src = r.sourceOverride || r.source;
                const cfg = cfgForSource(configs, src);
                const configRate = cfg ? Number(cfg.commissionPercentage) : null;
                const actualRate = r.totalRevenue > 0 && r.commission > 0
                  ? (r.commission / r.totalRevenue * 100).toFixed(1) + '%'
                  : null;
                const estimateRate = r.totalRevenue > 0 && r.estimated
                  ? (r.estimated / r.totalRevenue * 100).toFixed(1) + '%'
                  : null;
                const noCommission = !r.commission && r.estimated !== null;
                const hasInvoice = !!r.invoiceNo;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${noCommission && showEstimate ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{r.businessDate}</td>
                    <td className="px-3 py-2 max-w-[100px] truncate text-xs" title={r.guestName}>{r.guestName || '-'}</td>
                    <td className="px-3 py-2 max-w-[130px] text-xs text-gray-500 truncate hidden md:table-cell" title={r.companyName}>
                      {r.companyName || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600'}`}>{src.replace('OTA-', '')}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{fmt(r.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400 hidden sm:table-cell">{fmt(r.wireTransfer)}</td>
                    <td className="px-3 py-2 text-right text-xs text-red-600 font-medium">{fmt(r.commission)}</td>
                    {showEstimate && (
                      <td className="px-3 py-2 text-right text-xs">
                        {r.estimated !== null
                          ? <span className={`font-medium ${noCommission ? 'text-amber-600' : 'text-gray-400'}`}>{r.estimated.toLocaleString('zh-TW')}</span>
                          : <span className="text-gray-300">無法試算</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-xs text-gray-400 hidden sm:table-cell">
                      {actualRate || (showEstimate && estimateRate ? <span className="text-amber-500">{estimateRate}</span> : null) || (configRate ? configRate + '%' : '—')}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasInvoice
                        ? <span className="font-mono text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded" title={r.invoiceNo}>{r.invoiceNo}</span>
                        : <span className="text-xs text-amber-500">未開</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-gray-600">合計（{withEstimate.length} 筆）</td>
                <td className="px-3 py-2 text-right">{withEstimate.reduce((s, r) => s + (r.totalRevenue || 0), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-gray-400 hidden sm:table-cell">{withEstimate.reduce((s, r) => s + (r.wireTransfer || 0), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-red-600">{withEstimate.reduce((s, r) => s + (r.commission || 0), 0).toLocaleString('zh-TW')}</td>
                {showEstimate && <td className="px-3 py-2 text-right text-amber-600">{withEstimate.reduce((s, r) => s + (r.estimated || 0), 0).toLocaleString('zh-TW')}</td>}
                <td className="hidden sm:table-cell" />
                <td className="px-3 py-2 text-center text-gray-400">
                  {withEstimate.filter(r => r.invoiceNo).length} / {withEstimate.length} 已開
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Booking.com 帳單比對 ── */}
      {showBookingImport && (
        <BookingStatementPanel
          bookingRows={rows.filter(r => (r.sourceOverride || r.source) === 'OTA-Booking')}
        />
      )}
    </div>
  );
}
