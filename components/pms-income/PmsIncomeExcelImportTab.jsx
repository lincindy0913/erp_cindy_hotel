'use client';

import { useState, useCallback, useRef } from 'react';
import { formatNumber } from './pmsIncomeFormatters';
import { DEFAULT_PMS_COLUMNS } from './pmsIncomeConstants';

export default function PmsIncomeExcelImportTab({ WAREHOUSES, setActiveTab }) {
  const [isDragging,  setIsDragging]  = useState(false);
  const [parsing,     setParsing]     = useState(false);
  const [parseError,  setParseError]  = useState('');
  const [parsed,      setParsed]      = useState(null);   // raw parse result for reference totals

  // form state (populated after parse)
  const [warehouse,     setWarehouse]     = useState('');
  const [businessDate,  setBusinessDate]  = useState('');
  const [fileName,      setFileName]      = useState('');
  const [roomCount,     setRoomCount]     = useState('');
  const [occupancyRate, setOccupancyRate] = useState('');
  const [avgRoomRate,   setAvgRoomRate]   = useState('');
  const [guestCount,    setGuestCount]    = useState('');
  const [breakfastCount,setBreakfastCount]= useState('');
  const [occupiedRooms, setOccupiedRooms] = useState('');
  const [records,       setRecords]       = useState([]);

  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success,     setSuccess]     = useState('');

  const fileInputRef = useRef(null);

  const processFile = useCallback(async (f) => {
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setParseError('請上傳 Excel 檔案（.xlsx 或 .xls）'); return;
    }
    setParsing(true); setParseError(''); setParsed(null); setSuccess(''); setSubmitError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res  = await fetch('/api/pms-income/parse-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '解析失敗');

      setWarehouse(WAREHOUSES[0] || '');
      setBusinessDate(data.businessDate || new Date().toISOString().slice(0, 10));
      setFileName(data.fileName || f.name);
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
    } catch (e) {
      setParseError(e.message);
    } finally {
      setParsing(false);
    }
  }, [WAREHOUSES]);

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

  const submit = async () => {
    if (!warehouse)     { setSubmitError('請選擇館別'); return; }
    if (!businessDate)  { setSubmitError('請選擇營業日期'); return; }

    const valid = records
      .filter(r => r.amount !== '' && r.amount != null && r.amount !== '0' && parseFloat(r.amount) !== 0)
      .map(r => ({
        pmsColumnName:  r.pmsColumnName,
        entryType:      r.entryType,
        amount:         parseFloat(r.amount),
        accountingCode: r.accountingCode,
        accountingName: r.accountingName,
      }));
    if (valid.length === 0) { setSubmitError('請至少輸入一筆金額'); return; }

    const creditTotal = valid.filter(r => r.entryType === '貸方').reduce((s, r) => s + r.amount, 0);
    const debitTotal  = valid.filter(r => r.entryType === '借方').reduce((s, r) => s + r.amount, 0);

    setSubmitting(true); setSubmitError('');
    try {
      const res = await fetch('/api/pms-income/batches', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          warehouse, businessDate,
          fileName: fileName || `PMS_${warehouse}_${businessDate}.xlsx`,
          records: valid, creditTotal, debitTotal, difference: creditTotal - debitTotal,
          roomCount:      roomCount      ? parseInt(roomCount)          : null,
          occupancyRate:  occupancyRate  ? parseFloat(occupancyRate)    : null,
          avgRoomRate:    avgRoomRate    ? parseFloat(avgRoomRate)      : null,
          guestCount:     guestCount     ? parseInt(guestCount)         : null,
          breakfastCount: breakfastCount ? parseInt(breakfastCount)     : null,
          occupiedRooms:  occupiedRooms  ? parseInt(occupiedRooms)      : null,
          reservationRows: parsed?.reservationRows || [],
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error?.message || '匯入失敗');
      const resNote = result.reservationCount > 0 ? `，訂房明細 ${result.reservationCount} 筆` : '';
      setSuccess(`匯入成功！批次號：${result.batchNo}，共 ${result.recordCount} 筆${resNote}${result.isReplacement ? '（已覆蓋舊資料）' : ''}`);
      setParsed(null); setRecords([]);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setParsed(null); setRecords([]); setParseError(''); setSuccess(''); setSubmitError('');
    setFileName(''); setBusinessDate(''); setRoomCount(''); setOccupancyRate('');
    setAvgRoomRate(''); setGuestCount(''); setBreakfastCount(''); setOccupiedRooms('');
  };

  const creditRecs = records.filter(r => r.entryType === '貸方');
  const debitRecs  = records.filter(r => r.entryType === '借方');
  const creditSum  = creditRecs.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const debitSum   = debitRecs.reduce( (s, r) => s + (parseFloat(r.amount) || 0), 0);
  const balanced   = Math.abs(creditSum - debitSum) < 0.01;
  const wh         = WAREHOUSES.length ? WAREHOUSES : ['麗格', '麗軒', '民宿'];

  return (
    <div className="space-y-5">

      {/* ── 上傳區塊 ── */}
      {!parsed ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">上傳飯店 PMS 日營業報表</h3>

          {/* drag zone */}
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
                <p className="text-xs text-gray-400 mt-1">支援 .xlsx / .xls（日營業報表格式）</p>
              </>
            )}
          </div>

          {parseError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{parseError}</div>}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm space-y-2">
              <p className="font-semibold">{success}</p>
              <button onClick={() => setSuccess('')} className="text-xs text-green-700 underline">再上傳下一筆</button>
              <span className="mx-2 text-green-400">·</span>
              <button onClick={() => setActiveTab('overview')} className="text-xs text-teal-700 underline">前往每日匯入總覽</button>
            </div>
          )}

          <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-5 py-4 text-sm text-teal-900">
            <p className="font-semibold text-teal-800 mb-1">操作說明</p>
            <ol className="list-decimal list-inside space-y-1 text-teal-900/90">
              <li>於飯店 PMS 匯出<strong>日營業報表</strong>（.xls / .xlsx）。</li>
              <li>拖曳或點擊上方區域上傳，系統自動解析本日貸方 / 借方金額。</li>
              <li>確認館別、日期與金額後，按「確認匯入」存檔。</li>
            </ol>
          </div>
        </div>
      ) : (
        /* ── 解析結果表單 ── */
        <div className="space-y-4">

          {/* header bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">📊 {fileName}</span>
              <span className="text-xs text-gray-400">已解析，請核對後匯入</span>
            </div>
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
                ['房間數',    roomCount,      setRoomCount,      'number'],
                ['住房率(%)', occupancyRate,  setOccupancyRate,  'number'],
                ['平均房價',  avgRoomRate,    setAvgRoomRate,    'number'],
                ['住宿人數',  guestCount,     setGuestCount,     'number'],
                ['早餐人數',  breakfastCount, setBreakfastCount, 'number'],
                ['住宿間數',  occupiedRooms,  setOccupiedRooms,  'number'],
              ].map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type="number" className="w-full border rounded-lg px-2 py-1.5 text-sm text-right" value={val} onChange={e => setter(e.target.value)} placeholder="0" />
                </div>
              ))}
            </div>
          </div>

          {/* 訂房明細 row count notice */}
          {parsed.reservationRows?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-2 text-xs text-blue-800">
              已偵測到 <strong>{parsed.reservationRows.length}</strong> 筆個別訂房序號記錄，匯入後將自動建立訂房明細（可在「訂房明細」頁查詢）。
            </div>
          )}

          {/* Excel 原始合計 reference */}
          {parsed.excelTotals && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 text-xs text-amber-800 flex flex-wrap gap-4">
              <span className="font-semibold">Excel 原始對照：</span>
              {parsed.excelTotals.creditTotal && <span>貸方合計 <strong>{formatNumber(parsed.excelTotals.creditTotal)}</strong></span>}
              {parsed.excelTotals.debitTotal  && <span>借方合計 <strong>{formatNumber(parsed.excelTotals.debitTotal)}</strong></span>}
              {parsed.excelTotals.grossRevenue && <span>營業總額 <strong>{formatNumber(parsed.excelTotals.grossRevenue)}</strong></span>}
              {parsed.excelTotals.netRevenue  && <span>營業淨額 <strong>{formatNumber(parsed.excelTotals.netRevenue)}</strong></span>}
              {parsed.excelTotals.invoiceTax  && <span>發票稅額 <strong>{formatNumber(parsed.excelTotals.invoiceTax)}</strong></span>}
            </div>
          )}

          {/* 貸方科目 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h4 className="text-sm font-bold text-teal-700 mb-3 border-b border-teal-100 pb-1">貸方科目（收入）</h4>
            <div className="space-y-2">
              {records.map((rec, idx) => rec.entryType !== '貸方' ? null : (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                  <div className="col-span-2 text-xs text-gray-400">{rec.accountingCode}</div>
                  <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                  <div className="col-span-4">
                    <input type="number" step="1" min="0" placeholder="0"
                      value={rec.amount}
                      onChange={e => setAmount(idx, e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-400 focus:border-teal-400" />
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
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                  <div className="col-span-2 text-xs text-gray-400">{rec.accountingCode}</div>
                  <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                  <div className="col-span-4">
                    <input type="number" step="1" min="0" placeholder="0"
                      value={rec.amount}
                      onChange={e => setAmount(idx, e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-amber-400 focus:border-amber-400" />
                  </div>
                </div>
              ))}
              <div className="text-right text-sm font-bold text-amber-700 pr-1">借方合計：{formatNumber(debitSum)}</div>
            </div>
          </div>

          {/* 差額 */}
          <div className={`rounded-xl px-5 py-3 text-right text-sm font-bold ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            差額（貸－借）：{formatNumber(creditSum - debitSum)}
            {balanced ? ' ✓ 平衡' : ' ✗ 不平衡，請核對'}
          </div>

          {submitError && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">{submitError}</div>}
          {success     && <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm font-semibold">{success}</div>}

          {/* 操作按鈕 */}
          <div className="flex justify-between items-center">
            <button onClick={reset} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              ← 重新上傳
            </button>
            <button onClick={submit} disabled={submitting}
              className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
              {submitting ? '匯入中…' : '確認匯入'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
