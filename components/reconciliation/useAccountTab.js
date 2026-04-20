'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  parseCSVWithQuotes, parseAmountCiti, parseDateMDY,
  rocDateToIso, parseBankStatementPdfText,
} from './bankParsers';

export function useAccountTab({ activeTab, showMessage, session, formats }) {
  const now = new Date();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [acctYear, setAcctYear] = useState(now.getFullYear());
  const [acctMonth, setAcctMonth] = useState(now.getMonth() + 1);
  const [reconciliation, setReconciliation] = useState(null);
  const [bankLines, setBankLines] = useState([]);
  const [systemTxs, setSystemTxs] = useState([]);
  const [acctLoading, setAcctLoading] = useState(false);
  const [bankBalanceInput, setBankBalanceInput] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [diffExplained, setDiffExplained] = useState('');
  const [selectedBankLine, setSelectedBankLine] = useState(null);
  const [selectedSystemTx, setSelectedSystemTx] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: '', description: '', transactionDate: '' });
  const [importLines, setImportLines] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);

  const loadReconciliation = useCallback(async () => {
    if (!selectedAccountId) return;
    setAcctLoading(true);
    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: parseInt(selectedAccountId), year: acctYear, month: acctMonth })
      });
      const recon = await res.json();
      if (recon.error) {
        showMessage(recon.error, 'error');
        setAcctLoading(false);
        return;
      }
      setReconciliation(recon);
      setBankBalanceInput(recon.closingBalanceBank || '');
      if (recon.id) {
        const detailRes = await fetch(`/api/reconciliation/${recon.id}`);
        const detail = await detailRes.json();
        setBankLines(detail.bankLines || []);
        setSystemTxs(detail.systemTransactions || []);
        setReconciliation(prev => ({ ...prev, ...detail }));
      }
    } catch (e) {
      showMessage('載入對帳資料失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setAcctLoading(false);
  }, [selectedAccountId, acctYear, acctMonth, showMessage]);

  useEffect(() => {
    if (activeTab === 'account' && selectedAccountId) loadReconciliation();
  }, [activeTab, selectedAccountId, acctYear, acctMonth, loadReconciliation]);

  const updateBankBalance = async () => {
    if (!reconciliation?.id) return;
    try {
      const res = await fetch(`/api/reconciliation/${reconciliation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_bank_balance', closingBalanceBank: parseFloat(bankBalanceInput) || 0 })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        setReconciliation(prev => ({ ...prev, ...data }));
        showMessage('銀行餘額已更新');
      }
    } catch {
      showMessage('更新失敗', 'error');
    }
  };

  const confirmReconciliation = async () => {
    if (!reconciliation?.id) return;
    const diff = reconciliation.difference || 0;
    if (diff !== 0 && !diffExplained.trim()) {
      showMessage('差異金額不為零時，需填寫差異說明', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/reconciliation/${reconciliation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          confirmedBy: session?.user?.name || '系統',
          differenceExplained: diffExplained,
          note: confirmNote
        })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        setReconciliation(prev => ({ ...prev, ...data }));
        showMessage('對帳已確認封存');
      }
    } catch {
      showMessage('確認失敗', 'error');
    }
  };

  const matchPair = async () => {
    if (!selectedBankLine || !selectedSystemTx) {
      showMessage('請同時選擇銀行明細和系統交易', 'error');
      return;
    }
    try {
      const res = await fetch('/api/reconciliation/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId: selectedBankLine, transactionId: selectedSystemTx, action: 'match' })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('配對成功');
        setSelectedBankLine(null);
        setSelectedSystemTx(null);
        loadReconciliation();
      }
    } catch {
      showMessage('配對失敗', 'error');
    }
  };

  const unmatchLine = async (lineId) => {
    try {
      const res = await fetch('/api/reconciliation/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, action: 'unmatch' })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('已取消配對');
        loadReconciliation();
      }
    } catch {
      showMessage('取消配對失敗', 'error');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    const fmt = formats.find(f => String(f.id) === String(selectedFormatId));
    const isPdf = /\.pdf$/i.test(file.name || '');
    const isExcel = /\.(xls|xlsx)$/i.test(file.name || '');
    let encoding = fmt?.fileEncoding || 'UTF-8';
    if (!isPdf && !isExcel && (fmt?.bankName === '土地銀行' || fmt?.bankName === '土銀' || fmt?.bankName === '陽信銀行')) {
      if (encoding === 'UTF-8') encoding = 'Big5';
    }

    const processResult = (parsed) => {
      setImportLines(parsed);
      if (parsed.length > 0) {
        showMessage(`已解析 ${parsed.length} 筆明細`);
      } else {
        showMessage('無法解析資料，請確認檔案格式與編碼是否正確', 'error');
      }
    };

    if (isPdf) {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
        let fullText = '';
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const items = [...(content?.items || [])].sort((a, b) => {
            const y1 = a.transform?.[5] ?? 0;
            const y2 = b.transform?.[5] ?? 0;
            if (Math.abs(y1 - y2) > 5) return y2 - y1;
            return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
          });
          let lastY = null;
          for (const it of items) {
            const y = it.transform?.[5] ?? 0;
            if (lastY !== null && Math.abs(y - lastY) > 5) fullText += '\n';
            fullText += (it.str ?? '');
            lastY = y;
          }
          fullText += '\n';
        }
        const parsed = parseBankStatementPdfText(fullText, fmt?.bankName || '');
        processResult(parsed);
      } catch (err) {
        console.error('Bank statement PDF parse error:', err);
        showMessage('PDF 解析失敗：' + (err.message || '未知錯誤'), 'error');
      }
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let parsed = [];
      let matrix = null;

      if (isExcel) {
        try {
          const mod = await import('xlsx');
          const XLSX = mod.default || mod;
          const wb = XLSX.read(evt.target.result, { type: 'array', raw: false });
          const sheetName = (fmt && (fmt.bankName === '玉山銀行' || fmt.bankName === '玉山')) && wb.SheetNames.length > 1 ? wb.SheetNames[1] : wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) || [];
        } catch (err) {
          showMessage('Excel 解析失敗：' + (err.message || '未知錯誤'), 'error');
          return;
        }
      }

      // 兆豐銀行 Excel
      if (fmt && (fmt.bankName === '兆豐銀行' || fmt.bankName === '兆豐') && isExcel && matrix) {
        const skipTop = fmt.skipTopRows ?? 7;
        for (let i = skipTop; i < matrix.length; i++) {
          const row = matrix[i];
          if (!Array.isArray(row) || row.length < 5) continue;
          const txDateRaw = row[1] || row[0] || '';
          const txDate = String(txDateRaw).replace(/\//g, '-').trim();
          if (!/^\d{4}-\d{2}-\d{2}/.test(txDate)) continue;
          const dateOnly = txDate.slice(0, 10);
          const debitAmount = parseAmountCiti(row[3]);
          const creditAmount = parseAmountCiti(row[4]);
          const memo = String(row[6] || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          parsed.push({ txDate: dateOnly, description: memo ? `${row[2] || ''} ｜備註:${memo}`.trim() : (row[2] || ''), debitAmount, creditAmount, referenceNo: memo.slice(0, 100) || '', note: memo || undefined, runningBalance: parseAmountCiti(row[5]) });
        }
        processResult(parsed);
        return;
      }

      // 玉山銀行 Excel
      if (fmt && (fmt.bankName === '玉山銀行' || fmt.bankName === '玉山') && isExcel && matrix) {
        const skipTop = fmt.skipTopRows ?? 1;
        for (let i = skipTop; i < matrix.length; i++) {
          const row = matrix[i];
          if (!Array.isArray(row) || row.length < 3) continue;
          const txDate = parseDateMDY(row[0]);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const debitAmount = parseAmountCiti(row[3]);
          const creditAmount = parseAmountCiti(row[4]);
          const memo = String(row[7] || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          const desc = [row[2], row[6], memo].filter(Boolean).join(' ').trim();
          parsed.push({ txDate, description: memo ? `${[row[2], row[6]].filter(Boolean).join(' · ')} ｜備註:${memo}`.trim() : (desc || row[2] || ''), debitAmount, creditAmount, referenceNo: memo.slice(0, 100) || '', note: memo || undefined, runningBalance: parseAmountCiti(row[5]) });
        }
        processResult(parsed);
        return;
      }

      // 土地銀行 XLS
      if (fmt && (fmt.bankName === '土地銀行' || fmt.bankName === '土銀') && isExcel && matrix) {
        let dataStart = 0;
        for (let r = 0; r < Math.min(matrix.length, 10); r++) {
          const first = String(matrix[r]?.[0] || '').trim();
          if (first === '交易日期' || first === '交易日') { dataStart = r + 1; break; }
        }
        if (dataStart === 0) dataStart = 6;
        for (let i = dataStart; i < matrix.length; i++) {
          const row = matrix[i];
          if (!Array.isArray(row) || row.length < 7) continue;
          const dateRaw = String(row[0] || '').trim();
          if (!dateRaw || dateRaw === '交易日期') continue;
          const dm = dateRaw.replace(/^0+/, '').match(/^(\d{2,3})\.(\d{2})\.(\d{2})$/);
          if (!dm) continue;
          const year = parseInt(dm[1], 10) + 1911;
          const txDate = `${year}-${dm[2]}-${dm[3]}`;
          const debitCredit = String(row[5] || '').trim();
          const amountStr = parseAmountCiti(row[6]);
          const debitAmount = debitCredit === '支出' ? amountStr : '0';
          const creditAmount = debitCredit === '存入' ? amountStr : '0';
          const branch = String(row[2] || '').trim();
          const desc = String(row[3] || '').trim();
          const noteRaw = String(row[8] || '');
          const noteNorm = noteRaw.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          const descLine = [branch, desc].filter(Boolean).join(' · ') || desc;
          parsed.push({ txDate, description: noteNorm ? `${descLine} ｜備註:${noteNorm}` : descLine, debitAmount, creditAmount, referenceNo: noteNorm.slice(0, 100) || '', note: noteNorm || undefined, runningBalance: parseAmountCiti(row[7]) });
        }
        processResult(parsed);
        return;
      }

      const text = evt.target.result;
      if (!text && !matrix) return;
      if (fmt && (fmt.bankName === '兆豐銀行' || fmt.bankName === '兆豐' || fmt.bankName === '玉山銀行' || fmt.bankName === '玉山') && !isExcel) {
        showMessage('兆豐、玉山請上傳 .xls 或 .xlsx 檔案', 'error');
        return;
      }

      // 世華銀行 / 國泰世華 CSV
      if (fmt && (fmt.bankName === '世華銀行' || fmt.bankName === '國泰世華') && typeof text === 'string') {
        const allRows = parseCSVWithQuotes(text);
        const skipTop = fmt.skipTopRows || 5;
        if (allRows.length <= skipTop) { showMessage('CSV 檔案格式不符或無資料', 'error'); return; }
        for (let i = skipTop; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 6) continue;
          if (cols[0] === '提出' || cols[0] === '存入' || /總金額/.test(cols[0] || '')) break;
          const txDate = (cols[1] || cols[0] || '').replace(/\//g, '-');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const memo = String(cols[6] || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          const desc = [cols[2], cols[7]].filter(Boolean).join(' ').trim();
          parsed.push({ txDate, description: memo ? `${[cols[2], cols[7]].filter(Boolean).join(' · ')} ｜備註:${memo}`.trim() : (desc || cols[2] || ''), debitAmount: parseAmountCiti(cols[3]), creditAmount: parseAmountCiti(cols[4]), referenceNo: memo.slice(0, 100) || '', note: memo || undefined, runningBalance: parseAmountCiti(cols[5]) });
        }
        processResult(parsed);
        return;
      }

      // 陽信銀行 CSV
      if (fmt && fmt.bankName === '陽信銀行') {
        const allRows = parseCSVWithQuotes(text);
        if (allRows.length < 1) { showMessage('CSV 檔案格式不符或無資料', 'error'); return; }
        for (let i = 0; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 4) continue;
          const txDate = (cols[0] || '').replace(/\t/g, '').replace(/\//g, '-').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const memo = (cols[7] || '').replace(/\t/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          const desc = [cols[4], cols[5], cols[6]].filter(Boolean).join(' ').trim();
          parsed.push({ txDate, description: memo ? `${desc || cols[4] || ''} ｜備註:${memo}`.trim() : (desc || cols[4] || ''), debitAmount: parseAmountCiti(cols[1]), creditAmount: parseAmountCiti(cols[2]), referenceNo: memo.slice(0, 100) || '', note: memo || undefined, runningBalance: parseAmountCiti(cols[3]) });
        }
        processResult(parsed);
        return;
      }

      // 土地銀行 CSV
      if (fmt && (fmt.bankName === '土地銀行' || fmt.bankName === '土銀')) {
        const allRows = parseCSVWithQuotes(text);
        let dataStart = 0;
        for (let r = 0; r < allRows.length; r++) {
          const first = (allRows[r][0] || '').trim();
          if (first === '交易日' || first === '交易日期') { dataStart = r + 1; break; }
        }
        if (allRows.length <= dataStart) { showMessage('CSV 檔案格式不符或無資料', 'error'); return; }
        for (let i = dataStart; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 7) continue;
          const txDateRaw = (cols[0] || '').trim();
          if (txDateRaw === '交易日' || !txDateRaw) continue;
          const txDate = rocDateToIso(txDateRaw);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const desc = (cols[3] || '').trim();
          const debitCredit = (cols[5] || '').trim();
          const amountRaw = (cols[6] || '0').trim().replace(/,/g, '');
          const amount = amountRaw && !isNaN(parseFloat(amountRaw)) ? amountRaw : '0';
          const balance = (cols[7] || '').trim().replace(/,/g, '');
          const note = (cols[8] || '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
          const debitAmount = (debitCredit === '支出' || debitCredit === '借') ? amount : '0';
          const creditAmount = (debitCredit === '存入' || debitCredit === '貸') ? amount : '0';
          const descLine = [cols[2], desc].filter(Boolean).join(' · ').trim() || desc;
          parsed.push({ txDate, description: note ? `${descLine} ｜備註:${note}` : descLine, debitAmount, creditAmount, referenceNo: note ? note.slice(0, 100) : (cols[2] || '').slice(0, 100), note: note || undefined, runningBalance: balance || '0' });
        }
        processResult(parsed);
        return;
      }

      // 預設格式
      const rows = text.split(/\r?\n/).filter(r => r.trim());
      if (rows.length < 2) {
        showMessage('CSV 檔案至少需要標題列和一筆資料，或請先選擇銀行格式', 'error');
        return;
      }
      const skip = fmt?.skipTopRows || 0;
      const headerIdx = Math.min(fmt?.headerRowIndex ?? 0, rows.length - 1);
      for (let i = Math.max(1, headerIdx + 1, skip + 1); i < rows.length; i++) {
        const cols = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 4) continue;
        const memo = (cols[4] || '').trim();
        parsed.push({ txDate: cols[0] || '', description: memo ? `${cols[1] || ''} ｜備註:${memo}`.trim() : (cols[1] || ''), debitAmount: cols[2] || '0', creditAmount: cols[3] || '0', referenceNo: memo.slice(0, 100) || '', note: memo || undefined, runningBalance: cols[5] || '' });
      }
      setImportLines(parsed);
      if (parsed.length > 0) showMessage(`已解析 ${parsed.length} 筆明細`);
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, encoding === 'Big5' || encoding === 'MS950' ? 'Big5' : 'UTF-8');
  };

  const submitImport = async () => {
    if (!selectedAccountId || !selectedFormatId || importLines.length === 0) {
      showMessage('請選擇帳戶、銀行格式並上傳對帳單檔案', 'error');
      return;
    }
    setImportSubmitting(true);
    try {
      const res = await fetch('/api/reconciliation/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: parseInt(selectedAccountId), bankFormatId: parseInt(selectedFormatId), year: acctYear, month: acctMonth, fileName: importFileName, lines: importLines })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage(data.message);
        setShowImportModal(false);
        setImportLines([]);
        setImportFileName('');
        loadReconciliation();
      }
    } catch {
      showMessage('匯入失敗', 'error');
    } finally {
      setImportSubmitting(false);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustForm.amount || !adjustForm.description) {
      showMessage('金額和說明為必填', 'error');
      return;
    }
    setAdjustmentSubmitting(true);
    try {
      const res = await fetch('/api/reconciliation/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: parseInt(selectedAccountId), reconciliationId: reconciliation.id, amount: parseFloat(adjustForm.amount), description: adjustForm.description, transactionDate: adjustForm.transactionDate || undefined })
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage(data.message);
        setShowAdjustModal(false);
        setAdjustForm({ amount: '', description: '', transactionDate: '' });
        loadReconciliation();
      }
    } catch {
      showMessage('調整失敗', 'error');
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  return {
    selectedAccountId, setSelectedAccountId,
    acctYear, setAcctYear,
    acctMonth, setAcctMonth,
    reconciliation, setReconciliation,
    bankLines,
    systemTxs,
    acctLoading,
    bankBalanceInput, setBankBalanceInput,
    confirmNote, setConfirmNote,
    diffExplained, setDiffExplained,
    selectedBankLine, setSelectedBankLine,
    selectedSystemTx, setSelectedSystemTx,
    showImportModal, setShowImportModal,
    showAdjustModal, setShowAdjustModal,
    adjustForm, setAdjustForm,
    importLines,
    importFileName,
    selectedFormatId, setSelectedFormatId,
    importSubmitting,
    adjustmentSubmitting,
    loadReconciliation,
    updateBankBalance,
    confirmReconciliation,
    matchPair,
    unmatchLine,
    handleFileUpload,
    submitImport,
    submitAdjustment,
  };
}
