'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const TABS = [
  { key: 'dashboard', label: '對帳儀表板' },
  { key: 'account', label: '帳戶對帳' },
  { key: 'formats', label: '銀行格式管理' },
  { key: 'credit-card', label: '信用卡對帳' }
];

const STATUS_MAP = {
  not_started: { label: '未開始', color: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-500' },
  draft: { label: '進行中', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', dot: 'bg-yellow-500' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' }
};

const BUILT_IN_BANKS = ['玉山', '台新', '國泰', '土銀', '中信', '合庫', '第一', '台灣銀行', '郵局'];

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function ReconciliationPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;

  // Tab state
  const [activeTab, setActiveTab] = useState('dashboard');

  // Dashboard state
  const now = new Date();
  const [dashYear, setDashYear] = useState(now.getFullYear());
  const [dashMonth, setDashMonth] = useState(now.getMonth() + 1);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashFilter, setDashFilter] = useState('all');
  const [dashSearch, setDashSearch] = useState('');

  // Account tab state
  const [accounts, setAccounts] = useState([]);
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

  // Import state
  const [importLines, setImportLines] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [selectedFormatId, setSelectedFormatId] = useState('');

  // Formats tab state
  const [formats, setFormats] = useState([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [formatForm, setFormatForm] = useState({
    bankName: '', bankCode: '', fileEncoding: 'UTF-8', fileType: 'csv',
    dateColumn: '', descriptionColumn: '', debitColumn: '', creditColumn: '',
    balanceColumn: '', referenceColumn: '', dateFormat: 'YYYY-MM-DD'
  });

  // Credit card tab state
  const [ccStatements, setCcStatements] = useState([]);
  const [ccSummary, setCcSummary] = useState(null);
  const [ccMerchantConfigs, setCcMerchantConfigs] = useState([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccMonth, setCcMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [ccWarehouseFilter, setCcWarehouseFilter] = useState('');
  const [ccStatusFilter, setCcStatusFilter] = useState('all');
  const [ccExpandedId, setCcExpandedId] = useState(null);
  const [ccBuildings, setCcBuildings] = useState([]);
  const [ccShowUpload, setCcShowUpload] = useState(false);
  const [ccUploadWarehouse, setCcUploadWarehouse] = useState('');
  const [ccParsedData, setCcParsedData] = useState(null);
  const [ccShowConfigModal, setCcShowConfigModal] = useState(false);
  const [ccConfigForm, setCcConfigForm] = useState({ warehouseId: '', bankName: '國泰世華', merchantId: '', merchantName: '', accountNo: '', domesticFeeRate: '1.70', foreignFeeRate: '2.30', selfFeeRate: '1.70' });

  const [importSubmitting, setImportSubmitting] = useState(false);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [formatSaving, setFormatSaving] = useState(false);
  const [ccConfigSaving, setCcConfigSaving] = useState(false);

  // Messages
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // Read tab from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && TABS.find(t => t.key === tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Update URL when tab changes
  const changeTab = (tab) => {
    setActiveTab(tab);
    const url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url);
  };

  // ---- Dashboard ----
  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch(`/api/reconciliation/dashboard?year=${dashYear}&month=${dashMonth}`);
      const data = await res.json();
      setDashboardData(data);
    } catch (e) {
      console.error('載入儀表板失敗:', e);
    }
    setDashLoading(false);
  }, [dashYear, dashMonth]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ---- Accounts ----
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      const bankAccounts = data.filter(a => a.type === '銀行存款' && a.isActive);
      setAccounts(bankAccounts);
    } catch (e) {
      console.error('載入帳戶失敗:', e);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ---- Formats ----
  const fetchFormats = useCallback(async () => {
    setFormatsLoading(true);
    try {
      const res = await fetch('/api/reconciliation/bank-formats');
      const data = await res.json();
      setFormats(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('載入銀行格式失敗:', e);
    }
    setFormatsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'formats' || activeTab === 'account') fetchFormats();
  }, [activeTab, fetchFormats]);

  // ---- Credit Card ----
  const fetchCcData = useCallback(async () => {
    setCcLoading(true);
    try {
      const params = new URLSearchParams({ month: ccMonth });
      if (ccWarehouseFilter) params.set('warehouseId', ccWarehouseFilter);
      if (ccStatusFilter !== 'all') params.set('status', ccStatusFilter);

      const [stmtRes, summaryRes, configRes, bldRes] = await Promise.all([
        fetch(`/api/reconciliation/credit-card-statements?${params}`),
        fetch(`/api/reconciliation/credit-card-summary?month=${ccMonth}`),
        fetch('/api/reconciliation/credit-card-merchant-config'),
        fetch('/api/warehouse-departments'),
      ]);

      if (stmtRes.ok) setCcStatements(await stmtRes.json());
      if (summaryRes.ok) setCcSummary(await summaryRes.json());
      if (configRes.ok) setCcMerchantConfigs(await configRes.json());
      if (bldRes.ok) {
        const bData = await bldRes.json();
        setCcBuildings((bData.list || []).filter(w => w.type === 'building'));
      }
    } catch (e) {
      console.error('載入信用卡對帳失敗:', e);
    }
    setCcLoading(false);
  }, [ccMonth, ccWarehouseFilter, ccStatusFilter]);

  useEffect(() => {
    if (activeTab === 'credit-card') fetchCcData();
  }, [activeTab, fetchCcData]);

  // ---- Load reconciliation for selected account ----
  const loadReconciliation = useCallback(async () => {
    if (!selectedAccountId) return;
    setAcctLoading(true);
    try {
      // Create or get reconciliation
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

      // Load full details
      if (recon.id) {
        const detailRes = await fetch(`/api/reconciliation/${recon.id}`);
        const detail = await detailRes.json();
        setBankLines(detail.bankLines || []);
        setSystemTxs(detail.systemTransactions || []);
        setReconciliation(prev => ({ ...prev, ...detail }));
      }
    } catch (e) {
      console.error('載入對帳資料失敗:', e);
    }
    setAcctLoading(false);
  }, [selectedAccountId, acctYear, acctMonth]);

  useEffect(() => {
    if (activeTab === 'account' && selectedAccountId) {
      loadReconciliation();
    }
  }, [activeTab, selectedAccountId, acctYear, acctMonth, loadReconciliation]);

  // Navigate from dashboard card to account tab
  const navigateToAccount = (accountId) => {
    setSelectedAccountId(String(accountId));
    changeTab('account');
  };

  // ---- Update bank balance ----
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
    } catch (e) {
      showMessage('更新失敗', 'error');
    }
  };

  // ---- Confirm reconciliation ----
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
        fetchDashboard();
      }
    } catch (e) {
      showMessage('確認失敗', 'error');
    }
  };

  // ---- Manual match ----
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
    } catch (e) {
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
    } catch (e) {
      showMessage('取消配對失敗', 'error');
    }
  };

  // 解析 CSV（支援欄位內含換行與引號）
  const parseCSVWithQuotes = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = !inQuotes; }
      } else if (!inQuotes && c === ',') {
        row.push(field.trim().replace(/\s+/g, ' '));
        field = '';
      } else if (!inQuotes && (c === '\n' || c === '\r')) {
        row.push(field.trim().replace(/\s+/g, ' '));
        if (row.length > 0 && row.some(cell => cell)) rows.push(row);
        row = [];
        field = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        field += c;
      }
    }
    if (field || row.length) {
      row.push(field.trim().replace(/\s+/g, ' '));
      if (row.some(cell => cell)) rows.push(row);
    }
    return rows;
  };

  const parseAmountCiti = (str) => {
    const s = String(str || '').replace(/,/g, '').replace(/−|－|—/g, '').trim();
    return s && !isNaN(parseFloat(s)) ? s : '0';
  };

  const parseDateMDY = (str) => {
    const s = String(str || '').trim();
    const parts = s.split(/[\/\-\.]/);
    if (parts.length < 3) return s;
    let m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (isNaN(m) || isNaN(d) || isNaN(y)) return s;
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  // 將民國 YYY.MM.DD 或 YYY/M/D 轉為 YYYY-MM-DD
  const rocDateToIso = (str) => {
    const s = String(str || '').trim();
    const m = s.match(/^(\d{3})[.\/\-](\d{1,2})[.\/\-](\d{1,2})$/);
    if (!m) return str;
    const year = parseInt(m[1], 10) + 1911;
    const month = String(parseInt(m[2], 10)).padStart(2, '0');
    const day = String(parseInt(m[3], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ---- CSV/Excel Import ----
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    const fmt = formats.find(f => String(f.id) === String(selectedFormatId));
    let encoding = fmt?.fileEncoding || 'UTF-8';
    // 土地銀行、陽信銀行 CSV 多為 Big5 編碼，若為 UTF-8 則改為 Big5 避免亂碼
    if (!isExcel && (fmt?.bankName === '土地銀行' || fmt?.bankName === '土銀' || fmt?.bankName === '陽信銀行')) {
      if (encoding === 'UTF-8') encoding = 'Big5';
    }
    const isExcel = /\.(xls|xlsx)$/i.test(file.name || '');

    const processResult = (parsed) => {
      setImportLines(parsed);
      if (parsed.length > 0) showMessage(`已解析 ${parsed.length} 筆明細`);
    };

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

      // 兆豐銀行 Excel：第7列起為資料，欄位 銀行帳務日, 交易項目, 支出, 收入, 帳戶餘額, 存摺備註
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
          const desc = [row[2], row[6]].filter(Boolean).join(' ').trim();
          parsed.push({
            txDate: dateOnly,
            description: desc || row[2] || '',
            debitAmount,
            creditAmount,
            referenceNo: row[6] || '',
            runningBalance: parseAmountCiti(row[5])
          });
        }
        processResult(parsed);
        return;
      }

      // 玉山銀行 Excel：Sheet2，表頭列0，資料從列1，欄位 交易日期,摘要,提,存,帳戶餘額,存摺備註
      if (fmt && (fmt.bankName === '玉山銀行' || fmt.bankName === '玉山') && isExcel && matrix) {
        const skipTop = fmt.skipTopRows ?? 1;
        for (let i = skipTop; i < matrix.length; i++) {
          const row = matrix[i];
          if (!Array.isArray(row) || row.length < 3) continue;
          const txDate = parseDateMDY(row[0]);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const debitAmount = parseAmountCiti(row[3]);
          const creditAmount = parseAmountCiti(row[4]);
          const desc = [row[2], row[6]].filter(Boolean).join(' ').trim();
          parsed.push({
            txDate,
            description: desc || row[2] || '',
            debitAmount,
            creditAmount,
            referenceNo: row[7] || '',
            runningBalance: parseAmountCiti(row[5])
          });
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

      // 世華銀行格式：前5列說明，第6列表頭，欄位含引號與換行，提出/存入分欄
      if (fmt && (fmt.bankName === '世華銀行' || fmt.bankName === '國泰世華') && typeof text === 'string') {
        const allRows = parseCSVWithQuotes(text);
        const skipTop = fmt.skipTopRows || 5;
        if (allRows.length <= skipTop) {
          showMessage('CSV 檔案格式不符或無資料', 'error');
          return;
        }
        for (let i = skipTop; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 6) continue;
          if (cols[0] === '提出' || cols[0] === '存入' || /總金額/.test(cols[0] || '')) break;
          const txDate = (cols[1] || cols[0] || '').replace(/\//g, '-'); // 帳務日期
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const debitAmount = parseAmountCiti(cols[3]);
          const creditAmount = parseAmountCiti(cols[4]);
          const desc = [cols[2], cols[7]].filter(Boolean).join(' ').trim();
          parsed.push({
            txDate,
            description: desc || cols[2] || '',
            debitAmount,
            creditAmount,
            referenceNo: cols[6] || '',
            runningBalance: parseAmountCiti(cols[5])
          });
        }
      } else if (fmt && (fmt.bankName === '陽信銀行')) {
        const allRows = parseCSVWithQuotes(text);
        const skipTop = fmt.skipTopRows ?? 0;
        if (allRows.length <= skipTop) {
          showMessage('CSV 檔案格式不符或無資料', 'error');
          return;
        }
        for (let i = skipTop; i < allRows.length; i++) {
          const cols = allRows[i];
          if (cols.length < 4) continue;
          const txDate = (cols[0] || '').replace(/\//g, '-').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) continue;
          const debitAmount = parseAmountCiti(cols[1]);
          const creditAmount = parseAmountCiti(cols[2]);
          const desc = [cols[4], cols[6]].filter(Boolean).join(' ').trim();
          parsed.push({
            txDate,
            description: desc || cols[4] || '',
            debitAmount,
            creditAmount,
            referenceNo: cols[7] || '',
            runningBalance: parseAmountCiti(cols[3])
          });
        }
      } else if (fmt && (fmt.bankName === '土地銀行' || fmt.bankName === '土銀')) {
        const allRows = parseCSVWithQuotes(text);
        const skipTop = fmt.skipTopRows ?? 5;
        const headerRowIndex = fmt.headerRowIndex ?? 5;
        const dataStart = Math.max(skipTop, headerRowIndex) + 1;
        if (allRows.length <= dataStart) {
          showMessage('CSV 檔案格式不符或無資料', 'error');
          return;
        }
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
          const note = (cols[8] || '').trim();
          const debitAmount = (debitCredit === '支出' || debitCredit === '借') ? amount : '0';
          const creditAmount = (debitCredit === '存入' || debitCredit === '貸') ? amount : '0';
          parsed.push({
            txDate,
            description: note ? `${desc} ${note}`.trim() : desc,
            debitAmount,
            creditAmount,
            referenceNo: cols[2] || '',
            runningBalance: balance || '0'
          });
        }
        processResult(parsed);
        return;
      } else {
        // 預設格式：日期,說明,提款,存入,備註,餘額
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
          parsed.push({
            txDate: cols[0] || '',
            description: cols[1] || '',
            debitAmount: cols[2] || '0',
            creditAmount: cols[3] || '0',
            referenceNo: cols[4] || '',
            runningBalance: cols[5] || ''
          });
        }
      }
      setImportLines(parsed);
      if (parsed.length > 0) showMessage(`已解析 ${parsed.length} 筆明細`);
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, encoding === 'Big5' || encoding === 'MS950' ? 'Big5' : 'UTF-8');
  };

  const submitImport = async () => {
    if (!selectedAccountId || !selectedFormatId || importLines.length === 0) {
      showMessage('請選擇帳戶、銀行格式並上傳 CSV', 'error');
      return;
    }
    setImportSubmitting(true);
    try {
      const res = await fetch('/api/reconciliation/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: parseInt(selectedAccountId),
          bankFormatId: parseInt(selectedFormatId),
          year: acctYear,
          month: acctMonth,
          fileName: importFileName,
          lines: importLines
        })
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
    } catch (e) {
      showMessage('匯入失敗', 'error');
    } finally {
      setImportSubmitting(false);
    }
  };

  // ---- Adjustment ----
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
        body: JSON.stringify({
          accountId: parseInt(selectedAccountId),
          reconciliationId: reconciliation.id,
          amount: parseFloat(adjustForm.amount),
          description: adjustForm.description,
          transactionDate: adjustForm.transactionDate || undefined
        })
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
    } catch (e) {
      showMessage('調整失敗', 'error');
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  // ---- Create bank format ----
  const submitFormat = async () => {
    if (!formatForm.bankName.trim()) {
      showMessage('銀行名稱為必填', 'error');
      return;
    }
    setFormatSaving(true);
    try {
      const res = await fetch('/api/reconciliation/bank-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatForm)
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('銀行格式已建立');
        setShowFormatForm(false);
        setFormatForm({
          bankName: '', bankCode: '', fileEncoding: 'UTF-8', fileType: 'csv',
          dateColumn: '', descriptionColumn: '', debitColumn: '', creditColumn: '',
          balanceColumn: '', referenceColumn: '', dateFormat: 'YYYY-MM-DD'
        });
        fetchFormats();
      }
    } catch (e) {
      showMessage('儲存格式失敗', 'error');
    } finally {
      setFormatSaving(false);
    }
  };

  // ---- Credit Card: PDF parse (client-side text extraction) ----
  const handleCcPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseCathayPdf(text);
      if (parsed) {
        setCcParsedData(parsed);
        showMessage(`解析成功：${parsed.merchantName}，請款金額 ${formatMoney(parsed.totalAmount)}`);
      } else {
        showMessage('無法解析 PDF 內容，請確認格式', 'error');
      }
    } catch (err) {
      // If text() fails (binary PDF), show manual entry hint
      showMessage('PDF 為二進位格式，請使用手動輸入或轉換為文字 PDF', 'error');
    }
    e.target.value = '';
  };

  // Parse Cathay United Bank credit card merchant statement
  function parseCathayPdf(text) {
    try {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      // Extract merchant info
      let merchantId = '', merchantName = '', billingDate = '', paymentDate = '', accountNo = '';
      for (const line of lines) {
        const mid = line.match(/商店代號[：:]\s*(\d+)/);
        if (mid) merchantId = mid[1];
        const mn = line.match(/商店名稱[：:]\s*(.+)/);
        if (mn) merchantName = mn[1].trim();
        const bd = line.match(/請款日[期]?[：:]\s*(\d{4}\/\d{2}\/\d{2})/);
        if (bd) billingDate = bd[1];
        const pd = line.match(/撥款日[期]?[：:]\s*(\d{4}\/\d{2}\/\d{2})/);
        if (pd) paymentDate = pd[1];
        const an = line.match(/入帳帳號[：:]\s*(\S+)/);
        if (an) accountNo = an[1];
      }

      // Extract summary: 筆數, 請款金額, 調整, 手續費, 服務費, 費用, 撥款淨額
      let totalCount = 0, totalAmount = 0, adjustment = 0, totalFee = 0, serviceFee = 0, otherFee = 0, netAmount = 0;
      const summaryMatch = text.match(/總計\s+(\d+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
      if (summaryMatch) {
        totalCount = parseInt(summaryMatch[1]);
        totalAmount = parseFloat(summaryMatch[2].replace(/,/g, ''));
        adjustment = parseFloat(summaryMatch[3].replace(/,/g, ''));
        totalFee = parseFloat(summaryMatch[4].replace(/,/g, ''));
        serviceFee = parseFloat(summaryMatch[5].replace(/,/g, ''));
        otherFee = parseFloat(summaryMatch[6].replace(/,/g, ''));
        netAmount = parseFloat(summaryMatch[7].replace(/,/g, ''));
      }

      // Extract batch lines
      const batchLines = [];
      const batchRegex = /(\d{4}\/\d{2}\/\d{2})\s+(\d{4}\/\d{2}\/\d{2})\s+(\d+)\s+(\d+)\s+(VISA|MASTER|JCB|CUP)\s+(\d+)\s+([\d,]+)/g;
      let m;
      while ((m = batchRegex.exec(text)) !== null) {
        batchLines.push({
          billingDate: m[1],
          settlementDate: m[2],
          terminalId: m[3],
          batchNo: m[4],
          cardType: m[5],
          count: parseInt(m[6]),
          amount: parseFloat(m[7].replace(/,/g, '')),
        });
      }

      // Extract fee details
      const feeDetails = [];
      const feeRegex = /(國內|國外|自行)\((VISA|MASTER|JCB|CUP)\)\s+筆數／請款金額／手續費[：:]\s*(\d+)\s*／\s*([\d,]+)\s*／\s*([\d,.]+)/g;
      while ((m = feeRegex.exec(text)) !== null) {
        const cnt = parseInt(m[3]);
        const amt = parseFloat(m[4].replace(/,/g, ''));
        const fee = parseFloat(m[5].replace(/,/g, ''));
        if (cnt > 0 || amt > 0) {
          feeDetails.push({
            origin: m[1],
            cardType: m[2],
            count: cnt,
            amount: amt,
            fee,
            feeRate: amt > 0 ? Math.round(fee / amt * 10000) / 100 : 0,
          });
        }
      }

      if (!merchantId && !totalAmount) return null;

      return {
        bankName: '國泰世華',
        merchantId,
        merchantName,
        billingDate,
        paymentDate,
        accountNo,
        totalCount,
        totalAmount,
        adjustment,
        totalFee,
        serviceFee,
        otherFee,
        netAmount,
        batchLines,
        feeDetails,
      };
    } catch {
      return null;
    }
  }

  // Save parsed PDF to server
  const saveParsedCcStatement = async () => {
    if (!ccParsedData || !ccUploadWarehouse) {
      showMessage('請選擇館別', 'error');
      return;
    }
    const bld = ccBuildings.find(b => b.id === parseInt(ccUploadWarehouse));
    try {
      const res = await fetch('/api/reconciliation/credit-card-statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ccParsedData,
          warehouseId: parseInt(ccUploadWarehouse),
          warehouse: bld?.name || '',
        }),
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('對帳單已匯入');
        setCcParsedData(null);
        setCcShowUpload(false);
        fetchCcData();
      }
    } catch {
      showMessage('匯入失敗', 'error');
    }
  };

  // CC: match PMS
  const matchCcPms = async (id) => {
    try {
      const res = await fetch('/api/reconciliation/credit-card-statements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'match_pms' }),
      });
      const data = await res.json();
      if (data.error) showMessage(data.error, 'error');
      else {
        showMessage(`PMS 比對完成，差異 ${formatMoney(data.difference)}`);
        fetchCcData();
      }
    } catch { showMessage('比對失敗', 'error'); }
  };

  // CC: confirm / unconfirm
  const toggleCcConfirm = async (id, currentStatus) => {
    const action = currentStatus === 'confirmed' ? 'unconfirm' : 'confirm';
    try {
      await fetch('/api/reconciliation/credit-card-statements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      fetchCcData();
    } catch { showMessage('操作失敗', 'error'); }
  };

  // CC: delete
  const deleteCcStatement = async (id) => {
    if (!confirm('確定刪除此對帳單？')) return;
    try {
      await fetch(`/api/reconciliation/credit-card-statements?id=${id}`, { method: 'DELETE' });
      fetchCcData();
      showMessage('已刪除');
    } catch { showMessage('刪除失敗', 'error'); }
  };

  // CC: save merchant config
  const saveCcConfig = async () => {
    if (!ccConfigForm.warehouseId || !ccConfigForm.merchantId) {
      showMessage('館別和特店代號為必填', 'error');
      return;
    }
    setCcConfigSaving(true);
    try {
      const res = await fetch('/api/reconciliation/credit-card-merchant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ccConfigForm),
      });
      if (res.ok) {
        showMessage('特約商店設定已儲存');
        setCcShowConfigModal(false);
        fetchCcData();
      } else {
        const d = await res.json();
        showMessage(d.error || '儲存失敗', 'error');
      }
    } catch { showMessage('儲存失敗', 'error'); }
    finally { setCcConfigSaving(false); }
  };

  // CC Status map
  const CC_STATUS_MAP = {
    pending: { label: '待對帳', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    matched: { label: '已對帳', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    confirmed: { label: '已確認', color: 'bg-green-100 text-green-700 border-green-300' },
    no_data: { label: '無資料', color: 'bg-gray-100 text-gray-500 border-gray-300' },
    partial: { label: '部分完成', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  };

  // ---- Render credit card tab ----
  const renderCreditCardTab = () => {
    const summaryRows = ccSummary?.summary || [];
    const grandTotal = ccSummary?.grandTotal || {};

    return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">月份</label>
            <input type="month" value={ccMonth} onChange={e => setCcMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">館別</label>
            <select value={ccWarehouseFilter} onChange={e => setCcWarehouseFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">全部</option>
              {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">狀態</label>
            <select value={ccStatusFilter} onChange={e => setCcStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="all">全部</option>
              <option value="pending">待對帳</option>
              <option value="matched">已對帳</option>
              <option value="confirmed">已確認</option>
            </select>
          </div>
          <div className="flex items-end gap-2 ml-auto">
            <button onClick={() => setCcShowConfigModal(true)}
              className="px-4 py-1.5 border border-violet-300 text-violet-700 text-sm rounded-lg hover:bg-violet-50">
              特約商店設定
            </button>
            <button onClick={() => { setCcShowUpload(true); setCcParsedData(null); }}
              className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              上傳 PDF 對帳單
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      {summaryRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b">
            <h4 className="text-sm font-semibold text-violet-800">
              {ccMonth.replace('-', ' 年 ')} 月 各館信用卡對帳匯總
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">PMS金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">差異</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaryRows.map(row => {
                  const si = CC_STATUS_MAP[row.status] || CC_STATUS_MAP.no_data;
                  return (
                    <tr key={row.warehouseId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.warehouse}</td>
                      <td className="px-3 py-2 text-center">{row.totalCount}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(row.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(row.netAmount)}</td>
                      <td className="px-3 py-2 text-right">{row.pmsAmount ? formatMoney(row.pmsAmount) : '-'}</td>
                      <td className={`px-3 py-2 text-right font-medium ${row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-red-600' : ''}`}>
                        {row.stmtCount > 0 ? (row.difference > 0 ? '+' : '') + formatMoney(row.difference) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50 font-semibold text-sm">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-center">{grandTotal.totalCount || 0}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.totalAmount)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{formatMoney(grandTotal.totalFee)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.netAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.pmsAmount)}</td>
                  <td className={`px-3 py-2 text-right ${(grandTotal.difference || 0) !== 0 ? 'text-orange-600' : ''}`}>
                    {(grandTotal.difference > 0 ? '+' : '') + formatMoney(grandTotal.difference || 0)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Statements List */}
      {ccLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : ccStatements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
          <p>本月尚無信用卡對帳單</p>
          <p className="text-sm mt-1">點擊「上傳 PDF 對帳單」匯入銀行撥款對帳單</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
            <h4 className="text-sm font-semibold text-violet-800">對帳單明細 ({ccStatements.length} 筆)</h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-8"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">請款日</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">撥款日</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ccStatements.map(stmt => {
                const si = CC_STATUS_MAP[stmt.status] || CC_STATUS_MAP.pending;
                const isExpanded = ccExpandedId === stmt.id;
                return (
                  <React.Fragment key={stmt.id}>
                    <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-violet-50/50' : ''}`}
                      onClick={() => setCcExpandedId(isExpanded ? null : stmt.id)}>
                      <td className="px-3 py-2 text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{stmt.warehouse}</td>
                      <td className="px-3 py-2">{stmt.billingDate}</td>
                      <td className="px-3 py-2 text-gray-500">{stmt.paymentDate || '-'}</td>
                      <td className="px-3 py-2 text-center">{stmt.totalCount}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(stmt.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(stmt.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium text-violet-700">{formatMoney(stmt.netAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => matchCcPms(stmt.id)} title="比對PMS"
                            className="text-blue-600 hover:text-blue-800 text-xs px-1.5 py-0.5 border border-blue-200 rounded hover:bg-blue-50">
                            比對
                          </button>
                          {stmt.status !== 'confirmed' ? (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="確認"
                              className="text-green-600 hover:text-green-800 text-xs px-1.5 py-0.5 border border-green-200 rounded hover:bg-green-50">
                              確認
                            </button>
                          ) : (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="取消確認"
                              className="text-orange-600 hover:text-orange-800 text-xs px-1.5 py-0.5 border border-orange-200 rounded hover:bg-orange-50">
                              取消
                            </button>
                          )}
                          {stmt.status !== 'confirmed' && (
                            <button onClick={() => deleteCcStatement(stmt.id)} title="刪除"
                              className="text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 border border-red-200 rounded hover:bg-red-50">
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-4 py-4 bg-violet-50/30">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Left: Batch Lines */}
                            <div className="bg-white rounded-lg border p-4">
                              <h5 className="text-sm font-semibold text-gray-700 mb-2">批次明細</h5>
                              {stmt.batchLines?.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-2 py-1 text-left">終端機</th>
                                      <th className="px-2 py-1 text-left">批次</th>
                                      <th className="px-2 py-1 text-left">卡別</th>
                                      <th className="px-2 py-1 text-center">筆數</th>
                                      <th className="px-2 py-1 text-right">金額</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {stmt.batchLines.map((l, i) => (
                                      <tr key={i}>
                                        <td className="px-2 py-1 font-mono">{l.terminalId}</td>
                                        <td className="px-2 py-1 font-mono">{l.batchNo}</td>
                                        <td className="px-2 py-1">
                                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                                            l.cardType === 'VISA' ? 'bg-blue-100 text-blue-700' :
                                            l.cardType === 'MASTER' ? 'bg-red-100 text-red-700' :
                                            l.cardType === 'JCB' ? 'bg-green-100 text-green-700' :
                                            'bg-gray-100 text-gray-700'
                                          }`}>{l.cardType}</span>
                                        </td>
                                        <td className="px-2 py-1 text-center">{l.count}</td>
                                        <td className="px-2 py-1 text-right font-medium">{formatMoney(l.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : <p className="text-xs text-gray-400">無批次明細</p>}
                            </div>

                            {/* Right: Fee Details + PMS */}
                            <div className="space-y-4">
                              <div className="bg-white rounded-lg border p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-2">手續費明細</h5>
                                {stmt.feeDetails?.length > 0 ? (
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-2 py-1 text-left">類型</th>
                                        <th className="px-2 py-1 text-left">卡別</th>
                                        <th className="px-2 py-1 text-center">筆數</th>
                                        <th className="px-2 py-1 text-right">金額</th>
                                        <th className="px-2 py-1 text-right">手續費</th>
                                        <th className="px-2 py-1 text-right">費率</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {stmt.feeDetails.map((d, i) => (
                                        <tr key={i}>
                                          <td className="px-2 py-1">{d.origin}</td>
                                          <td className="px-2 py-1">{d.cardType}</td>
                                          <td className="px-2 py-1 text-center">{d.count}</td>
                                          <td className="px-2 py-1 text-right">{formatMoney(d.amount)}</td>
                                          <td className="px-2 py-1 text-right text-red-600">{formatMoney(d.fee)}</td>
                                          <td className="px-2 py-1 text-right text-gray-500">{d.feeRate ? d.feeRate + '%' : '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : <p className="text-xs text-gray-400">無手續費明細</p>}
                              </div>

                              {/* PMS comparison */}
                              <div className="bg-white rounded-lg border p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-2">PMS 信用卡收入比對</h5>
                                <div className="grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <div className="text-xs text-gray-500">銀行請款金額</div>
                                    <div className="font-bold text-lg">{formatMoney(stmt.totalAmount)}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">PMS 信用卡收入</div>
                                    <div className="font-bold text-lg">{stmt.pmsAmount != null ? formatMoney(stmt.pmsAmount) : '未比對'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">差異</div>
                                    <div className={`font-bold text-lg ${stmt.difference > 0 ? 'text-green-600' : stmt.difference < 0 ? 'text-red-600' : ''}`}>
                                      {stmt.difference != null ? (stmt.difference > 0 ? '+' : '') + formatMoney(stmt.difference) : '-'}
                                    </div>
                                  </div>
                                </div>
                                {stmt.note && <p className="text-xs text-gray-500 mt-2">備註：{stmt.note}</p>}
                              </div>

                              {/* Summary info */}
                              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-sm">
                                <div className="flex justify-between">
                                  <span>特店代號</span><span className="font-mono">{stmt.merchantId || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>入帳帳號</span><span className="font-mono">{stmt.accountNo || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>銀行</span><span>{stmt.bankName || '-'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload PDF Modal */}
      {ccShowUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xl mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">上傳信用卡對帳單 PDF</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                <select value={ccUploadWarehouse} onChange={e => setCcUploadWarehouse(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選擇館別</option>
                  {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">選擇 PDF 檔案</label>
                <input type="file" accept=".pdf,.txt" onChange={handleCcPdfUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">支援國泰世華信用卡特約商店撥款對帳單 PDF</p>
              </div>

              {ccParsedData && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">解析結果</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">特店名稱：</span>{ccParsedData.merchantName}</div>
                    <div><span className="text-gray-500">特店代號：</span>{ccParsedData.merchantId}</div>
                    <div><span className="text-gray-500">請款日：</span>{ccParsedData.billingDate}</div>
                    <div><span className="text-gray-500">撥款日：</span>{ccParsedData.paymentDate}</div>
                    <div><span className="text-gray-500">筆數：</span>{ccParsedData.totalCount}</div>
                    <div><span className="text-gray-500">請款金額：</span>{formatMoney(ccParsedData.totalAmount)}</div>
                    <div><span className="text-gray-500">手續費：</span>{formatMoney(ccParsedData.totalFee)}</div>
                    <div><span className="text-gray-500">撥款淨額：</span><span className="font-bold text-violet-700">{formatMoney(ccParsedData.netAmount)}</span></div>
                  </div>
                  {ccParsedData.batchLines?.length > 0 && (
                    <p className="text-xs text-green-700 mt-2">批次明細 {ccParsedData.batchLines.length} 筆 / 手續費明細 {ccParsedData.feeDetails?.length || 0} 筆</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setCcShowUpload(false); setCcParsedData(null); }}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={saveParsedCcStatement} disabled={!ccParsedData || !ccUploadWarehouse}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
                匯入對帳單
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merchant Config Modal */}
      {ccShowConfigModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">信用卡特約商店設定</h3>

            {/* Existing configs */}
            {ccMerchantConfigs.length > 0 && (
              <div className="mb-4 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs">館別</th>
                      <th className="px-3 py-1.5 text-left text-xs">銀行</th>
                      <th className="px-3 py-1.5 text-left text-xs">特店代號</th>
                      <th className="px-3 py-1.5 text-right text-xs">國內%</th>
                      <th className="px-3 py-1.5 text-right text-xs">國外%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ccMerchantConfigs.map(c => (
                      <tr key={c.id}>
                        <td className="px-3 py-1.5">{c.warehouse?.name}</td>
                        <td className="px-3 py-1.5">{c.bankName}</td>
                        <td className="px-3 py-1.5 font-mono">{c.merchantId}</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.domesticFeeRate)}%</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.foreignFeeRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別 *</label>
                  <select value={ccConfigForm.warehouseId} onChange={e => setCcConfigForm({...ccConfigForm, warehouseId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">選擇</option>
                    {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
                  <input type="text" value={ccConfigForm.bankName} onChange={e => setCcConfigForm({...ccConfigForm, bankName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">特店代號 *</label>
                  <input type="text" value={ccConfigForm.merchantId} onChange={e => setCcConfigForm({...ccConfigForm, merchantId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="例: 310800073" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">特店名稱</label>
                  <input type="text" value={ccConfigForm.merchantName} onChange={e => setCcConfigForm({...ccConfigForm, merchantName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入帳帳號</label>
                <input type="text" value={ccConfigForm.accountNo} onChange={e => setCcConfigForm({...ccConfigForm, accountNo: e.target.value})}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">國內手續費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.domesticFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, domesticFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">國外手續費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.foreignFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, foreignFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">自行卡費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.selfFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, selfFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setCcShowConfigModal(false)}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50" disabled={ccConfigSaving}>關閉</button>
              <button onClick={saveCcConfig}
                disabled={ccConfigSaving}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">{ccConfigSaving ? '儲存中…' : '儲存設定'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  // Dashboard filtered items
  const filteredDashItems = (dashboardData?.items || []).filter(item => {
    if (dashFilter !== 'all' && item.status !== dashFilter) return false;
    if (dashSearch && !item.accountName.includes(dashSearch) && !(item.warehouse || '').includes(dashSearch)) return false;
    return true;
  });

  // Matched / unmatched helpers
  const matchedBankIds = new Set(bankLines.filter(l => l.matchStatus === 'matched').map(l => l.id));
  const matchedTxIds = new Set(bankLines.filter(l => l.matchedTransactionId).map(l => l.matchedTransactionId));
  const unmatchedBankLines = bankLines.filter(l => l.matchStatus !== 'matched');
  const unmatchedSystemTxs = systemTxs.filter(t => !matchedTxIds.has(t.id));

  const summary = reconciliation ? {
    matched: bankLines.filter(l => l.matchStatus === 'matched').length,
    bankOnly: unmatchedBankLines.length,
    systemOnly: unmatchedSystemTxs.length,
    difference: reconciliation.difference || 0
  } : { matched: 0, bankOnly: 0, systemOnly: 0, difference: 0 };

  return (
    <div className="min-h-screen page-bg-reconciliation">
      <Navigation borderColor="border-violet-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">存簿對帳</h2>
            <p className="text-sm text-gray-500 mt-1">銀行對帳單比對與核實</p>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ======== TAB: Dashboard ======== */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Year/Month + Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">年份</label>
                  <select
                    value={dashYear}
                    onChange={e => setDashYear(parseInt(e.target.value))}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">月份</label>
                  <select
                    value={dashMonth}
                    onChange={e => setDashMonth(parseInt(e.target.value))}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">狀態</label>
                  <select
                    value={dashFilter}
                    onChange={e => setDashFilter(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="all">全部</option>
                    <option value="not_started">未開始</option>
                    <option value="draft">進行中</option>
                    <option value="confirmed">已確認</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="搜尋帳戶名稱..."
                  value={dashSearch}
                  onChange={e => setDashSearch(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
                />
              </div>
            </div>

            {/* Progress Bar */}
            {dashboardData?.summary && (
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {dashYear} 年 {dashMonth} 月 對帳進度
                  </h3>
                  <span className="text-sm text-violet-600 font-medium">
                    {dashboardData.summary.completedCount} / {dashboardData.summary.totalAccounts} 完成
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-violet-500 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: dashboardData.summary.totalAccounts > 0
                        ? `${(dashboardData.summary.completedCount / dashboardData.summary.totalAccounts * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="flex gap-6 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    已確認: {dashboardData.summary.completedCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
                    進行中: {dashboardData.summary.inProgressCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    未開始: {dashboardData.summary.notStartedCount}
                  </span>
                  {dashboardData.summary.hasDifferenceCount > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                      有差異: {dashboardData.summary.hasDifferenceCount}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Account Cards Grid */}
            {dashLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : filteredDashItems.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
                <p className="text-gray-400">尚無銀行帳戶或無符合篩選條件的資料</p>
                <p className="text-gray-300 text-sm mt-1">請先至現金流模組新增銀行存款帳戶</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDashItems.map(item => {
                  const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.not_started;
                  const hasDiff = item.status === 'confirmed' && item.difference !== 0;
                  const cardBorder = hasDiff ? 'border-orange-400 border-2' : 'border';

                  return (
                    <div
                      key={item.accountId}
                      className={`bg-white rounded-xl shadow-sm ${cardBorder} p-4 cursor-pointer hover:shadow-md transition-shadow`}
                      onClick={() => navigateToAccount(item.accountId)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-800">{item.accountName}</h4>
                          {item.warehouse && (
                            <span className="text-xs text-gray-400">{item.warehouse}</span>
                          )}
                          {item.accountCode && (
                            <span className="text-xs text-gray-400 ml-2">{item.accountCode}</span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        <div className="flex justify-between">
                          <span>目前餘額</span>
                          <span className="font-medium text-gray-700">${formatMoney(item.currentBalance)}</span>
                        </div>
                        {item.status !== 'not_started' && item.difference !== 0 && (
                          <div className="flex justify-between mt-1">
                            <span>差異金額</span>
                            <span className={`font-medium ${item.difference !== 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              ${formatMoney(item.difference)}
                            </span>
                          </div>
                        )}
                      </div>
                      {hasDiff && (
                        <div className="mt-2 text-xs text-orange-500 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          存在差異，需複查
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======== TAB: Account Reconciliation ======== */}
        {activeTab === 'account' && (
          <div>
            {/* Selectors */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">帳戶</label>
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm min-w-[200px]"
                  >
                    <option value="">-- 選擇帳戶 --</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">年份</label>
                  <select value={acctYear} onChange={e => setAcctYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">月份</label>
                  <select value={acctMonth} onChange={e => setAcctMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
                  </select>
                </div>
                {selectedAccountId && reconciliation && (
                  <>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="ml-auto px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      匯入 CSV
                    </button>
                    <button
                      onClick={() => setShowAdjustModal(true)}
                      className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      補建交易
                    </button>
                  </>
                )}
              </div>
            </div>

            {!selectedAccountId ? (
              <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <p className="text-gray-400">請選擇帳戶以開始對帳</p>
              </div>
            ) : acctLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : reconciliation ? (
              <>
                {/* Reconciliation Info Bar */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">對帳編號：</span>
                      <span className="font-medium">{reconciliation.reconciliationNo}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">狀態：</span>
                      <span className={`font-medium ${reconciliation.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {reconciliation.status === 'confirmed' ? '已確認' : '草稿'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">期初餘額：</span>
                      <span className="font-medium">${formatMoney(reconciliation.openingBalance)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">系統期末餘額：</span>
                      <span className="font-medium">${formatMoney(reconciliation.closingBalanceSystem)}</span>
                    </div>
                    {reconciliation.adjustmentCount > 0 && (
                      <div>
                        <span className="text-gray-500">調整筆數：</span>
                        <span className="font-medium text-amber-600">{reconciliation.adjustmentCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank Balance Input */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">銀行存簿期末餘額</label>
                      <input
                        type="number"
                        value={bankBalanceInput}
                        onChange={e => setBankBalanceInput(e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm w-48"
                        placeholder="輸入銀行存簿金額"
                        disabled={reconciliation.status === 'confirmed'}
                      />
                    </div>
                    <button
                      onClick={updateBankBalance}
                      className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      更新餘額
                    </button>
                    <div className="ml-auto flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">差異金額</div>
                        <div className={`text-lg font-bold ${
                          reconciliation.difference === 0 ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          ${formatMoney(reconciliation.difference)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Three-column Match Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 mb-4">
                  {/* Left: Bank Statement Lines */}
                  <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-violet-800">銀行對帳單明細</h3>
                      <span className="text-xs text-violet-600">{bankLines.length} 筆</span>
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                      {bankLines.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          尚無銀行明細，請匯入 CSV
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-2 text-left">日期</th>
                              <th className="px-2 py-2 text-left">說明</th>
                              <th className="px-2 py-2 text-right">提款</th>
                              <th className="px-2 py-2 text-right">存入</th>
                              <th className="px-2 py-2 text-center">狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bankLines.map(line => {
                              const isMatched = line.matchStatus === 'matched';
                              const isSelected = selectedBankLine === line.id;
                              return (
                                <tr
                                  key={line.id}
                                  className={`border-b cursor-pointer transition-colors ${
                                    isMatched
                                      ? 'bg-green-50 hover:bg-green-100'
                                      : isSelected
                                        ? 'bg-violet-100'
                                        : 'bg-yellow-50 hover:bg-yellow-100'
                                  }`}
                                  onClick={() => {
                                    if (!isMatched && reconciliation.status !== 'confirmed') {
                                      setSelectedBankLine(isSelected ? null : line.id);
                                    }
                                  }}
                                >
                                  <td className="px-2 py-1.5">{line.txDate}</td>
                                  <td className="px-2 py-1.5 max-w-[140px] truncate" title={line.description}>
                                    {line.description || '-'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-red-600">
                                    {line.debitAmount > 0 ? formatMoney(line.debitAmount) : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-green-600">
                                    {line.creditAmount > 0 ? formatMoney(line.creditAmount) : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {isMatched ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-green-600">已配對</span>
                                        {reconciliation.status !== 'confirmed' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); unmatchLine(line.id); }}
                                            className="text-red-400 hover:text-red-600 ml-1"
                                            title="取消配對"
                                          >
                                            x
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-yellow-600">未配對</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Center: Match Controls */}
                  <div className="lg:col-span-1 flex flex-col items-center justify-center gap-3 py-4">
                    <button
                      onClick={matchPair}
                      disabled={!selectedBankLine || !selectedSystemTx || reconciliation.status === 'confirmed'}
                      className="p-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="配對選取項目"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>
                    <div className="text-xs text-gray-400 text-center">
                      {selectedBankLine && selectedSystemTx
                        ? '點擊配對'
                        : '選取兩側各一筆'}
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-center text-xs space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-gray-500">{summary.matched}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-gray-500">{summary.bankOnly}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-gray-500">{summary.systemOnly}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: System Transactions */}
                  <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-violet-800">系統交易紀錄</h3>
                      <span className="text-xs text-violet-600">{systemTxs.length} 筆</span>
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                      {systemTxs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          本月尚無系統交易
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-2 text-left">日期</th>
                              <th className="px-2 py-2 text-left">說明</th>
                              <th className="px-2 py-2 text-center">類型</th>
                              <th className="px-2 py-2 text-right">金額</th>
                              <th className="px-2 py-2 text-center">狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemTxs.map(tx => {
                              const isMatched = matchedTxIds.has(tx.id);
                              const isSelected = selectedSystemTx === tx.id;
                              return (
                                <tr
                                  key={tx.id}
                                  className={`border-b cursor-pointer transition-colors ${
                                    isMatched
                                      ? 'bg-green-50 hover:bg-green-100'
                                      : isSelected
                                        ? 'bg-violet-100'
                                        : 'bg-orange-50 hover:bg-orange-100'
                                  }`}
                                  onClick={() => {
                                    if (!isMatched && reconciliation.status !== 'confirmed') {
                                      setSelectedSystemTx(isSelected ? null : tx.id);
                                    }
                                  }}
                                >
                                  <td className="px-2 py-1.5">{tx.transactionDate}</td>
                                  <td className="px-2 py-1.5 max-w-[140px] truncate" title={tx.description}>
                                    {tx.description || tx.category?.name || '-'}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      tx.type === '收入' ? 'bg-green-100 text-green-700'
                                        : tx.type === '支出' ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className={`px-2 py-1.5 text-right font-medium ${
                                    tx.type === '收入' || tx.type === '移轉入' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatMoney(tx.amount)}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {isMatched ? (
                                      <span className="text-green-600">已配對</span>
                                    ) : (
                                      <span className="text-orange-600">未配對</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary Bar */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex gap-6 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        已配對: <strong>{summary.matched}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        銀行獨有: <strong>{summary.bankOnly}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-500" />
                        系統獨有: <strong>{summary.systemOnly}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        差異金額: <strong className={summary.difference === 0 ? 'text-green-600' : 'text-orange-600'}>
                          ${formatMoney(summary.difference)}
                        </strong>
                      </span>
                    </div>
                    {reconciliation.status !== 'confirmed' && (
                      <div className="flex items-center gap-3">
                        {reconciliation.difference !== 0 && (
                          <input
                            type="text"
                            value={diffExplained}
                            onChange={e => setDiffExplained(e.target.value)}
                            placeholder="差異說明（差異不為零時必填）"
                            className="border rounded-lg px-3 py-1.5 text-sm w-60"
                          />
                        )}
                        <button
                          onClick={confirmReconciliation}
                          className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          確認封存
                        </button>
                      </div>
                    )}
                    {reconciliation.status === 'confirmed' && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        已確認封存
                        {reconciliation.confirmedBy && <span>({reconciliation.confirmedBy})</span>}
                        {reconciliation.confirmedAt && (
                          <span className="text-gray-400 text-xs">
                            {new Date(reconciliation.confirmedAt).toLocaleDateString('zh-TW')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ======== TAB: Formats ======== */}
        {activeTab === 'formats' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">銀行格式管理</h3>
              {isLoggedIn && (
                <button
                  onClick={() => setShowFormatForm(!showFormatForm)}
                  className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
                >
                  {showFormatForm ? '取消' : '+ 新增自訂格式'}
                </button>
              )}
            </div>

            {/* Add format form */}
            {showFormatForm && (
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">新增自訂銀行格式</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
                    <input
                      type="text"
                      value={formatForm.bankName}
                      onChange={e => setFormatForm({ ...formatForm, bankName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 華南銀行"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">銀行代碼</label>
                    <input
                      type="text"
                      value={formatForm.bankCode}
                      onChange={e => setFormatForm({ ...formatForm, bankCode: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 008"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">檔案編碼</label>
                    <select
                      value={formatForm.fileEncoding}
                      onChange={e => setFormatForm({ ...formatForm, fileEncoding: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="UTF-8">UTF-8</option>
                      <option value="Big5">Big5</option>
                      <option value="MS950">MS950</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">日期欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.dateColumn}
                      onChange={e => setFormatForm({ ...formatForm, dateColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 交易日期"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">日期格式</label>
                    <select
                      value={formatForm.dateFormat}
                      onChange={e => setFormatForm({ ...formatForm, dateFormat: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYMMDD">民國 YYYMMDD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">說明欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.descriptionColumn}
                      onChange={e => setFormatForm({ ...formatForm, descriptionColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 摘要"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">提款欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.debitColumn}
                      onChange={e => setFormatForm({ ...formatForm, debitColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 提款金額"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">存入欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.creditColumn}
                      onChange={e => setFormatForm({ ...formatForm, creditColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 存入金額"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">餘額欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.balanceColumn}
                      onChange={e => setFormatForm({ ...formatForm, balanceColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 餘額"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={submitFormat}
                    disabled={formatSaving}
                    className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {formatSaving ? '儲存中…' : '儲存格式'}
                  </button>
                </div>
              </div>
            )}

            {/* Formats list */}
            {formatsLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-violet-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">銀行名稱</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">銀行代碼</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">檔案格式</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">編碼</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">日期格式</th>
                      <th className="px-4 py-3 text-center font-medium text-violet-800">類型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          尚無銀行格式設定
                        </td>
                      </tr>
                    ) : (
                      formats.map(f => (
                        <tr key={f.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{f.bankName}</td>
                          <td className="px-4 py-3 text-gray-500">{f.bankCode || '-'}</td>
                          <td className="px-4 py-3">{f.fileType?.toUpperCase()}</td>
                          <td className="px-4 py-3">{f.fileEncoding}</td>
                          <td className="px-4 py-3">{f.dateFormat || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            {f.isBuiltIn ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                內建
                              </span>
                            ) : (
                              <span className="text-xs text-violet-600">自訂</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== TAB: Credit Card ======== */}
        {activeTab === 'credit-card' && renderCreditCardTab()}

        {/* ======== MODAL: Import CSV ======== */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowImportModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">匯入銀行對帳單 (CSV)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">銀行格式</label>
                  <select
                    value={selectedFormatId}
                    onChange={e => setSelectedFormatId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">-- 選擇格式 --</option>
                    {formats.map(f => (
                      <option key={f.id} value={f.id}>{f.bankName}{f.isBuiltIn ? ' (內建)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">上傳 CSV 檔案</label>
                  <p className="text-xs text-gray-400 mb-2">
                    {selectedFormatId && ['土地', '世華', '國泰世華', '陽信', '兆豐', '玉山'].some(k => formats.find(f => String(f.id) === String(selectedFormatId))?.bankName?.includes(k)) ? (
                      <>已選銀行格式；兆豐、玉山請上傳 .xls/.xlsx，其餘上傳 CSV（請先選格式再上傳）</>
                    ) : (
                      <>預設格式：日期, 說明, 提款金額, 存入金額, 備註, 餘額；或先選擇銀行格式</>
                    )}
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleFileUpload}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {importLines.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 mb-2">預覽: 共 {importLines.length} 筆</p>
                    <div className="max-h-40 overflow-auto text-xs">
                      <table className="w-full">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">日期</th>
                            <th className="text-left py-1">說明</th>
                            <th className="text-right py-1">提款</th>
                            <th className="text-right py-1">存入</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importLines.slice(0, 10).map((line, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-1">{line.txDate}</td>
                              <td className="py-1 max-w-[120px] truncate">{line.description}</td>
                              <td className="py-1 text-right text-red-600">{line.debitAmount !== '0' ? line.debitAmount : ''}</td>
                              <td className="py-1 text-right text-green-600">{line.creditAmount !== '0' ? line.creditAmount : ''}</td>
                            </tr>
                          ))}
                          {importLines.length > 10 && (
                            <tr><td colSpan={4} className="py-1 text-gray-400">...還有 {importLines.length - 10} 筆</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowImportModal(false); setImportLines([]); setImportFileName(''); }}
                  className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={submitImport}
                  disabled={importLines.length === 0 || !selectedFormatId || importSubmitting}
                  className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {importSubmitting ? '匯入中…' : '確認匯入'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======== MODAL: Adjustment ======== */}
        {showAdjustModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">補建調整交易</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">金額</label>
                  <input
                    type="number"
                    value={adjustForm.amount}
                    onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="正數=收入，負數=支出"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">說明 *</label>
                  <input
                    type="text"
                    value={adjustForm.description}
                    onChange={e => setAdjustForm({ ...adjustForm, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 銀行手續費扣款"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">交易日期</label>
                  <input
                    type="date"
                    value={adjustForm.transactionDate}
                    onChange={e => setAdjustForm({ ...adjustForm, transactionDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={submitAdjustment}
                  disabled={adjustmentSubmitting}
                  className="px-6 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {adjustmentSubmitting ? '建立中…' : '建立調整'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
