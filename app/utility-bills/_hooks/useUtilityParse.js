'use client';

import { useState, useRef } from 'react';

export function useUtilityParse({ showMessage, setActiveTab, fetchPaymentRecords, fetchRecords, WAREHOUSE_KEYWORDS }) {
  const [pdfFile, setPdfFile] = useState(null);       // 代表檔（第一個，供標籤/自動判讀用）
  const [pdfFiles, setPdfFiles] = useState([]);        // 全部選取的檔（支援大檔分拆成多個 PDF）
  const [startPage, setStartPage] = useState(1);
  const [extractedText, setExtractedText] = useState('');
  const [pageTexts, setPageTexts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [formRecords, setFormRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(() => {
    const now = new Date();
    return { warehouse: '', year: String(now.getFullYear() - 1911), month: String(now.getMonth() + 1), billType: '電費' };
  });
  const [ocrRecords, setOcrRecords] = useState([]);
  const [ocrValidation, setOcrValidation] = useState(null);
  const fileInputRef = useRef(null);

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

  async function extractTextFromPdf(file, fromPage = 2) {
    const pdfjsLib = await import('pdfjs-dist');
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions?.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
    }
    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
      cMapUrl: '/cmaps/',
      cMapPacked: true,
    }).promise;
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

  // Per-page parser for Taiwan Water Corporation bills (one meter per page)
  function parseWaterBillPage(pageText) {
    // Strip ALL whitespace and normalize full-width chars so pdfjs item-splitting doesn't break matching
    const ts = pageText
      .replace(/\s+/g, '')
      .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    const out = {
      水號: '', 用水地址: '', 繳費年月: '',
      用水度數: '0', 本期實用度數: '0',
      基本費: '0', 用水費: '0', 水費項目小計: '0',
      營業稅: '0', 代徵費用小計: '0', 水源保育與回饋費: '0',
      總金額: '0',
    };

    // 水號: station (1-3 chars) + account (6-10 digits) + check digit
    // Use lazy {1,3}? so station "9A" doesn't greedily consume leading digit of account "0..."
    const acctM = ts.match(/水號([0-9A-Za-z]{1,3}?)(\d{6,10})([\w])(?!\d)/);
    if (acctM) out.水號 = `${acctM[1]}-${acctM[2]}-${acctM[3]}`;

    // 用水地址: up to next known label
    const addrM = ts.match(/用水地址(.+?)(?=水表口徑|水表表號|用戶|代繳|繳費年月)/);
    if (addrM) out.用水地址 = addrM[1];

    // 繳費年月 e.g. 115/06
    const ymM = ts.match(/繳費年月(\d{2,3}\/\d{1,2})/);
    if (ymM) out.繳費年月 = ymM[1];

    // 用水度數
    const usageM = ts.match(/用水度數(\d+)/);
    if (usageM) out.用水度數 = usageM[1];

    // 本期實用度數
    const actualM = ts.match(/本期實用度數(\d+)/);
    if (actualM) out.本期實用度數 = actualM[1];

    // 基本費
    const baseM = ts.match(/基本費\$?([\d,]+\.?\d*)/);
    if (baseM) out.基本費 = baseM[1].replace(/,/g, '');

    // 用水費 — direct amount first, then formula fallback
    const feeM = ts.match(/用水費\$?([\d,]+\.?\d*)/);
    if (feeM) {
      out.用水費 = feeM[1].replace(/,/g, '');
    } else {
      const calcM = ts.match(/用水費[^0-9]*\$?([\d,]+\.?\d*)/);
      if (calcM) out.用水費 = calcM[1].replace(/,/g, '');
    }

    // 水費項目小計
    const subtotalM = ts.match(/水費項目小計\$?([\d,]+)/);
    if (subtotalM) out.水費項目小計 = subtotalM[1].replace(/,/g, '');

    // 營業稅
    const taxM = ts.match(/營業稅\$?([\d,]+)/);
    if (taxM) out.營業稅 = taxM[1].replace(/,/g, '');

    // 代徵費用小計
    const agencyM = ts.match(/代徵費用小計\$?([\d,]+)/);
    if (agencyM) out.代徵費用小計 = agencyM[1].replace(/,/g, '');

    // 水源保育與回饋費
    const conservM = ts.match(/水源保育與回饋費\$?([\d,]+)/);
    if (conservM) out.水源保育與回饋費 = conservM[1].replace(/,/g, '');

    // 代繳(代收)總金額 — . matches any paren variant （）or ()
    const totalM = ts.match(/代繳.代收.總金額([\d,]+)/);
    if (totalM) {
      out.總金額 = totalM[1].replace(/,/g, '');
    } else {
      const totalAlt = ts.match(/總金額([\d,]+)/);
      if (totalAlt) out.總金額 = totalAlt[1].replace(/,/g, '');
    }

    return out;
  }

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

  const isWater = (activeTab) => activeTab === 'water';

  // ── record → 可編輯表單列（水費 / 電費）─────────────────────────────
  function toWaterFormRecord(r) {
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
  }

  function toElecFormRecord(r) {
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
  }

  // 從一頁頁文字解析出水費 records（客戶端文字層路徑）
  function parseWaterRecordsFromTexts(texts, minLen = 30) {
    const records = [];
    for (const { text } of texts) {
      if (text.trim().length < minLen) continue;
      const stripped = text.replace(/\s+/g, '');
      if (!stripped.includes('水號') && !stripped.includes('繳費年月')) continue;
      const parsed = parseWaterBillPage(text);
      if (parsed.總金額 !== '0' || parsed.水號) records.push(parsed);
    }
    return records;
  }

  const handleFileChange = (e, activeTab) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const nonPdf = files.find(f => f.type !== 'application/pdf');
    if (nonPdf) {
      showMessage('請選擇 PDF 檔案', 'error');
      return;
    }
    // 同名去重、保留選取順序（大檔分拆成多個 PDF 時可一次全選）
    const uniq = [];
    const seen = new Set();
    for (const f of files) {
      const key = `${f.name}_${f.size}`;
      if (!seen.has(key)) { seen.add(key); uniq.push(f); }
    }
    setPdfFiles(uniq);
    setPdfFile(uniq[0]);
    setExtractedText('');
    setPageTexts([]);
    setSummary(null);
    setFormRecords([]);
    setOcrRecords([]);
    const detected = autoDetectMeta(uniq[0].name, '');
    if (Object.keys(detected).length) setMeta(prev => ({ ...prev, ...detected }));
    // 允許再次選擇相同檔名（清掉 input value，否則 onChange 不觸發）
    if (e.target) e.target.value = '';
  };

  const handleParse = async (activeTab) => {
    const files = pdfFiles.length ? pdfFiles : (pdfFile ? [pdfFile] : []);
    if (!files.length) {
      showMessage('請先選擇 PDF 檔案', 'error');
      return;
    }
    const water = activeTab === 'water';
    setLoading(true);
    setExtractedText('');
    setPageTexts([]);
    setSummary(null);
    setFormRecords([]);
    setOcrRecords([]);
    setOcrValidation(null);
    try {
      // 多檔：逐檔讀取文字層，頁碼累加避免衝突，水費 records 全部合併成一批
      const combinedTexts = [];
      const rawParts = [];
      const combinedRecords = [];
      let pageOffset = 0;
      let totalPages = 0;
      for (const file of files) {
        const { texts, numPages } = await extractTextFromPdf(file, startPage);
        totalPages += numPages;
        const offsetTexts = texts.map(t => ({ ...t, pageNum: (t.pageNum || 0) + pageOffset }));
        combinedTexts.push(...offsetTexts);
        pageOffset += numPages;
        if (files.length > 1) rawParts.push(`===== ${file.name} =====`);
        rawParts.push(offsetTexts.map(t => `--- 第 ${t.pageNum} 頁 ---\n${t.text}`).join('\n\n'));
        if (water) combinedRecords.push(...parseWaterRecordsFromTexts(texts));
      }
      setPageTexts(combinedTexts);
      setExtractedText(rawParts.join('\n\n'));
      if (combinedTexts.length === 0) {
        showMessage('無內容或 PDF 為掃描檔（無文字層），無法擷取文字', 'error');
        setLoading(false);
        return;
      }
      const allText = combinedTexts.map(t => t.text).join('\n');
      const detected = autoDetectMeta(files[0].name, allText);
      if (Object.keys(detected).length) setMeta(prev => ({ ...prev, ...detected }));

      const fileTag = files.length > 1 ? `（${files.length} 個檔）` : '';
      if (water) {
        if (combinedRecords.length > 0) {
          setOcrRecords(combinedRecords);
          setFormRecords(combinedRecords.map(toWaterFormRecord));
          showMessage(`已讀取並辨識 ${combinedRecords.length} 筆水費單${fileTag}，請核對欄位後儲存`);
        } else {
          const pagesWithText = combinedTexts.filter(t => t.text.trim().length > 10).length;
          showMessage(`已讀取共 ${combinedTexts.length} 頁（${pagesWithText} 頁有文字內容）${fileTag}，未辨識到水費單欄位，可嘗試「OCR掃描」`);
        }
      } else {
        showMessage(`已讀取共 ${combinedTexts.length} 頁${fileTag}`);
      }
    } catch (err) {
      console.error(err);
      showMessage('解析失敗：' + (err?.message || '請確認為可選取文字的 PDF'), 'error');
    }
    setLoading(false);
  };

  // 對「單一檔」執行 OCR：先試客戶端文字層，無文字層再丟外部 OCR 服務。
  // 回傳一致結構，由 handleOcrScan 合併多檔（不在此設定全域 state）。
  async function ocrScanOneFile(file, water) {
    // Step 1: client-side text extraction（台水/台電文字型 PDF）；OCR 一律從第 1 頁起
    const { texts } = await extractTextFromPdf(file, 1);
    const hasText = texts.some(t => t.text.trim().length > 50);
    const rawText = texts.map(t => `--- 第 ${t.pageNum} 頁 ---\n${t.text}`).join('\n\n');

    if (hasText) {
      if (water) {
        const records = parseWaterRecordsFromTexts(texts, 50);
        if (records.length > 0) {
          return { ocrRecords: records, formRecords: records.map(toWaterFormRecord),
                   raw: rawText, pageTexts: texts, validation: null, source: 'text' };
        }
        // 有文字層但抓不到水費欄位 → 此檔視為無資料（不丟 OCR 服務，與原行為一致）
        return { ocrRecords: [], formRecords: [], raw: rawText, pageTexts: texts, validation: null, source: 'text-empty' };
      } else {
        const allText = texts.map(t => t.text).join('\n');
        const parsed = parseTaipowerFields(allText);
        if (parsed.電號 || parsed.應繳總金額) {
          const fee = parseInt(parsed.電費金額) || 0;
          const tax = parseInt(parsed.應繳稅額) || 0;
          const record = {
            類型: '電費', 繳費期限: '未辨識',
            地址: parsed.地址 || '（未辨識，請手動填入）',
            電號: parsed.電號 || '（未辨識，請手動填入）',
            尖峰度數: '0', 半尖峰度數: '0', 離峰度數: '0',
            使用度數: parsed.使用度數 || '0',
            電費金額: parsed.電費金額 || '0',
            應繳稅額: parsed.應繳稅額 || '0',
            應繳總金額: parsed.應繳總金額 || String(fee + tax),
          };
          return { ocrRecords: [record], formRecords: [record],
                   raw: rawText, pageTexts: texts, validation: null, source: 'text' };
        }
        // 否則往下走外部 OCR 服務
      }
    }

    // Step 2: external OCR service（掃描檔無文字層）
    const form = new FormData();
    form.append('file', file);
    form.append('bill_type', water ? '水費' : '電費');
    form.append('page', '0');
    const res = await fetch('/api/utility-bills/ocr', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'OCR 失敗');
    const recs = Array.isArray(data.records) ? data.records : [];
    return {
      ocrRecords: recs,
      formRecords: recs.map(water ? toWaterFormRecord : toElecFormRecord),
      raw: (data.raw && data.raw.trim()) ? data.raw : '',
      pageTexts: Array.isArray(data.page_texts) ? data.page_texts : [],
      validation: (data.validation && data.validation.computed) ? data.validation : null,
      source: 'ocr',
    };
  }

  const handleOcrScan = async (activeTab) => {
    const water = activeTab === 'water';
    const files = pdfFiles.length ? pdfFiles : (pdfFile ? [pdfFile] : []);
    if (!files.length) {
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
      // 多檔：逐檔辨識，records/formRecords 全部合併成一批，頁碼累加，最後存成一筆
      const combinedOcr = [];
      const combinedForm = [];
      const rawParts = [];
      let combinedPageTexts = [];
      let pageOffset = 0;
      let lastValidation = null;
      let textEmptyWater = false;

      for (const file of files) {
        const r = await ocrScanOneFile(file, water);
        combinedOcr.push(...r.ocrRecords);
        combinedForm.push(...r.formRecords);
        if (r.source === 'text-empty') textEmptyWater = true;
        if (r.raw) rawParts.push(files.length > 1 ? `===== ${file.name} =====\n${r.raw}` : r.raw);
        if (Array.isArray(r.pageTexts) && r.pageTexts.length) {
          combinedPageTexts = combinedPageTexts.concat(
            r.pageTexts.map(p => ({ ...p, pageNum: (p.pageNum || 0) + pageOffset }))
          );
          pageOffset += r.pageTexts.length;
        }
        // 合計驗證僅在單檔時有意義（多檔合併的總計無對應 OCR 驗證）
        if (files.length === 1 && r.validation) lastValidation = r.validation;
      }

      if (rawParts.length) setExtractedText(rawParts.join('\n\n'));
      if (combinedPageTexts.length) setPageTexts(combinedPageTexts);
      setOcrRecords(combinedOcr);
      if (lastValidation) setOcrValidation(lastValidation);

      const detected = autoDetectMeta(files[0].name, combinedPageTexts.map(p => p.text).join(' '));
      if (Object.keys(detected).length) setMeta(prev => ({ ...prev, ...detected }));

      if (combinedForm.length > 0) {
        setFormRecords(combinedForm);
        const billLabel = water ? '水費單' : '電費單';
        const fileTag = files.length > 1 ? `（${files.length} 個檔）` : '';
        showMessage(`辨識完成，共 ${combinedForm.length} 筆${billLabel}${fileTag}，請核對欄位內容`);
      } else if (water && textEmptyWater) {
        showMessage('已提取 PDF 文字，但未辨識到台水水費欄位，請確認 PDF 格式是否正確', 'error');
      } else {
        showMessage('未辨識到任何資料，請確認 PDF 內容是否正確', 'error');
      }
    } catch (err) {
      showMessage('辨識失敗：' + (err?.message || ''), 'error');
    }
    setLoading(false);
  };

  const generatePage1Summary = (activeTab) => {
    const water = activeTab === 'water';
    if (!extractedText) {
      showMessage('請先上傳並解析 PDF', 'error');
      return;
    }
    const allText = pageTexts.map(t => t.text).join('\n');
    const year = meta.year || new Date().getFullYear();
    const month = meta.month || String(new Date().getMonth() + 1).padStart(2, '0');
    const warehouse = meta.warehouse || '麗軒';

    if (water) {
      const parsed = parseWaterBillFields(allText);
      setSummary({
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
      });
      showMessage('已自動產出水費第一頁格式（請核對後使用）');
    } else {
      const parsed = parseTaipowerFields(allText);
      setSummary({
        館別: warehouse,
        類型: '電費',
        計費期間: `${year}年${month}月`,
        地址: parsed.地址 || '（未辨識，請手動填入）',
        電號: parsed.電號 || '（未辨識，請手動填入）',
        使用度數: parsed.使用度數 || '（未辨識，請手動填入）',
        電費金額: formatAmount(parsed.電費金額),
        應繳稅額: formatAmount(parsed.應繳稅額),
        應繳總金額: formatAmount(parsed.應繳總金額),
      });
      showMessage('已自動產出第一頁格式（請核對後使用）');
    }
  };

  const copySummary = () => {
    if (!summary) return;
    const text = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text).then(() => showMessage('已複製到剪貼簿'));
  };

  const saveCurrentRecord = async (activeTab) => {
    const water = activeTab === 'water';
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
          billType: water ? '水費' : '電費',
          summaryJson: formRecords,
          fileName: pdfFiles.length
            ? (pdfFiles.length > 1 ? `${pdfFiles[0].name} 等 ${pdfFiles.length} 個檔` : pdfFiles[0].name)
            : (pdfFile?.name || null),
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
    } catch {
      showMessage('儲存失敗', 'error');
    }
    setSaving(false);
  };

  return {
    pdfFile, setPdfFile,
    pdfFiles, setPdfFiles,
    startPage, setStartPage,
    extractedText, setExtractedText,
    pageTexts, setPageTexts,
    summary, setSummary,
    formRecords, setFormRecords,
    loading,
    saving,
    meta, setMeta,
    ocrRecords, setOcrRecords,
    ocrValidation, setOcrValidation,
    fileInputRef,
    handleFileChange,
    handleParse,
    handleOcrScan,
    generatePage1Summary,
    copySummary,
    saveCurrentRecord,
  };
}
