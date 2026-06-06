'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { formatNumber } from './pmsIncomeFormatters';
import { DEFAULT_PMS_COLUMNS } from './pmsIncomeConstants';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';

function detectWarehouse(filename, warehouses) {
  const lower = filename.toLowerCase();
  for (const wh of warehouses) {
    if (lower.includes(wh.toLowerCase())) return wh;
  }
  // Common abbreviations
  if (/\blg\b|ligge|li.?ge/.test(lower)) return warehouses.find(w => /麗格/.test(w)) || '';
  if (/\blx\b|li.?xuan/.test(lower))     return warehouses.find(w => /麗軒/.test(w)) || '';
  if (/mins[hu]|minshu/.test(lower))     return warehouses.find(w => /民宿/.test(w)) || '';
  return warehouses[0] || '';
}

const SOURCE_BADGE = {
  'OTA-Agoda':   'bg-red-100 text-red-700',
  'OTA-Booking': 'bg-blue-100 text-blue-700',
  'OTA-Expedia': 'bg-yellow-100 text-yellow-800',
  'OTA-易遊網':  'bg-green-100 text-green-700',
  'OTA-MOMO':    'bg-pink-100 text-pink-700',
  'T/S':         'bg-purple-100 text-purple-700',
  '月租':        'bg-teal-100 text-teal-700',
  '現場':        'bg-gray-100 text-gray-600',
  '電話':        'bg-gray-100 text-gray-500',
};

/**
 * 科目對應預覽：在確認匯入前顯示各 PMS 欄位對應到的科目代碼與金額
 * 若有欄位未對應（accountingCode 為空）且有金額，標示警告
 */
function AccountingPreview({ records }) {
  const [expanded, setExpanded] = useState(false);

  const nonZero = records.filter(r => {
    const v = parseFloat(r.amount);
    return !isNaN(v) && v !== 0;
  });
  const unmapped = nonZero.filter(r => !r.accountingCode);

  if (nonZero.length === 0) return null;

  const preview = expanded ? nonZero : nonZero.slice(0, 6);

  return (
    <div className="border border-gray-100 rounded-xl bg-gray-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">科目對應摘要（{nonZero.length} 筆有金額）</span>
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-gray-500 hover:underline">
          {expanded ? '收合' : '顯示全部'}
        </button>
      </div>

      {unmapped.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          ⚠ 以下 {unmapped.length} 個 Excel 欄位<strong>無科目代碼對應</strong>，金額將照樣匯入但無法歸帳：
          {unmapped.map(r => (
            <span key={r.pmsColumnName} className="ml-1 font-mono bg-amber-100 px-1 rounded">{r.pmsColumnName}</span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead className="bg-gray-100/60 text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left">科別</th>
              <th className="px-2 py-1.5 text-left">PMS 欄位</th>
              <th className="px-2 py-1.5 text-left">科目代碼</th>
              <th className="px-2 py-1.5 text-right">金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {preview.map((r, i) => (
              <tr key={i} className={`${!r.accountingCode ? 'bg-amber-50' : 'bg-white'} hover:bg-gray-50/60`}>
                <td className="px-2 py-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.entryType === '貸方' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                    {r.entryType}
                  </span>
                </td>
                <td className="px-2 py-1 text-gray-700">{r.pmsColumnName}</td>
                <td className="px-2 py-1">
                  {r.accountingCode
                    ? <span className="font-mono text-gray-600">{r.accountingCode}</span>
                    : <span className="text-amber-600 font-medium">⚠ 未對應</span>}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-medium text-gray-800">
                  {Number(r.amount).toLocaleString('zh-TW')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!expanded && nonZero.length > 6 && (
        <p className="text-xs text-center text-gray-400">顯示前 6 筆，共 {nonZero.length} 筆</p>
      )}
    </div>
  );
}

/**
 * 資料異常偵測：在確認匯入前標出可疑記錄
 * - checkIn > checkOut（日期顛倒）
 * - totalRevenue = 0 但付款欄位 > 0（收款科目有填，收入欄空白）
 */
function ReservationAnomalies({ rows }) {
  if (!rows || rows.length === 0) return null;

  const inverted = rows.filter(r => r.checkIn && r.checkOut && r.checkIn > r.checkOut);
  const zeroRev  = rows.filter(r => {
    if (r.roomType === '訂金') return false; // 訂金列收入為 0 是正常
    const paid = (r.cash || 0) + (r.creditCard || 0) + (r.wireTransfer || 0);
    return (r.totalRevenue || 0) === 0 && paid > 0;
  });

  if (inverted.length === 0 && zeroRev.length === 0) return null;

  return (
    <div className="border border-red-200 rounded-xl bg-red-50/50 p-3 space-y-2">
      <span className="text-xs font-semibold text-red-800">⚠ 偵測到 {inverted.length + zeroRev.length} 筆資料異常（可繼續匯入，建議事先確認）</span>

      {inverted.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-red-700 font-medium">日期顛倒（遷入 &gt; 遷出）— {inverted.length} 筆</p>
          {inverted.slice(0, 4).map((r, i) => (
            <div key={i} className="text-xs text-red-600 bg-white rounded px-2 py-0.5">
              {r.guestName || '—'} · {r.checkIn} → {r.checkOut}
            </div>
          ))}
          {inverted.length > 4 && <p className="text-xs text-red-400">…還有 {inverted.length - 4} 筆</p>}
        </div>
      )}

      {zeroRev.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-red-700 font-medium">收入為 0 但付款有值 — {zeroRev.length} 筆</p>
          {zeroRev.slice(0, 4).map((r, i) => (
            <div key={i} className="text-xs text-red-600 bg-white rounded px-2 py-0.5">
              {r.guestName || '—'} · 現金 {r.cash || 0} 刷卡 {r.creditCard || 0} 轉帳 {r.wireTransfer || 0}
            </div>
          ))}
          {zeroRev.length > 4 && <p className="text-xs text-red-400">…還有 {zeroRev.length - 4} 筆</p>}
        </div>
      )}
    </div>
  );
}

/**
 * 訂房明細預覽：在確認匯入前顯示來源分布 + 前 8 筆預覽
 * 讓使用者確認 OTA 來源是否正確識別、有無發票號碼
 */
function ReservationPreview({ rows }) {
  const [expanded, setExpanded] = useState(false);

  // 來源分布
  const bySource = {};
  for (const r of rows) {
    const src = r.source || '電話';
    bySource[src] = (bySource[src] || 0) + 1;
  }
  const allPhone = Object.keys(bySource).every(k => k === '電話');
  const hasInvoice = rows.some(r => r.invoiceNo);
  const preview = expanded ? rows : rows.slice(0, 8);

  return (
    <div className="border border-blue-100 rounded-xl bg-blue-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-blue-800">訂房明細預覽（{rows.length} 筆）</span>
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-blue-600 hover:underline">
          {expanded ? '收合' : '顯示全部'}
        </button>
      </div>

      {/* 來源分布 */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([src, cnt]) => (
          <span key={src} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_BADGE[src] || 'bg-gray-100 text-gray-600'}`}>
            {src} <strong>{cnt}</strong>
          </span>
        ))}
      </div>

      {/* 警告：全部來源是「電話」可能代表 OTA 欄位未識別 */}
      {allPhone && rows.length > 3 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠ 所有訂房來源皆為「電話」，若應有 OTA 訂單請確認 Excel 欄位名稱是否包含「來源名稱」欄位。
        </div>
      )}

      {/* 明細表格 */}
      <div className="overflow-x-auto rounded-lg border border-blue-100">
        <table className="w-full text-xs">
          <thead className="bg-blue-100/60 text-blue-900">
            <tr>
              <th className="px-2 py-1.5 text-left">住客</th>
              <th className="px-2 py-1.5 text-center">來源</th>
              <th className="px-2 py-1.5 text-right">房費</th>
              <th className="px-2 py-1.5 text-right">刷卡</th>
              <th className="px-2 py-1.5 text-right">現金</th>
              <th className="px-2 py-1.5 text-center">發票號</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {preview.map((r, i) => (
              <tr key={i} className="bg-white hover:bg-blue-50/30">
                <td className="px-2 py-1 max-w-[100px] truncate" title={r.guestName}>{r.guestName || '—'}</td>
                <td className="px-2 py-1 text-center">
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${SOURCE_BADGE[r.source] || 'bg-gray-100 text-gray-500'}`}>
                    {(r.source || '電話').replace('OTA-', '')}
                  </span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{r.totalRevenue ? Number(r.totalRevenue).toLocaleString('zh-TW') : '—'}</td>
                <td className="px-2 py-1 text-right tabular-nums text-purple-700">{r.creditCard > 0 ? Number(r.creditCard).toLocaleString('zh-TW') : '—'}</td>
                <td className="px-2 py-1 text-right tabular-nums text-green-700">{r.cash > 0 ? Number(r.cash).toLocaleString('zh-TW') : '—'}</td>
                <td className="px-2 py-1 text-center font-mono text-[10px]">
                  {r.invoiceNo
                    ? <span className="text-indigo-600">{r.invoiceNo}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!expanded && rows.length > 8 && (
        <p className="text-xs text-center text-blue-400">顯示前 8 筆，共 {rows.length} 筆</p>
      )}
      {hasInvoice && (
        <p className="text-xs text-indigo-600">✓ 已偵測到發票號碼，匯入後可在「發票查詢」分頁核對</p>
      )}
    </div>
  );
}

function MonthCalendar({ importedDates, month }) {
  const [year, mon] = month.split('-').map(Number);
  const today = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDow = new Date(year, mon - 1, 1).getDay();
  const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const importedCount = Object.values(importedDates).filter(Boolean).length;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">{year} 年 {mon} 月 匯入進度</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
          已匯入 {importedCount} / {daysInMonth} 天
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
        {DAY_LABELS.map(d => <div key={d} className="text-gray-400 font-medium py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-7" />;
          const d = parseInt(date.slice(8));
          const isImported = !!importedDates[date];
          const isToday = date === today;
          const isPast = date < today;
          return (
            <div key={date}
              className={`h-7 flex items-center justify-center rounded text-xs font-medium
                ${isImported
                  ? 'bg-green-500 text-white'
                  : isToday
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400'
                    : isPast
                      ? 'bg-red-50 text-red-400'
                      : 'text-gray-300'}`}
              title={isImported ? `${date} 已匯入` : isPast ? `${date} 未匯入` : date}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> 已匯入</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" /> 未匯入</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> 今天</span>
      </div>
    </div>
  );
}

export default function PmsIncomeExcelImportTab({ WAREHOUSES, setActiveTab }) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [isDragging,  setIsDragging]  = useState(false);
  const [parsing,     setParsing]     = useState(false);
  const [parseError,  setParseError]  = useState('');
  const [parsed,      setParsed]      = useState(null);
  const [mode,        setMode]        = useState('quick'); // 'quick' | 'detail'

  const [warehouse,      setWarehouse]      = useState('');
  const [businessDate,   setBusinessDate]   = useState('');
  const [fileName,       setFileName]       = useState('');
  const [roomCount,      setRoomCount]      = useState('');
  const [occupancyRate,  setOccupancyRate]  = useState('');
  const [avgRoomRate,    setAvgRoomRate]    = useState('');
  const [guestCount,     setGuestCount]     = useState('');
  const [breakfastCount, setBreakfastCount] = useState('');
  const [occupiedRooms,  setOccupiedRooms]  = useState('');
  const [records,        setRecords]        = useState([]);

  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success,     setSuccess]     = useState('');

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [importedDates, setImportedDates] = useState({});

  const fileInputRef = useRef(null);
  const wh = useMemo(() => WAREHOUSES?.length ? WAREHOUSES : ['麗格', '麗軒', '民宿'], [WAREHOUSES]);

  const [duplicateWarning, setDuplicateWarning] = useState(null); // null | date string
  const [recentBatches, setRecentBatches] = useState([]);
  const [deletingBatch, setDeletingBatch] = useState(null);

  const loadRecentBatches = useCallback(async () => {
    const [y, m] = calMonth.split('-');
    const params = new URLSearchParams({ year: y, month: parseInt(m) });
    if (warehouse) params.set('warehouse', warehouse);
    fetch(`/api/pms-income/batches?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setRecentBatches(Array.isArray(data) ? data.sort((a, b) => b.businessDate.localeCompare(a.businessDate)) : []);
        const map = {};
        for (const b of data) map[b.businessDate] = true;
        setImportedDates(map);
      })
      .catch(() => {});
  }, [calMonth, warehouse]);

  // Fetch calendar + batch list whenever warehouse or calMonth changes
  useEffect(() => {
    loadRecentBatches();
  }, [loadRecentBatches]);

  const deleteBatch = useCallback(async (batch) => {
    if (!(await confirm(`確定要整批刪除「${batch.businessDate} ${batch.batchNo}」嗎？\n共 ${batch.recordCount ?? '?'} 筆記錄，此操作無法還原。`, { title: '整批刪除', danger: true }))) return;
    setDeletingBatch(batch.id);
    try {
      const res = await fetch(`/api/pms-income/batches/${batch.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '刪除失敗');
      await loadRecentBatches();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setDeletingBatch(null);
    }
  }, [loadRecentBatches, confirm, showToast]);

  const processFile = useCallback(async (f) => {
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setParseError('請上傳 Excel 檔案（.xlsx 或 .xls）'); return;
    }
    setParsing(true); setParseError(''); setParsed(null); setSuccess(''); setSubmitError(''); setDuplicateWarning(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res  = await fetch('/api/pms-income/parse-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '解析失敗');
      // 顯示 Excel 欄位名稱，方便確認發票號碼欄位是否被正確偵測
      if (data._debug) console.log('[PMS Excel] 表頭欄位:', data._debug.masterHeaders, '發票號碼欄:', data._debug.invoiceNoColIdx);

      // Auto-detect warehouse from filename
      const detectedWh = detectWarehouse(f.name, wh);
      const detectedDate = data.businessDate || new Date().toISOString().slice(0, 10);
      setWarehouse(detectedWh || wh[0] || '');
      setBusinessDate(detectedDate);
      setFileName(data.fileName || f.name);

      // Check for duplicate import
      if (detectedWh && detectedDate) {
        fetch(`/api/pms-income/batches?startDate=${detectedDate}&endDate=${detectedDate}${detectedWh ? `&warehouse=${encodeURIComponent(detectedWh)}` : ''}`)
          .then(r => r.ok ? r.json() : [])
          .then(batches => {
            if (batches.some(b => !b.batchNo?.startsWith('MANUAL-'))) {
              setDuplicateWarning(detectedDate);
            }
          })
          .catch(() => {});
      }
      setRoomCount(data.roomCount     || '');
      setOccupancyRate(data.occupancyRate || '');
      setAvgRoomRate(data.avgRoomRate  || '');
      setGuestCount(data.guestCount   || '');
      setBreakfastCount(data.breakfastCount || '');
      setOccupiedRooms(data.occupiedRooms   || '');

      const excelRecs = (data.records || []).map(r => ({
        pmsColumnName:  r.pmsColumnName,
        entryType:      r.entryType,
        accountingCode: r.accountingCode || '',
        accountingName: r.accountingName || '',
        amount: r.amount != null ? String(r.amount) : '',
      }));
      const defaults = DEFAULT_PMS_COLUMNS
        .filter(d => !excelRecs.some(e => e.accountingCode === d.accountingCode && e.entryType === d.entryType))
        .map(d => ({ ...d, amount: '' }));
      setRecords([...excelRecs, ...defaults]);
      setParsed(data);
      setMode('quick');
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  }, [wh]);

  const onDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };
  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (f) processFile(f);
    e.target.value = '';
  };
  const setAmount = (idx, val) =>
    setRecords(r => r.map((rec, i) => i === idx ? { ...rec, amount: val } : rec));

  const setField = (idx, field, val) =>
    setRecords(r => r.map((rec, i) => i === idx ? { ...rec, [field]: val } : rec));

  const [editingIdx, setEditingIdx] = useState(null);

  const creditRecs = records.filter(r => r.entryType === '貸方');
  const debitRecs  = records.filter(r => r.entryType === '借方');
  const creditSum  = creditRecs.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const debitSum   = debitRecs.reduce( (s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff       = creditSum - debitSum;
  const balanced   = Math.abs(diff) < 0.01;

  const submit = async () => {
    if (!warehouse)    { setSubmitError('請選擇館別'); return; }
    if (!businessDate) { setSubmitError('請選擇營業日期'); return; }

    const valid = records
      .filter(r => r.amount !== '' && r.amount != null && parseFloat(r.amount) !== 0)
      .map(r => ({
        pmsColumnName:  r.pmsColumnName,
        entryType:      r.entryType,
        amount:         parseFloat(r.amount),
        accountingCode: r.accountingCode,
        accountingName: r.accountingName,
      }));
    if (valid.length === 0) { setSubmitError('請至少輸入一筆金額'); return; }

    const cTotal = valid.filter(r => r.entryType === '貸方').reduce((s, r) => s + r.amount, 0);
    const dTotal = valid.filter(r => r.entryType === '借方').reduce((s, r) => s + r.amount, 0);

    setSubmitting(true); setSubmitError('');
    try {
      const res = await fetch('/api/pms-income/batches', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          warehouse, businessDate,
          fileName: fileName || `PMS_${warehouse}_${businessDate}.xlsx`,
          records: valid, creditTotal: cTotal, debitTotal: dTotal, difference: cTotal - dTotal,
          roomCount:      roomCount      ? parseInt(roomCount)       : null,
          occupancyRate:  occupancyRate  ? parseFloat(occupancyRate) : null,
          avgRoomRate:    avgRoomRate    ? parseFloat(avgRoomRate)   : null,
          guestCount:     guestCount     ? parseInt(guestCount)      : null,
          breakfastCount: breakfastCount ? parseInt(breakfastCount)  : null,
          occupiedRooms:  occupiedRooms  ? parseInt(occupiedRooms)   : null,
          reservationRows: parsed?.reservationRows || [],
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || '匯入失敗');
      const resNote = result.reservationCount > 0 ? `，訂房明細 ${result.reservationCount} 筆` : '';
      setSuccess(`✓ 匯入成功！批次號：${result.batchNo}，共 ${result.recordCount} 筆${resNote}${result.isReplacement ? '（已覆蓋舊資料）' : ''}`);
      setParsed(null); setRecords([]);
      loadRecentBatches();
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setParsed(null); setRecords([]); setParseError(''); setSuccess(''); setSubmitError('');
    setFileName(''); setBusinessDate('');
    setRoomCount(''); setOccupancyRate(''); setAvgRoomRate('');
    setGuestCount(''); setBreakfastCount(''); setOccupiedRooms('');
  };

  // ── Not yet parsed: upload zone + calendar ──
  if (!parsed) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Upload zone */}
          <div className="md:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">上傳飯店 PMS 日營業報表</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <label>館別篩選：</label>
                <select className="border rounded px-2 py-0.5 text-xs" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                  <option value="">全部</option>
                  {wh.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <label>月份：</label>
                <input type="month" className="border rounded px-2 py-0.5 text-xs" value={calMonth} onChange={e => setCalMonth(e.target.value)} />
              </div>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                ${isDragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/40'}`}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              {parsing ? (
                <p className="text-teal-600 font-medium">解析中…</p>
              ) : (
                <>
                  <div className="text-4xl mb-2">📊</div>
                  <p className="text-gray-600 font-medium">拖曳或點擊上傳日營業報表</p>
                  <p className="text-xs text-gray-400 mt-1">支援 .xlsx / .xls — 館別從檔名自動帶入</p>
                </>
              )}
            </div>

            {parseError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{parseError}</div>}

            {success && (
              <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm space-y-2">
                <p className="font-semibold">{success}</p>
                <span className="text-xs text-green-700 underline cursor-pointer" onClick={() => setSuccess('')}>再上傳下一筆</span>
                <span className="mx-2 text-green-400">·</span>
                <span className="text-xs text-teal-700 underline cursor-pointer" onClick={() => setActiveTab('overview')}>前往每日匯入總覽</span>
              </div>
            )}

            <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-5 py-3 text-xs text-teal-900 space-y-1">
              <p className="font-semibold text-teal-800">每日操作流程</p>
              <ol className="list-decimal list-inside space-y-0.5 text-teal-900/90">
                <li>飯店 PMS 匯出當日<strong>日營業報表</strong>（.xls / .xlsx）</li>
                <li>拖曳上傳 — 館別、日期、金額<strong>自動帶入</strong></li>
                <li>確認摘要無誤後按「確認匯入」（5 秒完成）</li>
              </ol>
            </div>
          </div>

          {/* Calendar */}
          <div className="md:col-span-2">
            <MonthCalendar importedDates={importedDates} month={calMonth} />
          </div>
        </div>

        {/* Recent batch list with rollback */}
        {recentBatches.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                {calMonth} 匯入批次（{recentBatches.length} 個）
              </h3>
              <span className="text-xs text-gray-400">點擊「整批刪除」可回滾錯誤匯入</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">營業日期</th>
                    <th className="px-3 py-2 text-left">批次號</th>
                    <th className="px-3 py-2 text-center">狀態</th>
                    <th className="px-3 py-2 text-right">貸方</th>
                    <th className="px-3 py-2 text-right">借方</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentBatches.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{b.businessDate}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{b.batchNo}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          b.status === '已結算' ? 'bg-green-100 text-green-700' :
                          b.status === '已核對' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{b.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-teal-700 font-mono text-xs">
                        {Number(b.creditTotal).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-3 py-2 text-right text-amber-700 font-mono text-xs">
                        {Number(b.debitTotal).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {b.status === '已結算' ? (
                          <span className="text-xs text-gray-400">已結算（不可刪除）</span>
                        ) : (
                          <button
                            onClick={() => deleteBatch(b)}
                            disabled={deletingBatch === b.id}
                            className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-40"
                          >
                            {deletingBatch === b.id ? '刪除中…' : '整批刪除'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Quick mode: compact summary ──
  if (mode === 'quick') {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          {/* File header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-gray-800">📊 {fileName}</p>
              <p className="text-xs text-gray-400 mt-0.5">已解析，請確認後匯入</p>
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline">重新上傳</button>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">館別 *</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm font-medium" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
                {wh.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">營業日期 *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm font-medium" value={businessDate} onChange={e => setBusinessDate(e.target.value)} />
            </div>
          </div>

          {/* Summary numbers */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">貸方合計（收入）</span>
              <span className="text-base font-bold text-teal-700">{formatNumber(creditSum)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">借方合計（付款）</span>
              <span className="text-base font-bold text-amber-700">{formatNumber(debitSum)}</span>
            </div>
            <div className={`flex justify-between items-center border-t pt-3 ${balanced ? 'text-green-700' : 'text-red-600'}`}>
              <span className="text-sm font-semibold">差額</span>
              <span className="text-base font-bold">{balanced ? '✓ 0 平衡' : `✗ ${formatNumber(diff)}`}</span>
            </div>
            {parsed?.reservationRows?.length > 0 && (
              <div className="flex justify-between items-center text-blue-700 text-xs pt-1">
                <span>訂房明細</span>
                <span>{parsed.reservationRows.length} 筆（自動建立）</span>
              </div>
            )}
          </div>

          {!balanced && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              貸借不平衡，請點「展開詳細核對」確認各欄位金額。
            </div>
          )}

          {/* ── 科目對應摘要 ── */}
          {records.length > 0 && <AccountingPreview records={records} />}

          {/* ── 資料異常偵測 ── */}
          {parsed?.reservationRows?.length > 0 && (
            <ReservationAnomalies rows={parsed.reservationRows} />
          )}

          {/* ── 訂房明細預覽 ── */}
          {parsed?.reservationRows?.length > 0 && (
            <ReservationPreview rows={parsed.reservationRows} />
          )}

          {duplicateWarning && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <span><strong>{duplicateWarning}</strong> 已有匯入批次！繼續匯入將<strong>覆蓋</strong>同日資料，請確認是否重傳。</span>
            </div>
          )}

          {submitError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{submitError}</div>}

          {/* Action buttons */}
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 text-base font-bold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '匯入中…' : '確認匯入'}
          </button>

          <button
            onClick={() => setMode('detail')}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            展開詳細核對 →
          </button>
        </div>
      </div>
    );
  }

  // ── Detail mode: full form ──
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 flex flex-wrap items-center gap-4">
        <div>
          <span className="text-sm font-semibold text-gray-800">📊 {fileName}</span>
          <span className="text-xs text-gray-400 ml-2">詳細核對模式</span>
        </div>
        <button onClick={() => setMode('quick')} className="text-xs text-teal-600 underline">← 返回快速模式</button>
        <button onClick={reset} className="ml-auto text-xs text-gray-500 hover:text-gray-800 underline">重新上傳</button>
      </div>

      {/* 基本資訊 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">基本資訊</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">館別 *</label>
            <select className="w-full border rounded-lg px-3 py-1.5 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
              {wh.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">營業日期 *</label>
            <input type="date" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={businessDate} onChange={e => setBusinessDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">檔案名稱</label>
            <input type="text" className="w-full border rounded-lg px-3 py-1.5 text-sm" value={fileName} onChange={e => setFileName(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 住宿統計 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">住宿統計</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {[
            ['房間數',    roomCount,      setRoomCount],
            ['住房率(%)', occupancyRate,  setOccupancyRate],
            ['平均房價',  avgRoomRate,    setAvgRoomRate],
            ['住宿人數',  guestCount,     setGuestCount],
            ['早餐人數',  breakfastCount, setBreakfastCount],
            ['住宿間數',  occupiedRooms,  setOccupiedRooms],
          ].map(([label, val, setter]) => (
            <div key={label}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm text-right" value={val} onChange={e => setter(e.target.value)} placeholder="0" />
            </div>
          ))}
        </div>
      </div>

      {parsed?.reservationRows?.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-2 text-xs text-blue-800">
          已偵測到 <strong>{parsed.reservationRows.length}</strong> 筆訂房序號記錄，匯入後將自動建立訂房明細。
        </div>
      )}

      {parsed?.excelTotals && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 text-xs text-amber-800 flex flex-wrap gap-4">
          <span className="font-semibold">Excel 原始對照：</span>
          {parsed.excelTotals.creditTotal  && <span>貸方合計 <strong>{formatNumber(parsed.excelTotals.creditTotal)}</strong></span>}
          {parsed.excelTotals.debitTotal   && <span>借方合計 <strong>{formatNumber(parsed.excelTotals.debitTotal)}</strong></span>}
          {parsed.excelTotals.grossRevenue && <span>營業總額 <strong>{formatNumber(parsed.excelTotals.grossRevenue)}</strong></span>}
          {parsed.excelTotals.netRevenue   && <span>營業淨額 <strong>{formatNumber(parsed.excelTotals.netRevenue)}</strong></span>}
        </div>
      )}

      {/* 貸方科目 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-bold text-teal-700 mb-3 border-b border-teal-100 pb-1">貸方科目（收入）</h4>
        <div className="space-y-2">
          {records.map((rec, idx) => rec.entryType !== '貸方' ? null : (
            <div key={idx} className={`grid grid-cols-12 gap-2 items-center ${editingIdx === idx ? 'bg-teal-50 -mx-2 px-2 py-1 rounded' : ''}`}>
              {editingIdx === idx ? (
                <>
                  <input type="text" value={rec.pmsColumnName || ''} onChange={e => setField(idx, 'pmsColumnName', e.target.value)}
                    placeholder="PMS 欄位名"
                    className="col-span-3 border border-teal-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-teal-400" />
                  <input type="text" value={rec.accountingCode || ''} onChange={e => setField(idx, 'accountingCode', e.target.value)}
                    placeholder="科目代碼"
                    className="col-span-2 border border-teal-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-teal-400" />
                  <input type="text" value={rec.accountingName || ''} onChange={e => setField(idx, 'accountingName', e.target.value)}
                    placeholder="科目名稱"
                    className="col-span-3 border border-teal-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-teal-400" />
                </>
              ) : (
                <>
                  <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                  <div className="col-span-2 text-xs text-gray-400">{rec.accountingCode || <span className="text-amber-500 italic">未對應</span>}</div>
                  <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                </>
              )}
              <div className="col-span-3">
                <input type="number" step="1" min="0" placeholder="0"
                  value={rec.amount} onChange={e => setAmount(idx, e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-400" />
              </div>
              <div className="col-span-1 text-right">
                {editingIdx === idx ? (
                  <button onClick={() => setEditingIdx(null)} title="儲存"
                    className="px-2 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700">✓ 存</button>
                ) : (
                  <button onClick={() => setEditingIdx(idx)} title="編輯欄位"
                    className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">✎ 編</button>
                )}
              </div>
            </div>
          ))}
          <div className="text-right text-sm font-bold text-teal-700 pr-1">貸方合計：{formatNumber(creditSum)}</div>
        </div>
      </div>

      {/* 借方科目 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h4 className="text-sm font-bold text-amber-700 mb-3 border-b border-amber-100 pb-1">借方科目（資產／支出）</h4>
        <div className="space-y-2">
          {records.map((rec, idx) => rec.entryType !== '借方' ? null : (
            <div key={idx} className={`grid grid-cols-12 gap-2 items-center ${editingIdx === idx ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''}`}>
              {editingIdx === idx ? (
                <>
                  <input type="text" value={rec.pmsColumnName || ''} onChange={e => setField(idx, 'pmsColumnName', e.target.value)}
                    placeholder="PMS 欄位名"
                    className="col-span-3 border border-amber-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-amber-400" />
                  <input type="text" value={rec.accountingCode || ''} onChange={e => setField(idx, 'accountingCode', e.target.value)}
                    placeholder="科目代碼"
                    className="col-span-2 border border-amber-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-400" />
                  <input type="text" value={rec.accountingName || ''} onChange={e => setField(idx, 'accountingName', e.target.value)}
                    placeholder="科目名稱"
                    className="col-span-3 border border-amber-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-amber-400" />
                </>
              ) : (
                <>
                  <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                  <div className="col-span-2 text-xs text-gray-400">{rec.accountingCode || <span className="text-amber-500 italic">未對應</span>}</div>
                  <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                </>
              )}
              <div className="col-span-3">
                <input type="number" step="1" min="0" placeholder="0"
                  value={rec.amount} onChange={e => setAmount(idx, e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-amber-400" />
              </div>
              <div className="col-span-1 text-right">
                {editingIdx === idx ? (
                  <button onClick={() => setEditingIdx(null)} title="儲存"
                    className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700">✓ 存</button>
                ) : (
                  <button onClick={() => setEditingIdx(idx)} title="編輯欄位"
                    className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">✎ 編</button>
                )}
              </div>
            </div>
          ))}
          <div className="text-right text-sm font-bold text-amber-700 pr-1">借方合計：{formatNumber(debitSum)}</div>
        </div>
      </div>

      <div className={`rounded-xl px-5 py-3 text-right text-sm font-bold ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        差額（貸－借）：{formatNumber(diff)}{balanced ? ' ✓ 平衡' : ' ✗ 不平衡，請核對'}
      </div>

      {submitError && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">{submitError}</div>}
      {success     && <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm font-semibold">{success}</div>}

      <div className="flex justify-between items-center">
        <button onClick={() => setMode('quick')} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">← 返回快速模式</button>
        <button onClick={submit} disabled={submitting}
          className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
          {submitting ? '匯入中…' : '確認匯入'}
        </button>
      </div>
    </div>
  );
}
