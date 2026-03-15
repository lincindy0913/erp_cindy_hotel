'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';

const TABS = [
  { key: 'parse', label: '電費單解析' },
  { key: 'water', label: '水費單解析' },
  { key: 'list', label: '各館別月份一覽' },
];

const WAREHOUSE_OPTIONS = [
  { value: '', label: '請選擇館別' },
  { value: '麗格', label: '麗格' },
  { value: '麗軒', label: '麗軒' },
  { value: '民宿', label: '民宿' },
  { value: '國股段', label: '國股段' },
];
// 檔名或地址關鍵字 → 館別（用於自動判讀）
const WAREHOUSE_KEYWORDS = [
  { keyword: '麗軒', warehouse: '麗軒' },
  { keyword: '麗格', warehouse: '麗格' },
  { keyword: '民宿', warehouse: '民宿' },
  { keyword: '國股段', warehouse: '國股段' },
];

export default function UtilityBillsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('parse');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [pdfFile, setPdfFile] = useState(null);
  const [startPage, setStartPage] = useState(1);
  const [extractedText, setExtractedText] = useState('');
  const [pageTexts, setPageTexts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ warehouse: '', year: '', month: '', billType: '電費' });
  const fileInputRef = useRef(null);
  const isWater = activeTab === 'water';
  const [records, setRecords] = useState([]);
  const [listFilter, setListFilter] = useState({ warehouse: '', year: '', month: '', billType: '' });
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editSummary, setEditSummary] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (activeTab === 'water') setStartPage(2);
    else if (activeTab === 'parse') setStartPage(1);
    if (activeTab !== 'list') {
      setSummary(null);
      setExtractedText('');
      setPageTexts([]);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'list') fetchRecords();
  }, [activeTab, listFilter.warehouse, listFilter.year, listFilter.month, listFilter.billType]);

  async function fetchRecords() {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (listFilter.warehouse) params.set('warehouse', listFilter.warehouse);
      if (listFilter.year) params.set('year', listFilter.year);
      if (listFilter.month) params.set('month', listFilter.month);
      if (listFilter.billType) params.set('billType', listFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    }
    setListLoading(false);
  }

  // 從檔名與內文自動判讀 館別、年、月
  function autoDetectMeta(fileName, text) {
    const updates = {};
    const name = (fileName || '').replace(/\.pdf$/i, '');
    const combined = `${name} ${text || ''}`;

    for (const { keyword, warehouse } of WAREHOUSE_KEYWORDS) {
      if (combined.includes(keyword)) {
        updates.warehouse = warehouse;
        break;
      }
    }
    const yearMonth = combined.match(/(\d{3})年\s*(\d{1,2})\s*月|(\d{3})\s*年\s*(\d{1,2})月份/);
    if (yearMonth) {
      updates.year = yearMonth[1] || yearMonth[3];
      updates.month = String(parseInt(yearMonth[2] || yearMonth[4], 10)).padStart(2, '0');
    }
    if (name.includes('水費') || combined.includes('用水地址')) updates.billType = '水費';
    if (name.includes('電費') || combined.includes('用電地址') || combined.includes('電號')) updates.billType = '電費';
    return updates;
  }

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  async function extractTextFromPdf(file, fromPage = 2) {
    const pdfjsLib = await import('pdfjs-dist');
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions?.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
    }
    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
    const numPages = doc.numPages;
    const texts = [];
    const from = Math.max(1, Math.min(fromPage, numPages));
    for (let i = from; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent({ includeMarkedContent: true });
      const items = content?.items || [];
      if (items.length === 0) {
        texts.push({ pageNum: i, text: '' });
        continue;
      }
      let ordered = items;
      const hasTransform = items.some(it => it.transform && it.transform.length >= 6);
      if (hasTransform) {
        ordered = [...items].sort((a, b) => {
          const y1 = a.transform?.[5] ?? 0;
          const y2 = b.transform?.[5] ?? 0;
          if (Math.abs(y1 - y2) > 3) return y2 - y1;
          return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
        });
      }
      const pageStr = ordered.map(item => (item.str != null ? String(item.str) : '')).join(' ').replace(/\s+/g, ' ').trim();
      texts.push({ pageNum: i, text: pageStr });
    }
    return { texts, numPages };
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showMessage('請選擇 PDF 檔案', 'error');
      return;
    }
    setPdfFile(file);
    setExtractedText('');
    setPageTexts([]);
    setSummary(null);
    const detected = autoDetectMeta(file.name, '');
    if (Object.keys(detected).length) setMeta(prev => ({ ...prev, ...detected }));
  };

  const handleParse = async () => {
    if (!pdfFile) {
      showMessage('請先選擇 PDF 檔案', 'error');
      return;
    }
    setLoading(true);
    setExtractedText('');
    setPageTexts([]);
    setSummary(null);
    try {
      const { texts, numPages } = await extractTextFromPdf(pdfFile, startPage);
      setPageTexts(texts);
      const fullText = texts.map(t => `--- 第 ${t.pageNum} 頁 ---\n${t.text}`).join('\n\n');
      setExtractedText(fullText);
      if (texts.length === 0) {
        showMessage('無內容或 PDF 為掃描檔（無文字層），無法擷取文字', 'error');
      } else {
        showMessage(`已讀取第 ${startPage}～${numPages} 頁，共 ${texts.length} 頁`);
        const fullText = texts.map(t => t.text).join('\n');
        const detected = autoDetectMeta(pdfFile.name, fullText);
        if (Object.keys(detected).length) setMeta(prev => ({ ...prev, ...detected }));
      }
    } catch (err) {
      console.error(err);
      showMessage('解析失敗：' + (err?.message || '請確認為可選取文字的 PDF'), 'error');
    }
    setLoading(false);
  };

  // 從電費單文字中解析：地址、電號、使用度數、電費金額、應繳稅額、應繳總金額（支援台電等常見格式）
  function parseTaipowerFields(allText) {
    const raw = allText.replace(/\s+/g, ' ').replace(/　/g, ' ');
    const t = raw;
    const out = { 地址: '', 電號: '', 使用度數: '', 電費金額: '', 應繳稅額: '', 應繳總金額: '' };

    const addrMatch = t.match(/(?:用電地址|裝設地址|繳費地點|地址)[\s：:]*([^\d]{2,100}?(?:市|縣|區|鄉|鎮|村|路|街|段|巷|弄|號|樓)[^\d]{0,50}?)(?=\s*(?:電號|用戶|計費|流動|應繳|總計|$))/);
    if (addrMatch) out.地址 = addrMatch[1].replace(/\s+/g, ' ').trim();

    const acctMatch = t.match(/(?:電號|用戶編號|用電戶號|戶號|用戶號碼)[\s：:]*([\d\-]{6,25})/);
    if (acctMatch) out.電號 = acctMatch[1].trim();

    const degreeMatch = t.match(/(?:總用電度數|用電度數|使用度數|度數|本期用電|流動電費計算度數)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*(?:度|kWh)?/);
    if (degreeMatch) out.使用度數 = degreeMatch[1].replace(/,/g, '');

    const feeMatch = t.match(/(?:流動電費|本月電費|電費金額|電費|應付電費)[\s：:]*([\d,]+(?:\.[\d]+)?)/);
    if (feeMatch) out.電費金額 = feeMatch[1].replace(/,/g, '');

    const taxMatch = t.match(/(?:應繳稅額|營業稅|稅額|代收稅額)[\s：:]*([\d,]+(?:\.[\d]+)?)/);
    if (taxMatch) out.應繳稅額 = taxMatch[1].replace(/,/g, '');

    const totalMatch = t.match(/(?:應繳總金額|總計|合計|總金額|本期應繳|應繳金額)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (totalMatch) out.應繳總金額 = totalMatch[1].replace(/,/g, '');

    const anyAmount = t.match(/([\d,]+\.?\d*)\s*元/g);
    if (anyAmount && !out.應繳總金額) {
      const nums = anyAmount.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0 && n < 10000000);
      if (nums.length) out.應繳總金額 = String(Math.max(...nums));
    }
    if (!out.應繳總金額) {
      const bigNum = t.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*元/g);
      if (bigNum) {
        const n = bigNum.map(m => parseFloat(m.replace(/[^\d.]/g, ''))).filter(x => x > 10 && x < 10000000);
        if (n.length) out.應繳總金額 = String(Math.max(...n));
      }
    }
    return out;
  }

  // 從水費單文字中解析：用水地址、水號、用水量、基本費、水費、營業稅、其他費用、總金額（支援台水等常見格式）
  function parseWaterBillFields(allText) {
    const t = allText.replace(/\s+/g, ' ').replace(/　/g, ' ');
    const out = { 用水地址: '', 水號: '', 用水量: '', 基本費: '', 水費: '', 營業稅: '', 其他費用: '', 總金額: '' };

    const addrMatch = t.match(/(?:用水地址|用水地點|裝表地址|地址)[\s：:]*([^\d]{2,100}?(?:市|縣|區|鄉|鎮|村|路|街|段|巷|弄|號|樓)[^\d]{0,50}?)(?=\s*(?:水號|用戶|計費|基本費|$))/);
    if (addrMatch) out.用水地址 = addrMatch[1].replace(/\s+/g, ' ').trim();

    const acctMatch = t.match(/(?:水號|用戶編號|用水戶號|戶號)[\s：:]*([\d\-]{6,25})/);
    if (acctMatch) out.水號 = acctMatch[1].trim();

    const volMatch = t.match(/(?:用水量|使用量|度數|本期用水|計費度數)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*(?:度|立方公尺|m³|度)?/);
    if (volMatch) out.用水量 = volMatch[1].replace(/,/g, '');

    const baseMatch = t.match(/(?:基本費|基本水費)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (baseMatch) out.基本費 = baseMatch[1].replace(/,/g, '');

    const feeMatch = t.match(/(?:水費|用水費|流動水費|用水費金額)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (feeMatch) out.水費 = feeMatch[1].replace(/,/g, '');

    const taxMatch = t.match(/(?:營業稅|稅額|應繳稅額|代收稅額)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (taxMatch) out.營業稅 = taxMatch[1].replace(/,/g, '');

    const otherMatch = t.match(/(?:其他費用|雜費|代收費用)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (otherMatch) out.其他費用 = otherMatch[1].replace(/,/g, '');

    const totalMatch = t.match(/(?:總金額|應繳總額|總計|合計|本期應繳|應繳金額)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*元?/);
    if (totalMatch) out.總金額 = totalMatch[1].replace(/,/g, '');

    const anyAmount = t.match(/([\d,]+\.?\d*)\s*元/g);
    if (anyAmount && !out.總金額) {
      const nums = anyAmount.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0 && n < 10000000);
      if (nums.length) out.總金額 = String(Math.max(...nums));
    }
    if (!out.總金額) {
      const bigNum = t.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*元/g);
      if (bigNum) {
        const n = bigNum.map(m => parseFloat(m.replace(/[^\d.]/g, ''))).filter(x => x > 10 && x < 10000000);
        if (n.length) out.總金額 = String(Math.max(...n));
      }
    }
    return out;
  }

  const formatAmount = (val) => (val && !isNaN(Number(val)) ? `NT$ ${Number(val).toLocaleString()}` : '（未辨識，請手動填入）');

  const generatePage1Summary = () => {
    if (!extractedText) {
      showMessage('請先上傳並解析 PDF', 'error');
      return;
    }
    const allText = pageTexts.map(t => t.text).join('\n');
    const year = meta.year || new Date().getFullYear();
    const month = meta.month || String(new Date().getMonth() + 1).padStart(2, '0');
    const warehouse = meta.warehouse || '麗軒';

    if (isWater) {
      const parsed = parseWaterBillFields(allText);
      const firstPageFormat = {
        館別: warehouse,
        類型: '水費',
        計費期間: `${year}年${month}月`,
        用水地址: parsed.用水地址 || '（未辨識，請手動填入）',
        水號: parsed.水號 || '（未辨識，請手動填入）',
        用水量: parsed.用水量 || '（未辨識，請手動填入）',
        基本費: formatAmount(parsed.基本費),
        水費: formatAmount(parsed.水費),
        營業稅: formatAmount(parsed.營業稅),
        其他費用: formatAmount(parsed.其他費用),
        總金額: formatAmount(parsed.總金額),
      };
      setSummary(firstPageFormat);
      showMessage('已自動產出水費第一頁格式（請核對後使用）');
    } else {
      const parsed = parseTaipowerFields(allText);
      const firstPageFormat = {
        館別: warehouse,
        類型: '電費',
        計費期間: `${year}年${month}月`,
        地址: parsed.地址 || '（未辨識，請手動填入）',
        電號: parsed.電號 || '（未辨識，請手動填入）',
        使用度數: parsed.使用度數 || '（未辨識，請手動填入）',
        電費金額: formatAmount(parsed.電費金額),
        應繳稅額: formatAmount(parsed.應繳稅額),
        應繳總金額: formatAmount(parsed.應繳總金額),
      };
      setSummary(firstPageFormat);
      showMessage('已自動產出第一頁格式（請核對後使用）');
    }
  };

  const copySummary = () => {
    if (!summary) return;
    const text = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text).then(() => showMessage('已複製到剪貼簿'));
  };

  const saveCurrentRecord = async () => {
    if (!summary || !meta.warehouse) {
      showMessage('請先選擇館別並產出第一頁格式', 'error');
      return;
    }
    const year = meta.year || new Date().getFullYear();
    const month = meta.month || String(new Date().getMonth() + 1).padStart(2, '0');
    setSaving(true);
    try {
      const res = await fetch('/api/utility-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: meta.warehouse,
          billYear: parseInt(year, 10),
          billMonth: parseInt(month, 10),
          billType: summary.類型 || (isWater ? '水費' : '電費'),
          summaryJson: summary,
          fileName: pdfFile?.name || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage(`已儲存：${meta.warehouse} ${year}年${month}月 ${data.billType}`);
        setActiveTab('list');
        fetchRecords();
      } else {
        showMessage(data.error || '儲存失敗', 'error');
      }
    } catch (e) {
      showMessage('儲存失敗', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-teal-600" />
      <NotificationBanner moduleFilter="utility" />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-teal-800 mb-6">水電費</h2>

        {message.text && (
          <div className={`mb-4 px-4 py-2 rounded ${message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === tab.key ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'parse' || activeTab === 'water') && (
          <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">
              {isWater ? '水費單解析（從第二頁讀取，自動產出第一頁）' : '電費單解析（自動產出第一頁）'}
            </h3>
            <p className="text-sm text-gray-600">
              {isWater ? (
                <>上傳水費 PDF（如台水帳單），系統會<strong>從第二頁起</strong>讀取明細並自動辨識：<strong>用水地址、水號、用水量、基本費、水費、營業稅、其他費用、總金額</strong>，產出第一頁報表。<strong>館別、計費年月</strong>可依檔名或內容自動判讀（如檔名含「國股段」「113年10月」）。若 PDF 為掃描檔（無文字層）則無法辨識。</>
              ) : (
                <>只需上傳電費 PDF（如台電帳單），系統會讀取整份帳單並自動辨識：<strong>地址、電號、使用度數、電費金額、應繳稅額、應繳總金額</strong>，產出第一頁格式。<strong>館別、計費年月</strong>可依檔名或內容自動判讀（如檔名含「麗軒」「115年02月」）。若 PDF 為掃描檔（無文字層）則無法辨識。</>
              )}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select
                  value={meta.warehouse}
                  onChange={e => setMeta(m => ({ ...m, warehouse: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {WAREHOUSE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">年度</label>
                <input
                  type="text"
                  value={meta.year}
                  onChange={e => setMeta(m => ({ ...m, year: e.target.value }))}
                  placeholder={isWater ? '113' : '115'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
                <input
                  type="text"
                  value={meta.month}
                  onChange={e => setMeta(m => ({ ...m, month: e.target.value }))}
                  placeholder="10"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">從第幾頁開始讀取</label>
                <input
                  type="number"
                  min={1}
                  value={startPage}
                  onChange={e => setStartPage(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  {isWater ? '水費建議從第 2 頁（明細）開始讀取' : '電費建議從第 1 頁（整份讀取）以自動辨識地址、電號等'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
              >
                選擇 PDF
              </button>
              {pdfFile && <span className="text-sm text-gray-600">{pdfFile.name}</span>}
              <button
                type="button"
                onClick={handleParse}
                disabled={!pdfFile || loading}
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 text-sm"
              >
                {loading ? '讀取中…' : '讀取 PDF'}
              </button>
              <button
                type="button"
                onClick={generatePage1Summary}
                disabled={!extractedText}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
              >
                產出第一頁格式
              </button>
            </div>

            {extractedText && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">擷取內容（第 {startPage} 頁起）</h4>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap">{extractedText}</pre>
              </div>
            )}

            {summary && (
              <div className="border-t pt-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">第一頁格式（可手動修改欄位後再儲存）</h4>
                <div className={isWater ? 'bg-sky-50 border border-sky-200 rounded-lg p-4' : 'bg-teal-50 border border-teal-200 rounded-lg p-4'}>
                  <div className="space-y-3 text-sm">
                    {Object.keys(summary).map(k => (
                      <div key={k} className="flex flex-wrap items-center gap-2">
                        <label className="font-medium text-gray-700 w-24 shrink-0">{k}</label>
                        <input
                          type="text"
                          value={summary[k] ?? ''}
                          onChange={e => setSummary(prev => ({ ...prev, [k]: e.target.value }))}
                          className="flex-1 min-w-[200px] border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={copySummary}
                      className={`px-3 py-1.5 rounded text-xs ${isWater ? 'bg-sky-600 hover:bg-sky-700' : 'bg-teal-600 hover:bg-teal-700'} text-white`}
                    >
                      複製摘要
                    </button>
                    <button
                      type="button"
                      onClick={saveCurrentRecord}
                      disabled={saving || !meta.warehouse}
                      className="px-3 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
                    >
                      {saving ? '儲存中…' : '儲存此筆'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'list' && (
          <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">各館別、每月水電費一覽</h3>
            <p className="text-sm text-gray-600 mb-4">
              在「電費單解析」或「水費單解析」產出第一頁後按「儲存此筆」，即會出現在此列表。可依館別、年、月、類型篩選。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <select
                value={listFilter.warehouse}
                onChange={e => setListFilter(f => ({ ...f, warehouse: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">全部館別</option>
                {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="年度"
                value={listFilter.year}
                onChange={e => setListFilter(f => ({ ...f, year: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="月份"
                min={1}
                max={12}
                value={listFilter.month}
                onChange={e => setListFilter(f => ({ ...f, month: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={listFilter.billType}
                onChange={e => setListFilter(f => ({ ...f, billType: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">全部類型</option>
                <option value="水費">水費</option>
                <option value="電費">電費</option>
              </select>
            </div>
            {listLoading ? (
              <div className="py-8 text-center text-gray-500">載入中…</div>
            ) : records.length === 0 ? (
              <div className="py-8 text-center text-gray-500">尚無儲存紀錄，請先解析並儲存水電費單</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">館別</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">年月</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">類型</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">檔名</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">儲存日</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {records.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{r.warehouse}</td>
                        <td className="px-4 py-2">{r.billYear}年{r.billMonth}月</td>
                        <td className="px-4 py-2">{r.billType}</td>
                        <td className="px-4 py-2 text-gray-600">{r.fileName || '－'}</td>
                        <td className="px-4 py-2 text-gray-500">{new Date(r.createdAt).toLocaleDateString('zh-TW')}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const sum = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : (r.summaryJson || {});
                                setEditRecord(r);
                                setEditSummary(typeof sum === 'object' && sum !== null ? { ...sum } : {});
                              } catch {
                                setEditRecord(r);
                                setEditSummary({});
                              }
                            }}
                            className="text-teal-600 hover:underline text-sm"
                          >
                            編輯
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editRecord && editSummary !== null && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditRecord(null)}>
                <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">
                    編輯 — {editRecord.warehouse} {editRecord.billYear}年{editRecord.billMonth}月 {editRecord.billType}
                  </h4>
                  <div className="space-y-3 text-sm mb-4">
                    {Object.keys(editSummary).map(k => (
                      <div key={k} className="flex flex-wrap items-center gap-2">
                        <label className="font-medium text-gray-700 w-24 shrink-0">{k}</label>
                        <input
                          type="text"
                          value={editSummary[k] ?? ''}
                          onChange={e => setEditSummary(prev => ({ ...prev, [k]: e.target.value }))}
                          className="flex-1 min-w-[200px] border border-gray-300 rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setSavingEdit(true);
                        try {
                          const res = await fetch(`/api/utility-bills/${editRecord.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ summaryJson: editSummary }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            showMessage('已更新');
                            setEditRecord(null);
                            setEditSummary(null);
                            fetchRecords();
                          } else {
                            showMessage(data.error || '更新失敗', 'error');
                          }
                        } catch {
                          showMessage('更新失敗', 'error');
                        }
                        setSavingEdit(false);
                      }}
                      disabled={savingEdit}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
                    >
                      {savingEdit ? '儲存中…' : '儲存'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditRecord(null); setEditSummary(null); }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
