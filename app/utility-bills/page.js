'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';

const TABS_ADMIN = [
  { key: 'parse',    label: '電費單解析',   icon: '⚡', desc: 'OCR 辨識台電帳單' },
  { key: 'water',    label: '水費單解析',   icon: '💧', desc: 'OCR 辨識台水帳單' },
  { key: 'list',     label: '帳單記錄總覽', icon: '📋', desc: '各館別月份查詢' },
  { key: 'payment',  label: '付款進度',     icon: '💳', desc: '水電費付款單追蹤' },
  { key: 'analysis', label: '年度分析',     icon: '📊', desc: '使用度數與繳費金額樞紐表' },
  { key: 'detail',   label: '帳單明細管理', icon: '🗂',  desc: '逐筆編輯與刪除' },
];
const TABS_VIEWER = [
  { key: 'list',     label: '帳單記錄總覽', icon: '📋', desc: '各館別月份查詢' },
  { key: 'payment',  label: '付款進度',     icon: '💳', desc: '水電費付款單追蹤' },
  { key: 'analysis', label: '年度分析',     icon: '📊', desc: '使用度數與繳費金額樞紐表' },
  { key: 'detail',   label: '帳單明細管理', icon: '🗂️', desc: '逐筆查詢' },
];

// Fallback — will be replaced by API data on mount
const WAREHOUSE_OPTIONS_FALLBACK = [
  { value: '', label: '請選擇館別' },
  { value: '麗格', label: '麗格' },
  { value: '麗軒', label: '麗軒' },
  { value: '民宿', label: '民宿' },
  { value: '國股段', label: '國股段' },
];

export default function UtilityBillsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const TABS = isAdmin ? TABS_ADMIN : TABS_VIEWER;

  const [WAREHOUSE_OPTIONS, setWarehouseOptions] = useState(WAREHOUSE_OPTIONS_FALLBACK);
  const [activeTab, setActiveTab] = useState(() => isAdmin ? 'parse' : 'list');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [pdfFile, setPdfFile] = useState(null);
  const [startPage, setStartPage] = useState(1);
  const [extractedText, setExtractedText] = useState('');
  const [pageTexts, setPageTexts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [formRecords, setFormRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState({ warehouse: '', year: '', month: '', billType: '電費' });
  const fileInputRef = useRef(null);
  const isWater = activeTab === 'water';
  const [ocrRecords, setOcrRecords] = useState([]);
  const [ocrValidation, setOcrValidation] = useState(null);
  const [records, setRecords] = useState([]);
  const [listFilter, setListFilter] = useState({ warehouse: '', year: '', month: '', billType: '' });
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editSummary, setEditSummary] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Detail tab state
  const [detailRecords, setDetailRecords] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFilter, setDetailFilter] = useState({ warehouse: '', year: '', billType: '' });
  const [detailDeleting, setDetailDeleting] = useState(null); // id being deleted
  const [confirmDelete, setConfirmDelete] = useState(null); // record to confirm delete

  // 付款進度 tab state
  const [paymentRecords, setPaymentRecords]   = useState([]);
  const [paymentLoading, setPaymentLoading]   = useState(false);
  const [paymentFilter, setPaymentFilter]     = useState({ warehouse: '', year: '', billType: '', status: '' });

  // 年度分析 tab state
  const todayRoc = String(new Date().getFullYear() - 1911);
  const [analysisFilter, setAnalysisFilter] = useState({ warehouse: '', year: todayRoc, billType: '電費' });
  const [analysisRecords, setAnalysisRecords] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('usage'); // 'usage' | 'amount'

  // 載入主檔館別，並自動帶入分析篩選的預設館別
  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data?.list) ? data.list : [];
        const all = list.filter(w => w.type === 'building' || w.type === 'warehouse').map(w => w.name);
        if (all.length > 0) {
          setWarehouseOptions([{ value: '', label: '請選擇館別' }, ...all.map(n => ({ value: n, label: n }))]);
          // 若分析篩選尚未選館別，自動帶入第一個
          setAnalysisFilter(f => f.warehouse ? f : { ...f, warehouse: all[0] });
        }
      })
      .catch(() => {});
  }, []);

  // If session loads and user is not admin, and they are on an admin-only tab, redirect to list
  const ADMIN_ONLY_TABS = new Set(['parse', 'water']);
  useEffect(() => {
    if (session && !isAdmin && ADMIN_ONLY_TABS.has(activeTab)) setActiveTab('list');
  }, [session, isAdmin]);

  // 檔名或地址關鍵字 → 館別（用於自動判讀）
  const WAREHOUSE_KEYWORDS = WAREHOUSE_OPTIONS.filter(o => o.value).map(o => ({ keyword: o.value, warehouse: o.value }));

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

  useEffect(() => {
    if (activeTab === 'detail') fetchDetailRecords();
  }, [activeTab, detailFilter.warehouse, detailFilter.year, detailFilter.billType]);

  useEffect(() => {
    if (activeTab === 'analysis' && analysisFilter.warehouse && analysisFilter.year) fetchAnalysisRecords();
  }, [activeTab, analysisFilter.warehouse, analysisFilter.year, analysisFilter.billType]);

  useEffect(() => {
    if (activeTab === 'payment') fetchPaymentRecords();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'payment') fetchPaymentRecords();
  }, [paymentFilter.warehouse, paymentFilter.year, paymentFilter.billType, paymentFilter.status]);

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

  async function fetchDetailRecords() {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      if (detailFilter.warehouse) params.set('warehouse', detailFilter.warehouse);
      if (detailFilter.year) params.set('year', detailFilter.year);
      if (detailFilter.billType) params.set('billType', detailFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      setDetailRecords(Array.isArray(data) ? data : []);
    } catch {
      setDetailRecords([]);
    }
    setDetailLoading(false);
  }

  async function deleteRecord(id) {
    setDetailDeleting(id);
    try {
      const res = await fetch(`/api/utility-bills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMessage('已刪除');
        setConfirmDelete(null);
        fetchDetailRecords();
        fetchRecords();
      } else {
        const d = await res.json();
        showMessage(d.error || '刪除失敗', 'error');
      }
    } catch {
      showMessage('刪除失敗', 'error');
    }
    setDetailDeleting(null);
  }

  async function fetchPaymentRecords() {
    setPaymentLoading(true);
    try {
      const params = new URLSearchParams({ withPayment: 'true' });
      if (paymentFilter.warehouse) params.set('warehouse', paymentFilter.warehouse);
      if (paymentFilter.year)      params.set('year',      paymentFilter.year);
      if (paymentFilter.billType)  params.set('billType',  paymentFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      let rows = Array.isArray(data) ? data : [];
      // 前端篩選付款狀態
      if (paymentFilter.status === 'noPO') {
        rows = rows.filter(r => !r.paymentOrderId);
      } else if (paymentFilter.status) {
        rows = rows.filter(r => r.paymentOrder?.status === paymentFilter.status);
      }
      setPaymentRecords(rows);
    } catch {
      setPaymentRecords([]);
    }
    setPaymentLoading(false);
  }

  async function fetchAnalysisRecords() {
    if (!analysisFilter.warehouse || !analysisFilter.year) return;
    setAnalysisLoading(true);
    try {
      const params = new URLSearchParams({
        warehouse: analysisFilter.warehouse,
        year: analysisFilter.year,
        billType: analysisFilter.billType,
      });
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      setAnalysisRecords(Array.isArray(data) ? data : []);
    } catch {
      setAnalysisRecords([]);
    }
    setAnalysisLoading(false);
  }

  // pivot table 計算：列 = 地址，欄 = 月份 1-12
  function buildPivot(records, billType, mode) {
    const labelMap = new Map(); // label → { month: value }
    for (const r of records) {
      const month = r.billMonth;
      let items;
      try {
        items = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : r.summaryJson;
      } catch { items = []; }
      if (!Array.isArray(items)) items = [items].filter(Boolean);

      for (const item of items) {
        const label = billType === '電費'
          ? (item.地址 || item.電號 || '未知')
          : (item.用水地址 || '未知');

        const rawValue = mode === 'usage'
          ? (billType === '電費' ? (item.使用度數 || '0') : (item.本期實用度數 || item.用水度數 || '0'))
          : (billType === '電費' ? (item.應繳總金額 || item.電費金額 || '0') : (item.總金額 || '0'));

        const value = parseInt(String(rawValue).replace(/,/g, '')) || 0;
        if (!labelMap.has(label)) labelMap.set(label, {});
        const row = labelMap.get(label);
        row[month] = (row[month] || 0) + value;
      }
    }
    return labelMap;
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
    const safe = typeof text === 'string' ? text : (text?.message || JSON.stringify(text) || '發生錯誤');
    setMessage({ text: safe, type });
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

  const handleOcrScan = async () => {
    if (!pdfFile) {
      showMessage('請先選擇 PDF 檔案', 'error');
      return;
    }
    setLoading(true);
    setExtractedText('');
    setPageTexts([]);
    setSummary(null);
    setFormRecords([]);
    setOcrRecords([]);
    setOcrValidation(null);
    try {
      const form = new FormData();
      form.append('file', pdfFile);
      form.append('bill_type', isWater ? '水費' : '電費');
      form.append('page', '0');
      const res = await fetch('/api/utility-bills/ocr', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'OCR 失敗', 'error');
        setLoading(false);
        return;
      }

      // Multi-record response
      const allRecords = Array.isArray(data.records) && data.records.length > 0 ? data.records : [];
      setOcrRecords(allRecords);
      if (data.validation) setOcrValidation(data.validation);

      // Auto-detect meta from filename
      const detected = autoDetectMeta(pdfFile.name, '');
      const updatedMeta = { ...meta, ...detected };
      if (Object.keys(detected).length) setMeta(updatedMeta);

      const fmt = (v) => (v && !isNaN(Number(v)) ? `NT$ ${Number(v).toLocaleString()}` : (v || '（未辨識，請手動填入）'));

      if (allRecords.length > 0) {
        const p = allRecords[0];
        const year = updatedMeta.year || meta.year || String(new Date().getFullYear() - 1911);
        const month = updatedMeta.month || meta.month || String(new Date().getMonth() + 1).padStart(2, '0');
        const warehouse = p.館別 || updatedMeta.warehouse || meta.warehouse || '麗軒';
        if (isWater) {
          // Build one editable form per page (like electric bill)
          const waterForms = allRecords.map(r => {
            const waterFeeSubtotal = parseInt(r.水費項目小計) || 0;
            const agencyFee = parseInt(r.代徵費用小計) || 0;
            return {
              類型: '水費',
              水號: r.水號 || '（未辨識，請手動填入）',
              用水地址: r.用水地址 || '（未辨識，請手動填入）',
              繳費年月: r.繳費年月 || '未辨識',
              用水度數: r.用水度數 || '0',
              本期實用度數: r.本期實用度數 || '0',
              基本費: r.基本費 || '0',
              用水費: r.用水費 || '0',
              水費項目小計: r.水費項目小計 || String(waterFeeSubtotal),
              營業稅: r.營業稅 || '0',
              代徵費用小計: r.代徵費用小計 || '0',
              水源保育與回饋費: r.水源保育與回饋費 || '0',
              總金額: r.總金額 || String(waterFeeSubtotal + agencyFee),
            };
          });
          setFormRecords(waterForms);
        } else {
          // Build one editable form per page (館別 comes from user selection, not OCR)
          const forms = allRecords.map(r => {
            const fee = parseInt(r.電費金額) || 0;
            const tax = parseInt(r.應繳稅額) || 0;
            return {
              類型: '電費',
              繳費期限: r.繳費期限 || '未辨識',
              地址: r.地址 || '（未辨識，請手動填入）',
              電號: r.電號 || '（未辨識，請手動填入）',
              尖峰度數: r.尖峰度數 || '0',
              半尖峰度數: r.半尖峰度數 || '0',
              離峰度數: r.離峰度數 || '0',
              使用度數: r.使用度數 || '0',
              電費金額: r.電費金額 || '0',
              應繳稅額: r.應繳稅額 || '0',
              應繳總金額: String(fee + tax),
            };
          });
          setFormRecords(forms);
        }
      }

      const billLabel = isWater ? '水費單' : '電費單';
      const msg = allRecords.length > 1
        ? `辨識完成，共 ${allRecords.length} 筆${billLabel}，請核對欄位內容`
        : 'OCR 辨識完成，請核對欄位內容';
      showMessage(msg);
    } catch (err) {
      showMessage('OCR 服務無法連線：' + (err?.message || ''), 'error');
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

    const acctMatch = t.match(/(?:電號|電費戶號|用戶編號|用電戶號|戶號|用戶號碼)[\s：:]*[\s\S]{0,50}?([\d\-]{6,25})/);
    if (acctMatch) out.電號 = acctMatch[1].trim();

    const degreeMatch = t.match(/(?:總用電度數|用電度數|使用度數|度數|本期用電|流動電費計算度數)[\s：:]*([\d,]+(?:\.[\d]+)?)\s*(?:度|kWh)?/);
    if (degreeMatch) out.使用度數 = degreeMatch[1].replace(/,/g, '');

    const feeMatch = t.match(/(?:流動電費|本月電費|本期電費|電費金額|電費|應付電費)[\s：:]*([\d,]+(?:\.[\d]+)?)/);
    if (feeMatch) out.電費金額 = feeMatch[1].replace(/,/g, '');

    const taxMatch = t.match(/(?:應繳稅額|營業稅|稅額|代收稅額)[\s：:]*([\d,]+(?:\.[\d]+)?)/);
    if (taxMatch) out.應繳稅額 = taxMatch[1].replace(/,/g, '');

    const totalMatch = t.match(/(?:本期應繳金額|應繳電費|應繳總金額|總計|合計|總金額|本期應繳|應繳金額)[\s：:]*[\s\S]{0,100}?([\d,]{3,}(?:\.[\d]+)?)\s*元?/);
    if (totalMatch) out.應繳總金額 = totalMatch[1].replace(/,/g, '');

    const anyAmount = t.match(/([\d,]+\.?\d*)\s*元/g);
    if (anyAmount && !out.應繳總金額) {
      const nums = anyAmount.map(m => parseFloat(m.replace(/[^\d.,]/g, ''))).filter(n => n > 0 && n < 10000000);
      if (nums.length) out.應繳總金額 = String(Math.max(...nums));
    }
    if (!out.應繳總金額) {
      const bigNum = t.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*元/g);
      if (bigNum) {
        const n = bigNum.map(m => parseFloat(m.replace(/[^\d.,]/g, ''))).filter(x => x > 10 && x < 10000000);
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
      const nums = anyAmount.map(m => parseFloat(m.replace(/[^\d.,]/g, ''))).filter(n => n > 0 && n < 10000000);
      if (nums.length) out.總金額 = String(Math.max(...nums));
    }
    if (!out.總金額) {
      const bigNum = t.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*元/g);
      if (bigNum) {
        const n = bigNum.map(m => parseFloat(m.replace(/[^\d.,]/g, ''))).filter(x => x > 10 && x < 10000000);
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
    const hasRecords = formRecords.length > 0;
    if (!meta.warehouse || !hasRecords) {
      showMessage('請先選擇館別並完成 OCR 辨識', 'error');
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
          billType: isWater ? '水費' : '電費',
          summaryJson: formRecords,
          fileName: pdfFile?.name || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const poMsg = data.paymentOrderNo
          ? `　付款單：${data.paymentOrderNo}（${data.totalAmount ? `NT$${Number(data.totalAmount).toLocaleString()}` : ''}）`
          : '';
        showMessage(`已儲存：${meta.warehouse} ${year}年${month}月 ${data.billType}${poMsg}`);
        setActiveTab('payment');
        fetchPaymentRecords();
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

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-teal-800 flex items-center gap-2">
                <span className="text-2xl">🔌</span> 水電費管理
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAdmin ? 'OCR 自動辨識帳單 · 儲存記錄 · 各館別查詢' : '各館別水電費記錄查詢'}
              </p>
            </div>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-500">
                👁 檢視模式
              </span>
            )}
          </div>

          {/* Tab navbar */}
          <div className="overflow-x-auto mt-4">
            <div className="flex gap-1 min-w-max">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {message.text && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {message.text}
          </div>
        )}

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
                onClick={handleOcrScan}
                disabled={!pdfFile || loading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
                title="適用於掃描版 PDF（無文字層）"
              >
                {loading ? '掃描中…' : 'OCR 掃描'}
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

            {ocrRecords.length > 1 && !isWater && (
              <div className="border-t pt-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  OCR 辨識結果 — 共 {ocrRecords.length} 筆電費單
                </h4>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">電號</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">地址</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">計費期間</th>
                        <th className="px-3 py-2 text-center font-semibold text-teal-700 whitespace-nowrap bg-teal-100" colSpan={4}>使用度數（kWh）</th>
                        <th className="px-3 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap bg-emerald-50" colSpan={3}>應繳總金額（元）</th>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <th colSpan={4} />
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">尖峰</th>
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">半尖峰</th>
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">離峰</th>
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-100 font-bold whitespace-nowrap">合計度數</th>
                        <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-50 whitespace-nowrap">電費金額</th>
                        <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-50 whitespace-nowrap">應繳稅額</th>
                        <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-100 font-bold whitespace-nowrap">應繳總金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ocrRecords.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{r.電號}</td>
                          <td className="px-3 py-1.5 max-w-[160px] truncate" title={r.地址}>{r.地址}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{r.計費期間}</td>
                          <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.尖峰度數}</td>
                          <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.半尖峰度數}</td>
                          <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.離峰度數}</td>
                          <td className="px-3 py-1.5 text-right font-semibold bg-teal-100/60">{r.使用度數}</td>
                          <td className="px-3 py-1.5 text-right bg-emerald-50/40">{r.電費金額}</td>
                          <td className="px-3 py-1.5 text-right bg-emerald-50/40">{r.應繳稅額}</td>
                          <td className="px-3 py-1.5 text-right font-medium bg-emerald-100/60">{r.應繳總金額}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-gray-700">合計</td>
                        <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.尖峰度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.半尖峰度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.離峰度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.使用度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.電費金額) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.應繳稅額) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.應繳總金額) || 0), 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {ocrValidation && (
                  <div className={`mt-3 p-3 rounded-lg text-xs border ${ocrValidation.passed ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                    <span className="font-semibold">{ocrValidation.passed ? '✓ 合計驗證通過' : '⚠ 合計驗證差異'}</span>
                    {!ocrValidation.passed && (
                      <span className="ml-2">
                        度數: {ocrValidation.computed.使用度數} (應為 {ocrValidation.expected.使用度數}) ／
                        電費: {ocrValidation.computed.電費金額} ／
                        稅額: {ocrValidation.computed.應繳稅額} ／
                        總計: {ocrValidation.computed.應繳總金額}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Water bill OCR summary table */}
            {ocrRecords.length > 1 && isWater && (
              <div className="border-t pt-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  OCR 辨識結果 — 共 {ocrRecords.length} 筆水費單
                </h4>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-sky-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">水號</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">用水地址</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">繳費年月</th>
                        <th className="px-3 py-2 text-center font-semibold text-teal-700 whitespace-nowrap bg-teal-100" colSpan={2}>度數</th>
                        <th className="px-3 py-2 text-center font-semibold text-rose-700 whitespace-nowrap bg-rose-50" colSpan={3}>水費項目（元）</th>
                        <th className="px-3 py-2 text-center font-semibold text-amber-700 whitespace-nowrap bg-amber-50" colSpan={2}>稅/代徵（元）</th>
                        <th className="px-3 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap bg-emerald-100">總金額</th>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <th colSpan={4} />
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">用水度數</th>
                        <th className="px-3 py-1 text-right text-teal-700 bg-teal-50 whitespace-nowrap">實用度數</th>
                        <th className="px-3 py-1 text-right text-rose-700 bg-rose-50/60 whitespace-nowrap">基本費</th>
                        <th className="px-3 py-1 text-right text-rose-700 bg-rose-50/60 whitespace-nowrap">用水費</th>
                        <th className="px-3 py-1 text-right text-rose-700 bg-rose-100 font-bold whitespace-nowrap">小計</th>
                        <th className="px-3 py-1 text-right text-amber-700 bg-amber-50 whitespace-nowrap">營業稅</th>
                        <th className="px-3 py-1 text-right text-amber-700 bg-amber-50 whitespace-nowrap">代徵</th>
                        <th className="px-3 py-1 text-right text-emerald-700 bg-emerald-100 font-bold whitespace-nowrap">代繳總金額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ocrRecords.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-xs">{r.水號}</td>
                          <td className="px-3 py-1.5 max-w-[140px] truncate" title={r.用水地址}>{r.用水地址}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{r.繳費年月}</td>
                          <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.用水度數}</td>
                          <td className="px-3 py-1.5 text-right bg-teal-50/40">{r.本期實用度數}</td>
                          <td className="px-3 py-1.5 text-right bg-rose-50/40">{r.基本費}</td>
                          <td className="px-3 py-1.5 text-right bg-rose-50/40">{r.用水費}</td>
                          <td className="px-3 py-1.5 text-right font-semibold bg-rose-100/60">{r.水費項目小計}</td>
                          <td className="px-3 py-1.5 text-right bg-amber-50/40">{r.營業稅}</td>
                          <td className="px-3 py-1.5 text-right bg-amber-50/40">{r.代徵費用小計}</td>
                          <td className="px-3 py-1.5 text-right font-medium bg-emerald-100/60">{r.總金額}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-gray-700">合計</td>
                        <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.用水度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.本期實用度數) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-rose-700">{ocrRecords.reduce((s, r) => s + (parseFloat(r.基本費) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-rose-700">{ocrRecords.reduce((s, r) => s + (parseFloat(r.用水費) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-rose-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.水費項目小計) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.營業稅) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{ocrRecords.reduce((s, r) => s + (parseInt(r.代徵費用小計) || 0), 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-800">{ocrRecords.reduce((s, r) => s + (parseInt(r.總金額) || 0), 0).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Water bill: single summary form */}
            {/* Water bill: one form per page */}
            {formRecords.length > 0 && isWater && (
              <div className="border-t pt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-semibold text-gray-700">水費單明細 — 共 {formRecords.length} 筆（每筆可手動修改）</h4>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-100 border border-sky-300 text-sky-800 text-xs font-semibold">
                      館別：{meta.warehouse || '（請先選擇館別）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setFormRecords([]); setOcrRecords([]); setPdfFile(null); setSummary(null); }}
                      disabled={saving}
                      className="px-4 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium"
                    >
                      取消帳單
                    </button>
                    <button
                      type="button"
                      onClick={saveCurrentRecord}
                      disabled={saving || !meta.warehouse}
                      className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium"
                    >
                      {saving ? '儲存中…' : `儲存全部 ${formRecords.length} 筆`}
                    </button>
                  </div>
                </div>
                {formRecords.map((rec, idx) => {
                  const basicFields = ['類型', '繳費年月', '水號', '用水地址'];
                  const usageFields = ['用水度數', '本期實用度數'];
                  const feeFields = ['基本費', '用水費', '水費項目小計'];
                  const taxFields = ['營業稅', '代徵費用小計', '水源保育與回饋費'];
                  const totalFields = ['總金額'];
                  const readOnlyFields = ['水費項目小計', '總金額'];

                  const renderWaterField = (k) => (
                    <div key={k} className="flex items-center gap-2">
                      <label className="font-medium text-gray-600 shrink-0 text-xs" style={{ width: k.length > 6 ? '7rem' : '5rem' }}>{k}</label>
                      <input
                        type="text"
                        value={rec[k] ?? ''}
                        readOnly={readOnlyFields.includes(k)}
                        onChange={e => {
                          const updated = formRecords.map((r, i) => {
                            if (i !== idx) return r;
                            const next = { ...r, [k]: e.target.value };
                            // Auto-calc 水費項目小計
                            if (['基本費', '用水費'].includes(k)) {
                              const base = parseFloat(k === '基本費' ? e.target.value : r.基本費) || 0;
                              const usage = parseFloat(k === '用水費' ? e.target.value : r.用水費) || 0;
                              next.水費項目小計 = String(Math.round(base + usage));
                            }
                            // Auto-calc 總金額
                            const subtotal = parseInt(next.水費項目小計) || parseInt(rec.水費項目小計) || 0;
                            const agency = parseInt(k === '代徵費用小計' ? e.target.value : r.代徵費用小計) || 0;
                            if (['基本費', '用水費', '代徵費用小計'].includes(k)) {
                              const newSubtotal = ['基本費', '用水費'].includes(k)
                                ? Math.round((parseFloat(k === '基本費' ? e.target.value : r.基本費) || 0) + (parseFloat(k === '用水費' ? e.target.value : r.用水費) || 0))
                                : subtotal;
                              next.總金額 = String(newSubtotal + agency);
                              if (['基本費', '用水費'].includes(k)) next.水費項目小計 = String(newSubtotal);
                            }
                            return next;
                          });
                          setFormRecords(updated);
                        }}
                        className={`flex-1 border rounded px-2 py-1 text-xs ${
                          k === '總金額' ? 'bg-emerald-100 border-emerald-300 font-semibold text-emerald-800' :
                          k === '水費項目小計' ? 'bg-rose-50 border-rose-300 font-semibold text-rose-800' :
                          readOnlyFields.includes(k) ? 'bg-gray-100 border-gray-300' :
                          'border-gray-300 bg-white'
                        }`}
                      />
                    </div>
                  );

                  return (
                    <div key={idx} className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-4">
                      <h5 className="text-xs font-semibold text-sky-700">第 {idx + 1} 筆 — 水號：{rec.水號}</h5>

                      {/* Basic info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {basicFields.filter(k => k in rec).map(renderWaterField)}
                      </div>

                      {/* 使用度數 section (green) */}
                      <div className="border border-teal-300 rounded-lg overflow-hidden">
                        <div className="bg-teal-200 px-3 py-1.5">
                          <span className="text-xs font-bold text-teal-900">使用度數</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {usageFields.filter(k => k in rec).map(renderWaterField)}
                        </div>
                      </div>

                      {/* 水費項目 section (pink) */}
                      <div className="border border-rose-300 rounded-lg overflow-hidden">
                        <div className="bg-rose-100 px-3 py-1.5">
                          <span className="text-xs font-bold text-rose-900">水費項目小計（元）</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {feeFields.filter(k => k in rec).map(renderWaterField)}
                        </div>
                      </div>

                      {/* 稅額/代徵 section (amber) */}
                      <div className="border border-amber-300 rounded-lg overflow-hidden">
                        <div className="bg-amber-100 px-3 py-1.5">
                          <span className="text-xs font-bold text-amber-900">稅額 / 代徵費用（元）</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {taxFields.filter(k => k in rec).map(renderWaterField)}
                        </div>
                      </div>

                      {/* 總金額 section (green) */}
                      <div className="border border-emerald-300 rounded-lg overflow-hidden">
                        <div className="bg-emerald-100 px-3 py-1.5">
                          <span className="text-xs font-bold text-emerald-900">代繳（代收）總金額（元）</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {totalFields.filter(k => k in rec).map(renderWaterField)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Electricity bill: one form per page */}
            {formRecords.length > 0 && !isWater && (
              <div className="border-t pt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-semibold text-gray-700">電費單明細 — 共 {formRecords.length} 筆（每筆可手動修改）</h4>
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold">
                      館別：{meta.warehouse || '（請先選擇館別）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setFormRecords([]); setOcrRecords([]); setPdfFile(null); setSummary(null); }}
                      disabled={saving}
                      className="px-4 py-1.5 rounded text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium"
                    >
                      取消帳單
                    </button>
                    <button
                      type="button"
                      onClick={saveCurrentRecord}
                      disabled={saving || !meta.warehouse}
                      className="px-4 py-1.5 rounded text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium"
                    >
                      {saving ? '儲存中…' : `儲存全部 ${formRecords.length} 筆`}
                    </button>
                  </div>
                </div>
                {formRecords.map((rec, idx) => {
                  const basicFields = ['類型', '繳費期限', '地址', '電號'];
                  const degreeFields = ['尖峰度數', '半尖峰度數', '離峰度數', '使用度數'];
                  const amountFields = ['電費金額', '應繳稅額', '應繳總金額'];
                  const renderField = (k) => (
                    <div key={k} className="flex items-center gap-2">
                      <label className="font-medium text-gray-600 w-24 shrink-0 text-xs">{k}</label>
                      <input
                        type="text"
                        value={rec[k] ?? ''}
                        readOnly={k === '應繳總金額' || k === '使用度數'}
                        onChange={e => {
                          const updated = formRecords.map((r, i) => {
                            if (i !== idx) return r;
                            const next = { ...r, [k]: e.target.value };
                            if (k === '電費金額' || k === '應繳稅額') {
                              const fee = parseInt(k === '電費金額' ? e.target.value : r.電費金額) || 0;
                              const tax = parseInt(k === '應繳稅額' ? e.target.value : r.應繳稅額) || 0;
                              next.應繳總金額 = String(fee + tax);
                            }
                            if (k === '尖峰度數' || k === '半尖峰度數' || k === '離峰度數') {
                              const peak = parseInt(k === '尖峰度數' ? e.target.value : r.尖峰度數) || 0;
                              const halfPeak = parseInt(k === '半尖峰度數' ? e.target.value : r.半尖峰度數) || 0;
                              const offPeak = parseInt(k === '離峰度數' ? e.target.value : r.離峰度數) || 0;
                              next.使用度數 = String(peak + halfPeak + offPeak);
                            }
                            return next;
                          });
                          setFormRecords(updated);
                        }}
                        className={`flex-1 border rounded px-2 py-1 text-xs ${
                          k === '應繳總金額' ? 'bg-emerald-100 border-emerald-300 font-semibold text-emerald-800' :
                          k === '使用度數' ? 'bg-teal-100 border-teal-300 font-semibold text-teal-800' :
                          'border-gray-300 bg-white'
                        }`}
                      />
                    </div>
                  );
                  return (
                    <div key={idx} className="bg-teal-50 border border-teal-200 rounded-lg p-4 space-y-4">
                      <h5 className="text-xs font-semibold text-teal-700">第 {idx + 1} 筆 — 電號：{rec.電號}</h5>

                      {/* Basic info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {basicFields.filter(k => k in rec).map(renderField)}
                      </div>

                      {/* 使用度數 section */}
                      <div className="border border-teal-300 rounded-lg overflow-hidden">
                        <div className="bg-teal-200 px-3 py-1.5">
                          <span className="text-xs font-bold text-teal-900">使用度數（kWh）</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {degreeFields.filter(k => k in rec).map(renderField)}
                        </div>
                      </div>

                      {/* 應繳總金額 section */}
                      <div className="border border-emerald-300 rounded-lg overflow-hidden">
                        <div className="bg-emerald-100 px-3 py-1.5">
                          <span className="text-xs font-bold text-emerald-900">應繳總金額（元）</span>
                        </div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white">
                          {amountFields.filter(k => k in rec).map(renderField)}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                                // Water bills: array of records — keep as array. Electricity: flat object.
                                if (Array.isArray(sum)) {
                                  setEditSummary(sum);
                                } else {
                                  setEditSummary(typeof sum === 'object' && sum !== null ? { ...sum } : {});
                                }
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

          </div>
        )}

        {/* ══ 付款進度 tab ══ */}
        {activeTab === 'payment' && (() => {
          const STATUS_MAP = {
            '待出納': { label: '待出納', cls: 'bg-amber-100 text-amber-700' },
            '草稿':   { label: '草稿',   cls: 'bg-gray-100 text-gray-500' },
            '已出納': { label: '已出納', cls: 'bg-blue-100 text-blue-700' },
            '已付款': { label: '已付款', cls: 'bg-green-100 text-green-700' },
            '已取消': { label: '已取消', cls: 'bg-red-100 text-red-400 line-through' },
          };
          const totalPending = paymentRecords.filter(r => r.paymentOrder?.status === '待出納').reduce((s, r) => s + (r.totalAmount || 0), 0);
          const totalPaid    = paymentRecords.filter(r => r.paymentOrder?.status === '已付款').reduce((s, r) => s + (r.totalAmount || 0), 0);
          const noPO         = paymentRecords.filter(r => !r.paymentOrderId).length;

          return (
            <div className="space-y-4">
              {/* 篩選列 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={paymentFilter.warehouse}
                    onChange={e => setPaymentFilter(f => ({ ...f, warehouse: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">全部</option>
                    {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">年度（民國）</label>
                  <input type="number" value={paymentFilter.year}
                    onChange={e => setPaymentFilter(f => ({ ...f, year: e.target.value }))}
                    placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">類型</label>
                  <select value={paymentFilter.billType}
                    onChange={e => setPaymentFilter(f => ({ ...f, billType: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">全部</option>
                    <option value="電費">電費</option>
                    <option value="水費">水費</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">付款狀態</label>
                  <select value={paymentFilter.status}
                    onChange={e => setPaymentFilter(f => ({ ...f, status: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">全部</option>
                    <option value="待出納">待出納</option>
                    <option value="已出納">已出納</option>
                    <option value="已付款">已付款</option>
                    <option value="已取消">已取消</option>
                    <option value="noPO">尚無付款單</option>
                  </select>
                </div>
                <button onClick={fetchPaymentRecords}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                  重新查詢
                </button>
              </div>

              {/* 統計卡 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: '待出納金額', value: `NT$${totalPending.toLocaleString()}`, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                  { label: '已付款金額', value: `NT$${totalPaid.toLocaleString()}`, cls: 'bg-green-50 border-green-200 text-green-700' },
                  { label: '本次查詢筆數', value: `${paymentRecords.length} 筆`, cls: 'bg-gray-50 border-gray-200 text-gray-600' },
                  { label: '尚無付款單', value: `${noPO} 筆`, cls: noPO > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-200 text-gray-400' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-4 ${c.cls}`}>
                    <p className="text-xs opacity-70 mb-1">{c.label}</p>
                    <p className="text-lg font-bold">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* 表格 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {paymentLoading ? (
                  <div className="py-16 text-center text-gray-400">載入中…</div>
                ) : paymentRecords.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">查無資料</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-teal-600 text-white text-xs">
                        <th className="px-4 py-2 text-left font-medium">館別</th>
                        <th className="px-4 py-2 text-left font-medium">年月</th>
                        <th className="px-4 py-2 text-left font-medium">類型</th>
                        <th className="px-4 py-2 text-right font-medium">繳費金額</th>
                        <th className="px-4 py-2 text-left font-medium">付款單號</th>
                        <th className="px-4 py-2 text-center font-medium">付款狀態</th>
                        <th className="px-4 py-2 text-left font-medium">截止日</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paymentRecords.map(r => {
                        const po = r.paymentOrder;
                        const st = po ? (STATUS_MAP[po.status] || { label: po.status, cls: 'bg-gray-100 text-gray-500' }) : null;
                        return (
                          <tr key={r.id} className={`hover:bg-gray-50 ${po?.status === '已付款' ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-2 font-medium text-gray-700">{r.warehouse}</td>
                            <td className="px-4 py-2 text-gray-600">{r.billYear}年{String(r.billMonth).padStart(2,'0')}月</td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${r.billType === '電費' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                                {r.billType === '電費' ? '⚡ 電費' : '💧 水費'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">
                              {r.totalAmount != null ? `NT$${Number(r.totalAmount).toLocaleString()}` : <span className="text-gray-300 text-xs">未計算</span>}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-600">
                              {po ? po.orderNo : <span className="text-red-400 text-xs">尚未建立</span>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {st
                                ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-400">
                              {po?.dueDate || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-xs text-gray-400 px-1">
                付款單建立後會自動出現在「出納待支出」清單。如需修改金額或取消，請至「出納」頁面操作。
              </p>
            </div>
          );
        })()}

        {/* ══ 年度分析 tab ══ */}
        {activeTab === 'analysis' && (() => {
          const isElec = analysisFilter.billType === '電費';
          const pivotMap = buildPivot(analysisRecords, analysisFilter.billType, analysisMode);
          const labels = [...pivotMap.keys()];
          const months = [1,2,3,4,5,6,7,8,9,10,11,12];
          const unitLabel = analysisMode === 'usage' ? (isElec ? '度' : '度') : '元';
          const colTotals = months.map(m =>
            [...pivotMap.values()].reduce((s, row) => s + (row[m] || 0), 0)
          );
          const grandTotal = colTotals.reduce((a, b) => a + b, 0);

          return (
            <div className="space-y-4">
              {/* 篩選列 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別 <span className="text-red-400">*</span></label>
                  <select value={analysisFilter.warehouse}
                    onChange={e => setAnalysisFilter(f => ({ ...f, warehouse: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[120px]">
                    <option value="">請選擇</option>
                    {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">年度（民國）</label>
                  <input type="number" value={analysisFilter.year}
                    onChange={e => setAnalysisFilter(f => ({ ...f, year: e.target.value }))}
                    placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">類型</label>
                  <select value={analysisFilter.billType}
                    onChange={e => setAnalysisFilter(f => ({ ...f, billType: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="電費">電費</option>
                    <option value="水費">水費</option>
                  </select>
                </div>
                <button onClick={fetchAnalysisRecords} disabled={!analysisFilter.warehouse || !analysisFilter.year}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-40">
                  查詢
                </button>
                {/* 模式切換 */}
                <div className="ml-auto flex items-center gap-1 border rounded-lg overflow-hidden text-sm">
                  {[['usage','使用度數'],['amount','繳費金額']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setAnalysisMode(val)}
                      className={`px-3 py-2 font-medium transition-colors ${analysisMode === val
                        ? (isElec ? 'bg-amber-500 text-white' : 'bg-sky-500 text-white')
                        : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* 分析標題 */}
              {analysisRecords.length > 0 && (
                <p className="text-sm text-gray-500 px-1">
                  {isElec ? '⚡' : '💧'} {analysisFilter.warehouse} — {analysisFilter.year} 年
                  {analysisFilter.billType} {analysisMode === 'usage' ? '使用度數' : '繳費金額'}分析
                  　共 <strong>{analysisRecords.length}</strong> 個月份資料，
                  <strong>{labels.length}</strong> 條線路/地址
                </p>
              )}

              {/* Pivot 表 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto">
                {analysisLoading ? (
                  <div className="py-16 text-center text-gray-400">查詢中…</div>
                ) : !analysisFilter.warehouse ? (
                  <div className="py-16 text-center text-gray-400">
                    請在上方選擇館別，系統將自動載入資料
                  </div>
                ) : analysisRecords.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    <div className="text-3xl mb-3">📭</div>
                    <div className="font-medium">{analysisFilter.warehouse}　{analysisFilter.year} 年　{analysisFilter.billType}</div>
                    <div className="text-sm mt-1 text-gray-400">查無資料。請先在「電費單解析」或「水費單解析」上傳並儲存帳單。</div>
                  </div>
                ) : labels.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">帳單資料中無法辨識地址，請至「帳單明細管理」手動補填</div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className={isElec ? 'bg-amber-600 text-white' : 'bg-sky-600 text-white'}>
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap sticky left-0 z-10 bg-inherit min-w-[200px]">
                          列標籤
                          <span className="block text-[10px] font-normal opacity-75">
                            加總 — {analysisMode === 'usage' ? '使用度數' : '繳費金額'}
                          </span>
                        </th>
                        {months.map(m => (
                          <th key={m} className="px-3 py-2 text-right font-medium whitespace-nowrap min-w-[60px]">
                            {String(m).padStart(2, '0')}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right font-medium whitespace-nowrap min-w-[72px]">合計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labels.map((label, i) => {
                        const rowData = pivotMap.get(label);
                        const rowTotal = months.reduce((s, m) => s + (rowData[m] || 0), 0);
                        return (
                          <tr key={label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap sticky left-0 z-10 bg-inherit border-r border-gray-100 max-w-[280px] truncate"
                              title={label}>{label}</td>
                            {months.map(m => (
                              <td key={m} className="px-3 py-1.5 text-right text-gray-700 tabular-nums">
                                {rowData[m] ? rowData[m].toLocaleString() : ''}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-800 border-l border-gray-100 tabular-nums">
                              {rowTotal > 0 ? rowTotal.toLocaleString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={`font-bold border-t-2 ${isElec ? 'border-amber-300 bg-amber-50' : 'border-sky-300 bg-sky-50'}`}>
                        <td className="px-3 py-2 sticky left-0 z-10 bg-inherit">總計</td>
                        {colTotals.map((t, i) => (
                          <td key={i} className="px-3 py-2 text-right tabular-nums">
                            {t > 0 ? t.toLocaleString() : ''}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right border-l border-gray-200 tabular-nums">
                          {grandTotal > 0 ? grandTotal.toLocaleString() : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* 缺資料月份提示 */}
              {analysisRecords.length > 0 && analysisRecords.length < 12 && (
                <p className="text-xs text-amber-600 px-1">
                  提示：目前只有 {analysisRecords.map(r => `${r.billMonth} 月`).join('、')} 的資料，
                  共 {analysisRecords.length} 個月（年度完整應有 12 個月）
                </p>
              )}
            </div>
          );
        })()}

        {/* ══ 帳單明細管理 tab ══ */}
        {activeTab === 'detail' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={detailFilter.warehouse} onChange={e => setDetailFilter(f => ({ ...f, warehouse: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {WAREHOUSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">年度</label>
                <input type="text" value={detailFilter.year} onChange={e => setDetailFilter(f => ({ ...f, year: e.target.value }))}
                  placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">類型</label>
                <select value={detailFilter.billType} onChange={e => setDetailFilter(f => ({ ...f, billType: e.target.value }))}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">全部</option>
                  <option value="水費">水費</option>
                  <option value="電費">電費</option>
                </select>
              </div>
              <button onClick={fetchDetailRecords} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                重新查詢
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 text-center text-gray-400">載入中…</div>
            ) : detailRecords.length === 0 ? (
              <div className="py-12 text-center text-gray-400">尚無記錄</div>
            ) : (
              <div className="space-y-4">
                {detailRecords.map(r => {
                  let rows = [];
                  try {
                    const parsed = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : r.summaryJson;
                    rows = Array.isArray(parsed) ? parsed : [parsed];
                  } catch { rows = []; }

                  const isWaterBill = r.billType === '水費';
                  const borderColor = isWaterBill ? 'border-sky-200' : 'border-amber-200';
                  const headerBg = isWaterBill ? 'bg-sky-50' : 'bg-amber-50';
                  const badgeColor = isWaterBill ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700';
                  const accentColor = isWaterBill ? 'text-sky-600' : 'text-amber-600';

                  return (
                    <div key={r.id} className={`bg-white rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
                      {/* Record header */}
                      <div className={`px-4 py-3 ${headerBg} border-b ${borderColor} flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
                            {isWaterBill ? '💧 水費' : '⚡ 電費'}
                          </span>
                          <span className="font-semibold text-gray-800">{r.warehouse}</span>
                          <span className="text-sm text-gray-600">{r.billYear} 年 {r.billMonth} 月</span>
                          {r.fileName && <span className="text-xs text-gray-400 hidden md:inline">📄 {r.fileName}</span>}
                          <span className="text-xs text-gray-400">{rows.length} 筆明細</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              try {
                                const sum = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : (r.summaryJson || {});
                                setEditRecord(r);
                                setEditSummary(Array.isArray(sum) ? sum : { ...sum });
                              } catch { setEditRecord(r); setEditSummary({}); }
                            }}
                            className="px-3 py-1 text-xs bg-white border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 font-medium"
                          >
                            編輯
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setConfirmDelete(r)}
                              className="px-3 py-1 text-xs bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Rows table */}
                      {rows.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                {Object.keys(rows[0]).map(k => (
                                  <th key={k} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${accentColor}`}>{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {rows.map((row, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                  {Object.values(row).map((val, j) => (
                                    <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">{String(val ?? '—')}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Edit modal (shared across list + detail tabs) ══ */}
        {editRecord && editSummary !== null && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditRecord(null)}>
                <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">
                    編輯 — {editRecord.warehouse} {editRecord.billYear}年{editRecord.billMonth}月 {editRecord.billType}
                  </h4>
                  <div className="space-y-4 text-sm mb-4">
                    {Array.isArray(editSummary) ? (
                      // Multi-record (water bill array)
                      editSummary.map((rec, idx) => (
                        <div key={idx} className="border border-sky-200 rounded-lg p-3 bg-sky-50">
                          <div className="text-xs font-semibold text-sky-700 mb-2">第 {idx + 1} 筆 — 水號：{rec.水號}</div>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.keys(rec).map(k => (
                              <div key={k} className="flex items-center gap-2">
                                <label className="font-medium text-gray-600 shrink-0 text-xs w-24">{k}</label>
                                <input
                                  type="text"
                                  value={String(rec[k] ?? '')}
                                  onChange={e => setEditSummary(prev => prev.map((r, i) => i === idx ? { ...r, [k]: e.target.value } : r))}
                                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      // Single record (electricity bill flat object)
                      Object.keys(editSummary).map(k => (
                        <div key={k} className="flex flex-wrap items-center gap-2">
                          <label className="font-medium text-gray-700 w-24 shrink-0">{k}</label>
                          <input
                            type="text"
                            value={String(editSummary[k] ?? '')}
                            onChange={e => setEditSummary(prev => ({ ...prev, [k]: e.target.value }))}
                            className="flex-1 min-w-[200px] border border-gray-300 rounded px-2 py-1.5 text-sm"
                          />
                        </div>
                      ))
                    )}
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
                            fetchDetailRecords();
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
      </main>

      {/* ══ Delete confirmation modal ══ */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">確認刪除</h4>
            <p className="text-sm text-gray-600 mb-1">
              確定要刪除以下帳單記錄？此操作無法復原。
            </p>
            <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mr-2 ${confirmDelete.billType === '水費' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {confirmDelete.billType === '水費' ? '💧 水費' : '⚡ 電費'}
              </span>
              <strong>{confirmDelete.warehouse}</strong> {confirmDelete.billYear} 年 {confirmDelete.billMonth} 月
              {confirmDelete.fileName && <div className="text-gray-400 text-xs mt-1">📄 {confirmDelete.fileName}</div>}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={() => deleteRecord(confirmDelete.id)}
                disabled={detailDeleting === confirmDelete.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {detailDeleting === confirmDelete.id ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
