'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';

const SECTIONS = [
  { key: 'master-data', label: '基礎主資料', icon: '📋' },
  { key: 'warehouses', label: '倉庫設定', icon: '🏪' },
  { key: 'departments', label: '館別設定', icon: '🏢' },
  { key: 'finance', label: '財務參數', icon: '💰' },
  { key: 'pms-mapping', label: 'PMS 科目對應', icon: '🔗' },
  { key: 'expense-categories', label: '費用分類管理', icon: '📂' },
  { key: 'notifications', label: '通知設定', icon: '🔔' },
  { key: 'notification-channels', label: '通知渠道管理', icon: '📨' },
  { key: 'cash-count', label: '現金盤點設定', icon: '🏦' },

  { key: 'data-import', label: '期初資料匯入', icon: '📥' },
  { key: 'users', label: '使用者管理', icon: '👥' },
  { key: 'master-governance', label: '主檔治理', icon: '🔍', href: '/settings/master-data-governance' },
  { key: 'system-info', label: '系統資訊', icon: '⚙️' },
];

const NOTIFICATION_FIELDS = [
  { key: 'pmsImportAlertDays', label: 'PMS 匯入提醒天數', description: '超過此天數未匯入 PMS 資料時發送警告' },
  { key: 'loanRepaymentAlertDays', label: '借款還款提醒天數', description: '借款到期前幾天開始提醒還款' },
  { key: 'checkDueAlertDays', label: '支票到期提醒天數', description: '支票到期前幾天開始提醒' },
  { key: 'checkDueWarningDays', label: '支票到期警告天數', description: '支票即將到期的緊急警告天數' },
  { key: 'loanExpiryAlertMonths', label: '貸款到期提醒月數', description: '貸款到期前幾個月開始提醒' },
  { key: 'monthEndAlertDayOfMonth', label: '月結提醒日（每月幾號）', description: '每月幾號提醒進行月結作業' },
];

// Default PMS mapping rules (fallback when API has no data)
const DEFAULT_PMS_COLUMNS = [
  { pmsColumnName: '住房收入', entryType: '貸方', accountingCode: '4111', accountingName: '住房收入', isSystemDefault: true },
  { pmsColumnName: '餐飲收入', entryType: '貸方', accountingCode: '4112', accountingName: '餐飲收入', isSystemDefault: true },
  { pmsColumnName: '其他營業收入', entryType: '貸方', accountingCode: '4113', accountingName: '其他營業收入', isSystemDefault: true },
  { pmsColumnName: '服務費收入', entryType: '貸方', accountingCode: '4114', accountingName: '服務費收入', isSystemDefault: true },
  { pmsColumnName: '代收款-稅金', entryType: '貸方', accountingCode: '2171', accountingName: '代收款-稅金', isSystemDefault: true },
  { pmsColumnName: '預收款', entryType: '借方', accountingCode: '2131', accountingName: '預收款', isSystemDefault: true },
  { pmsColumnName: '應收帳款', entryType: '借方', accountingCode: '1131', accountingName: '應收帳款', isSystemDefault: true },
  { pmsColumnName: '現金收入', entryType: '借方', accountingCode: '1111', accountingName: '現金收入', isSystemDefault: true },
  { pmsColumnName: '信用卡收入', entryType: '借方', accountingCode: '1141', accountingName: '信用卡收入', isSystemDefault: true },
  { pmsColumnName: '轉帳收入', entryType: '借方', accountingCode: '1112', accountingName: '銀行轉帳收入', isSystemDefault: true },
];

// ===== Standalone sub-components for sections with local state =====

const EVENT_CODES = [
  { code: 'N01', label: 'PMS 報表未匯入警示' },
  { code: 'N02', label: '貸款本月應還款提醒' },
  { code: 'N03', label: '支票 3 日內到期提醒' },
  { code: 'N04', label: '支票已逾期未兌現' },
  { code: 'N05', label: '租金逾期未收' },
  { code: 'N06', label: '合約即將到期' },
  { code: 'N07', label: '貸款 6 個月內到期' },
  { code: 'N08', label: '費用傳票待確認' },
  { code: 'N09', label: '庫存偏低警示' },
  { code: 'N10', label: '對帳差異警示' },
  { code: 'N11', label: '代墊款逾期提醒' },
  { code: 'N12', label: '信用卡繳款到期' },
  { code: 'N13', label: '現金盤點逾期提醒' },
];

function NotificationChannelsSection({ showToast }) {
  const [channels, setChannels] = useState([]);
  const [channelConfig, setChannelConfig] = useState(null);
  const [chLoading, setChLoading] = useState(true);
  const [lineBindingUrl, setLineBindingUrl] = useState('');
  const [testingChannel, setTestingChannel] = useState(null);

  useEffect(() => {
    fetchChannels();
    fetchChannelConfig();
  }, []);

  async function fetchChannels() {
    setChLoading(true);
    try {
      const res = await fetch('/api/notification-channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch { /* ignore */ }
    setChLoading(false);
  }

  async function fetchChannelConfig() {
    try {
      const res = await fetch('/api/notification-channels/config');
      if (res.ok) {
        const data = await res.json();
        setChannelConfig(data);
      }
    } catch { /* ignore */ }
  }

  async function toggleChannel(eventCode, channel, enabled) {
    try {
      const payload = { notificationCode: eventCode };
      if (channel === 'email') payload.enableEmail = enabled;
      if (channel === 'line') payload.enableLine = enabled;

      const res = await fetch('/api/notification-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await fetchChannels();
        showToast('通知渠道已更新');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
  }

  async function generateLineBinding() {
    try {
      const res = await fetch('/api/notification-channels/line-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setLineBindingUrl(data.bindingUrl || '');
        showToast('LINE 綁定連結已產生（15分鐘有效）');
      }
    } catch {
      showToast('產生綁定連結失敗', 'error');
    }
  }

  async function testChannel(channel) {
    setTestingChannel(channel);
    try {
      const res = await fetch('/api/notification-channels/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      if (res.ok) {
        showToast(`${channel} 測試通知已發送`);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '測試失敗', 'error');
      }
    } catch {
      showToast('測試失敗', 'error');
    }
    setTestingChannel(null);
  }

  if (chLoading) return <div className="text-center py-8 text-gray-500">載入通知渠道設定中...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">通知渠道狀態</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">站內通知</div>
            <div className="text-green-600 font-medium mt-1">已啟用</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">Email</div>
            <div className={`font-medium mt-1 ${channelConfig?.smtpHost ? 'text-green-600' : 'text-gray-400'}`}>
              {channelConfig?.smtpHost ? '已設定' : '未設定'}
            </div>
            <button onClick={() => testChannel('email')} disabled={testingChannel === 'email'} className="mt-2 text-xs text-blue-600 hover:underline">
              {testingChannel === 'email' ? '發送中...' : '發送測試'}
            </button>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border">
            <div className="text-sm font-medium text-gray-600">LINE</div>
            <div className={`font-medium mt-1 ${channelConfig?.lineBotAccessToken ? 'text-green-600' : 'text-gray-400'}`}>
              {channelConfig?.lineBotAccessToken ? '已設定' : '未設定'}
            </div>
            <button onClick={generateLineBinding} className="mt-2 text-xs text-blue-600 hover:underline">產生綁定連結</button>
            {lineBindingUrl && <div className="mt-2 text-xs text-gray-500 break-all">{lineBindingUrl}</div>}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">事件通知偏好</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">事件</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">站內</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">LINE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {EVENT_CODES.map(ev => {
              const ch = channels.find(c => c.notificationCode === ev.code) || {};
              return (
                <tr key={ev.code} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{ev.code} - {ev.label}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={true} disabled className="rounded opacity-60 cursor-not-allowed" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!ch.enableEmail} onChange={e => toggleChannel(ev.code, 'email', e.target.checked)} className="rounded" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={!!ch.enableLine} onChange={e => toggleChannel(ev.code, 'line', e.target.checked)} className="rounded" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashCountConfigSection({ showToast }) {
  const [ccAccounts, setCcAccounts] = useState([]);
  const [ccConfigs, setCcConfigs] = useState([]);
  const [ccLoading, setCcLoading] = useState(true);

  useEffect(() => {
    fetchCcData();
  }, []);

  async function fetchCcData() {
    setCcLoading(true);
    try {
      const [accRes, confRes] = await Promise.all([
        fetch('/api/cashflow/accounts'),
        fetch('/api/cash-count/config'),
      ]);
      if (accRes.ok) {
        const data = await accRes.json();
        const accountList = data.data || data || [];
        setCcAccounts(accountList.filter(acc => acc.type === '現金'));
      }
      if (confRes.ok) {
        const data = await confRes.json();
        setCcConfigs(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* ignore */ }
    setCcLoading(false);
  }

  async function saveConfig(accountId, field, value) {
    try {
      const res = await fetch('/api/cash-count/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, [field]: value }),
      });
      if (res.ok) {
        await fetchCcData();
        showToast('盤點設定已更新');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '更新失敗', 'error');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
  }

  if (ccLoading) return <div className="text-center py-8 text-gray-500">載入盤點設定中...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">盤點頻率與容差設定</h3>
        <p className="text-sm text-gray-500 mb-4">設定各現金帳戶的盤點頻率與允許差異金額</p>
        {ccAccounts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">尚無現金帳戶，請先至現金流管理建立帳戶</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">帳戶</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">館別</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">盤點頻率</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">容差金額</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">需雙人覆核</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ccAccounts.map(acc => {
                const conf = ccConfigs.find(c => c.accountId === acc.id) || {};
                return (
                  <tr key={acc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{acc.name}</td>
                    <td className="px-4 py-3 text-gray-500">{acc.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={conf.countFrequency || 'daily'} onChange={e => saveConfig(acc.id, 'countFrequency', e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="daily">每日</option>
                        <option value="weekly">每週</option>
                        <option value="monthly">每月</option>
                        <option value="on_demand">按需</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input type="number" defaultValue={conf.shortageThreshold || 5000} onBlur={e => saveConfig(acc.id, 'shortageThreshold', Number(e.target.value))} className="w-24 px-2 py-1 border rounded text-xs text-center" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" checked={conf.requireDualReview !== false} onChange={e => saveConfig(acc.id, 'requireDualReview', e.target.checked)} className="rounded" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">提示：盤點作業入口在「現金流管理 → 現金盤點」頁籤中執行</p>
      </div>
    </div>
  );
}

function DataImportSection({ showToast }) {
  const [importFile, setImportFile] = useState(null);
  const [importType, setImportType] = useState('products');
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);

  async function handleDryRun() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    setImporting(true);
    setDryRunResult(null);
    setImportResult(null);
    try {
      const text = await importFile.text();
      let data;
      try { data = JSON.parse(text); } catch { showToast('檔案格式錯誤，請使用 JSON 格式', 'error'); setImporting(false); return; }
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, data: Array.isArray(data) ? data : [data], dryRun: true }),
      });
      const result = await res.json();
      if (res.ok) {
        setDryRunResult(result);
        showToast(`驗證完成：${result.validCount || 0} 筆有效，${result.errorCount || 0} 筆錯誤`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '驗證失敗', 'error');
      }
    } catch { showToast('驗證失敗', 'error'); }
    setImporting(false);
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, data: Array.isArray(data) ? data : [data], dryRun: false }),
      });
      const result = await res.json();
      if (res.ok) {
        setImportResult(result);
        setDryRunResult(null);
        showToast(`匯入完成：${result.importedCount || 0} 筆成功`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '匯入失敗', 'error');
      }
    } catch { showToast('匯入失敗', 'error'); }
    setImporting(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">期初資料匯入</h3>
        <p className="text-sm text-gray-500 mb-4">使用 JSON 檔案匯入產品、廠商或會計科目等主資料</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">匯入類型</label>
            <select value={importType} onChange={e => { setImportType(e.target.value); setDryRunResult(null); setImportResult(null); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48">
              <option value="products">產品資料</option>
              <option value="suppliers">廠商資料</option>
              <option value="accounting_subjects">會計科目</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">選擇 JSON 檔案</label>
            <input type="file" accept=".json" onChange={e => { setImportFile(e.target.files[0]); setDryRunResult(null); setImportResult(null); }} className="text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={handleDryRun} disabled={importing || !importFile} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm">
              {importing ? '驗證中...' : '驗證（預覽）'}
            </button>
            {dryRunResult && dryRunResult.errorCount === 0 && (
              <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                {importing ? '匯入中...' : '確認匯入'}
              </button>
            )}
          </div>
        </div>
        {dryRunResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">驗證結果</h4>
            <p className="text-sm">有效：{dryRunResult.validCount || 0} 筆</p>
            <p className="text-sm">錯誤：{dryRunResult.errorCount || 0} 筆</p>
            {dryRunResult.errors?.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                {dryRunResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">第 {err.row || i + 1} 筆: {err.message}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {importResult && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="text-sm font-semibold text-green-800 mb-1">匯入完成</h4>
            <p className="text-sm text-green-700">成功匯入 {importResult.importedCount || 0} 筆資料</p>
          </div>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">注意事項</p>
            <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
              <li>• 請先使用「驗證（預覽）」確認資料無誤後再匯入</li>
              <li>• 匯入會偵測重複資料並自動跳過</li>
              <li>• 建議在正式匯入前先進行備份</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('master-data');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Finance state
  const [taxRate, setTaxRate] = useState('5');
  const [invoiceTitles, setInvoiceTitles] = useState([]);
  const [newInvoiceTitle, setNewInvoiceTitle] = useState('');
  const [newInvoiceTaxId, setNewInvoiceTaxId] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  // Warehouse settings state
  const [warehouseData, setWarehouseData] = useState({});
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState('');
  const [selectedBuildingForStorage, setSelectedBuildingForStorage] = useState('');
  const [newDeptWarehouse, setNewDeptWarehouse] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newBuilding, setNewBuilding] = useState('');

  // Expense categories state
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', sortOrder: '' });
  const [editingCategoryId, setEditingCategoryId] = useState(null);

  // Notification state
  const [notificationSettings, setNotificationSettings] = useState({
    pmsImportAlertDays: '3',
    loanRepaymentAlertDays: '7',
    checkDueAlertDays: '7',
    checkDueWarningDays: '3',
    loanExpiryAlertMonths: '3',
    monthEndAlertDayOfMonth: '25',
  });

  // System info state
  const [systemInfo, setSystemInfo] = useState({
    version: '',
    dbStatus: '',
    dbError: '',
    productCount: 0,
    supplierCount: 0,
    purchaseCount: 0,
    invoiceCount: 0,
    expenseCount: 0,
    userCount: 0,
    cashAccountCount: 0,
    loanCount: 0,
    cashTransactionCount: 0,
    warehouseCount: 0,
    departmentCount: 0,
  });

  // Master data counts state
  const [masterDataCounts, setMasterDataCounts] = useState({
    products: 0,
    suppliers: 0,
    accountingSubjects: 0,
    warehouses: 0,
  });

  // PMS mapping state
  const [mappingRules, setMappingRules] = useState([]);
  const [mappingSubTab, setMappingSubTab] = useState('credit'); // 'credit' = 貸方, 'debit' = 借方
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [mappingEditForm, setMappingEditForm] = useState({ accountingCode: '', accountingName: '', description: '' });
  const [showAddMappingForm, setShowAddMappingForm] = useState(false);
  const [newMappingForm, setNewMappingForm] = useState({
    pmsColumnName: '',
    entryType: '貸方',
    accountingCode: '',
    accountingName: '',
    description: '',
  });
  const [accountingSubjects, setAccountingSubjects] = useState([]);

  // Users state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  // Audit trail state
  const [auditInfo, setAuditInfo] = useState({});

  // Toast helper
  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ---- URL Hash Navigation ----
  useEffect(() => {
    // Read hash on mount
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const matchedSection = SECTIONS.find(s => s.key === hash);
      if (matchedSection) {
        setActiveSection(hash);
      }
    }

    // Listen for hash changes (back/forward browser nav)
    function onHashChange() {
      const newHash = window.location.hash.replace('#', '');
      if (newHash) {
        const matchedSection = SECTIONS.find(s => s.key === newHash);
        if (matchedSection) {
          setActiveSection(newHash);
        }
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Update URL hash when activeSection changes
  function handleSectionChange(key) {
    setActiveSection(key);
    window.location.hash = key;
  }

  // ---- Data Fetching ----
  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    await Promise.all([
      fetchSettings(),
      fetchInvoiceTitles(),
      fetchPaymentMethods(),
      fetchExpenseCategories(),
      fetchSystemInfo(),
      fetchMasterDataCounts(),
    ]);
    setLoading(false);
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          if (data.taxRate !== undefined) setTaxRate(String(data.taxRate));
          // Load notification settings
          const notifKeys = NOTIFICATION_FIELDS.map(f => f.key);
          const notif = {};
          notifKeys.forEach(k => {
            if (data[k] !== undefined) notif[k] = String(data[k]);
          });
          if (Object.keys(notif).length > 0) {
            setNotificationSettings(prev => ({ ...prev, ...notif }));
          }
        }
      }
    } catch (err) {
      console.error('取得系統設定失敗:', err);
    }
  }

  async function fetchInvoiceTitles() {
    try {
      const res = await fetch('/api/settings/invoice-titles');
      if (res.ok) {
        const data = await res.json();
        setInvoiceTitles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得發票抬頭失敗:', err);
    }
  }

  async function fetchPaymentMethods() {
    try {
      const res = await fetch('/api/settings/payment-methods');
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得付款方式失敗:', err);
    }
  }

  async function fetchExpenseCategories() {
    try {
      const res = await fetch('/api/settings/expense-categories');
      if (res.ok) {
        const data = await res.json();
        setExpenseCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('取得費用分類失敗:', err);
    }
  }

  async function fetchSystemInfo() {
    try {
      const res = await fetch('/api/settings/system-info');
      if (res.ok) {
        const data = await res.json();
        setSystemInfo(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('取得系統資訊失敗:', err);
    }
  }

  async function fetchMasterDataCounts() {
    try {
      const [productsRes, suppliersRes, accountingRes, warehouseRes] = await Promise.all([
        fetch('/api/products?all=true').catch(() => null),
        fetch('/api/suppliers?all=true').catch(() => null),
        fetch('/api/accounting-subjects').catch(() => null),
        fetch('/api/warehouse-departments').catch(() => null),
      ]);

      const counts = { products: 0, suppliers: 0, accountingSubjects: 0, warehouses: 0 };

      if (productsRes && productsRes.ok) {
        const data = await productsRes.json();
        counts.products = Array.isArray(data) ? data.length : (data.products ? data.products.length : 0);
      }
      if (suppliersRes && suppliersRes.ok) {
        const data = await suppliersRes.json();
        counts.suppliers = Array.isArray(data) ? data.length : (data.suppliers ? data.suppliers.length : 0);
      }
      if (accountingRes && accountingRes.ok) {
        const data = await accountingRes.json();
        counts.accountingSubjects = Array.isArray(data) ? data.length : 0;
      }
      if (warehouseRes && warehouseRes.ok) {
        const data = await warehouseRes.json();
        if (data && typeof data === 'object') {
          counts.warehouses = data.list ? data.list.length : (data.byName ? Object.keys(data.byName).length : Object.keys(data).length);
        }
      }

      setMasterDataCounts(counts);
    } catch (err) {
      console.error('取得主資料統計失敗:', err);
    }
  }

  // ---- PMS Mapping Fetching ----
  const fetchMappingRules = useCallback(async () => {
    try {
      const res = await fetch('/api/pms-income/mapping-rules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMappingRules(data);
        } else {
          // Fallback to defaults
          setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
        }
      } else {
        setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
      }
    } catch {
      setMappingRules(DEFAULT_PMS_COLUMNS.map((col, i) => ({ id: -(i + 1), ...col, sortOrder: i })));
    }
  }, []);

  const fetchAccountingSubjects = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting-subjects');
      if (res.ok) {
        const data = await res.json();
        setAccountingSubjects(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'pms-mapping') {
      fetchMappingRules();
      fetchAccountingSubjects();
    }
  }, [activeSection, fetchMappingRules, fetchAccountingSubjects]);

  // ---- Users Fetching ----
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } else if (res.status === 403) {
        setUsersError('權限不足，僅管理員可檢視使用者列表');
      } else {
        setUsersError('取得使用者列表失敗');
      }
    } catch {
      setUsersError('取得使用者列表失敗');
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'users') {
      fetchUsers();
    }
  }, [activeSection, fetchUsers]);

  // ---- Save Handlers ----
  async function saveTaxRate() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'taxRate', value: taxRate }),
      });
      if (res.ok) {
        showToast('稅率已儲存');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '儲存稅率失敗', 'error');
      }
    } catch (err) {
      showToast('儲存稅率失敗', 'error');
    }
    setSaving(false);
  }

  async function addInvoiceTitle() {
    if (!newInvoiceTitle.trim()) return;
    try {
      const res = await fetch('/api/settings/invoice-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newInvoiceTitle.trim(), taxId: newInvoiceTaxId.trim() || null }),
      });
      if (res.ok) {
        setNewInvoiceTitle('');
        setNewInvoiceTaxId('');
        await fetchInvoiceTitles();
        showToast('發票抬頭已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增發票抬頭失敗', 'error');
      }
    } catch (err) {
      showToast('新增發票抬頭失敗', 'error');
    }
  }

  async function deleteInvoiceTitle(id) {
    if (!confirm('確定要刪除此發票抬頭？')) return;
    try {
      const res = await fetch(`/api/settings/invoice-titles?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchInvoiceTitles();
        showToast('發票抬頭已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  async function addPaymentMethod() {
    if (!newPaymentMethod.trim()) return;
    try {
      const res = await fetch('/api/settings/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPaymentMethod.trim() }),
      });
      if (res.ok) {
        setNewPaymentMethod('');
        await fetchPaymentMethods();
        showToast('付款方式已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增付款方式失敗', 'error');
      }
    } catch (err) {
      showToast('新增付款方式失敗', 'error');
    }
  }

  async function deletePaymentMethod(id) {
    if (!confirm('確定要刪除此付款方式？')) return;
    try {
      const res = await fetch(`/api/settings/payment-methods?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchPaymentMethods();
        showToast('付款方式已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  // ---- Expense Category Handlers ----
  async function saveExpenseCategory() {
    if (!categoryForm.name.trim()) {
      showToast('請輸入分類名稱', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim(),
        sortOrder: categoryForm.sortOrder ? parseInt(categoryForm.sortOrder, 10) : 0,
      };

      let res;
      if (editingCategoryId) {
        res = await fetch(`/api/settings/expense-categories?id=${editingCategoryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/settings/expense-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setCategoryForm({ name: '', description: '', sortOrder: '' });
        setEditingCategoryId(null);
        await fetchExpenseCategories();
        showToast(editingCategoryId ? '分類已更新' : '分類已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '儲存分類失敗', 'error');
      }
    } catch (err) {
      showToast('儲存分類失敗', 'error');
    }
    setSaving(false);
  }

  function editExpenseCategory(cat) {
    setEditingCategoryId(cat.id);
    setCategoryForm({
      name: cat.name || '',
      description: cat.description || '',
      sortOrder: cat.sortOrder != null ? String(cat.sortOrder) : '',
    });
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setCategoryForm({ name: '', description: '', sortOrder: '' });
  }

  async function deleteExpenseCategory(id) {
    if (!confirm('確定要刪除此費用分類？')) return;
    try {
      const res = await fetch(`/api/settings/expense-categories?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchExpenseCategories();
        showToast('分類已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch (err) {
      showToast('刪除失敗', 'error');
    }
  }

  // ---- Notification Handlers ----
  async function saveNotificationSettings() {
    setSaving(true);
    try {
      const promises = Object.entries(notificationSettings).map(([key, value]) =>
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
      );
      const results = await Promise.all(promises);
      const allOk = results.every(r => r.ok);
      if (allOk) {
        showToast('通知設定已儲存');
      } else {
        const failed = results.find(r => !r.ok);
        const data = failed ? await failed.json().catch(() => ({})) : {};
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '部分設定儲存失敗', 'error');
      }
    } catch (err) {
      showToast('儲存通知設定失敗', 'error');
    }
    setSaving(false);
  }

  // ---- PMS Mapping Handlers ----
  function startEditMapping(rule) {
    setEditingMappingId(rule.id);
    setMappingEditForm({
      accountingCode: rule.accountingCode || '',
      accountingName: rule.accountingName || '',
      description: rule.description || '',
    });
  }

  function cancelEditMapping() {
    setEditingMappingId(null);
    setMappingEditForm({ accountingCode: '', accountingName: '', description: '' });
  }

  async function saveMappingEdit(ruleId) {
    if (!mappingEditForm.accountingCode.trim() || !mappingEditForm.accountingName.trim()) {
      showToast('請填寫科目代碼和名稱', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/pms-income/mapping-rules?id=${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingEditForm),
      });
      if (res.ok) {
        cancelEditMapping();
        await fetchMappingRules();
        showToast('對應規則已更新');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '更新失敗', 'error');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
    setSaving(false);
  }

  async function addMappingRule() {
    if (!newMappingForm.pmsColumnName.trim() || !newMappingForm.accountingCode.trim() || !newMappingForm.accountingName.trim()) {
      showToast('請填寫所有必要欄位', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/pms-income/mapping-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMappingForm,
          entryType: mappingSubTab === 'credit' ? '貸方' : '借方',
        }),
      });
      if (res.ok) {
        setNewMappingForm({ pmsColumnName: '', entryType: '貸方', accountingCode: '', accountingName: '', description: '' });
        setShowAddMappingForm(false);
        await fetchMappingRules();
        showToast('對應規則已新增');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '新增失敗', 'error');
      }
    } catch {
      showToast('新增失敗', 'error');
    }
    setSaving(false);
  }

  async function deleteMappingRule(id) {
    if (!confirm('確定要刪除此對應規則？')) return;
    try {
      const res = await fetch(`/api/pms-income/mapping-rules?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchMappingRules();
        showToast('對應規則已刪除');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '刪除失敗', 'error');
      }
    } catch {
      showToast('刪除失敗', 'error');
    }
  }

  // ---- Audit Trail Helper ----
  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  // ---- Render Sections ----

  // === 0. 倉庫設定 ===
  async function fetchWarehouses() {
    setWarehouseLoading(true);
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.list)) {
          setWarehouseData({ list: data.list, byName: data.byName || {} });
        } else if (typeof data === 'object' && data !== null && !data.list) {
          setWarehouseData({
            list: Object.entries(data).map(([name, depts]) => ({ id: 0, name, type: 'storage', departments: depts || [] })),
            byName: data,
          });
        } else {
          setWarehouseData({ list: [], byName: {} });
        }
      }
    } catch { /* ignore */ }
    setWarehouseLoading(false);
  }

  useEffect(() => {
    if (activeSection === 'warehouses' || activeSection === 'departments') {
      fetchWarehouses();
    }
  }, [activeSection]);

  async function addStorageLocation() {
    if (!selectedBuildingForStorage) { showToast('請先選擇館別', 'error'); return; }
    if (!newWarehouse.trim()) { showToast('請輸入倉庫名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addStorageLocation', buildingId: parseInt(selectedBuildingForStorage), name: newWarehouse.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewWarehouse('');
        showToast(`倉庫「${newWarehouse.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteStorageLocation(id, name) {
    if (!confirm(`確定刪除倉庫「${name}」？`)) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteStorageLocation', id }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`倉庫「${name}」已刪除`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function addBuilding() {
    if (!newBuilding.trim()) { showToast('請輸入館別名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addWarehouse', name: newBuilding.trim(), type: 'building' }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewBuilding('');
        showToast(`館別「${newBuilding.trim()}」已新增`);
      } else if (res.ok) {
        fetchWarehouses();
        setNewBuilding('');
        showToast(`館別「${newBuilding.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function addDepartmentToWarehouse() {
    if (!newDeptWarehouse || !newDeptName.trim()) { showToast('請選擇館別並輸入部門名稱', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addDepartment', warehouse: newDeptWarehouse, name: newDeptName.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        setNewDeptName('');
        showToast(`部門「${newDeptName.trim()}」已新增`);
      } else if (res.ok) {
        fetchWarehouses();
        setNewDeptName('');
        showToast(`部門「${newDeptName.trim()}」已新增`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '新增失敗', 'error');
      }
    } catch { showToast('新增失敗', 'error'); }
    setSaving(false);
  }

  async function deleteWarehouse(name) {
    if (!confirm(`確定刪除「${name}」？`)) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteWarehouse', name }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`已刪除「${name}」`);
      } else if (res.ok) {
        fetchWarehouses();
        showToast(`已刪除「${name}」`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function deleteDepartment(warehouse, deptName) {
    if (!confirm(`確定刪除部門「${deptName}」？`)) return;
    try {
      const res = await fetch('/api/warehouse-departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', warehouse, name: deptName }),
      });
      const result = await res.json();
      if (res.ok && result.list) {
        setWarehouseData({ list: result.list, byName: result.byName || {} });
        showToast(`部門「${deptName}」已刪除`);
      } else if (res.ok) {
        fetchWarehouses();
        showToast(`部門「${deptName}」已刪除`);
      } else {
        showToast((typeof result?.error === 'string' ? result.error : result?.error?.message) || '刪除失敗', 'error');
      }
    } catch { showToast('刪除失敗', 'error'); }
  }

  function renderWarehousesSection() {
    const list = Array.isArray(warehouseData.list) ? warehouseData.list : [];
    const buildings = list.filter(x => x.type === 'building' && !x.parentId);
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">倉庫管理</h3>
          <p className="text-sm text-gray-500 mb-4">倉庫為館別內的實體儲存地點。請先至「館別設定」新增館別，再於此設定各館別的倉庫位置。</p>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select
              value={selectedBuildingForStorage}
              onChange={e => setSelectedBuildingForStorage(e.target.value)}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
            >
              <option value="">選擇館別</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input
              type="text"
              value={newWarehouse}
              onChange={e => setNewWarehouse(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStorageLocation()}
              placeholder="倉庫名稱，例如：地下室、備品室、2F倉庫"
              className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
            <button
              onClick={addStorageLocation}
              disabled={saving || !selectedBuildingForStorage || !newWarehouse.trim()}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
            >
              新增倉庫
            </button>
          </div>
          {warehouseLoading ? (
            <p className="text-sm text-gray-500">載入中...</p>
          ) : buildings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">尚無館別，請先至「館別設定」新增館別（如：麗格）</p>
          ) : (
            <div className="space-y-3">
              {buildings.map(b => {
                const storageLocations = list.filter(x => x.type === 'storage' && x.parentId === b.id);
                return (
                  <div key={b.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span className="font-medium text-gray-800">{b.name}（館別）</span>
                    </div>
                    <div className="px-4 py-3">
                      {storageLocations.length === 0 ? (
                        <p className="text-sm text-gray-400">尚無倉庫位置</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {storageLocations.map(loc => (
                            <span key={loc.id} className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                              {loc.name}
                              <button onClick={() => deleteStorageLocation(loc.id, loc.name)} className="ml-1 text-green-400 hover:text-red-500 leading-none" title="刪除倉庫">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">範例：館別「麗格」底下可設倉庫「地下室」、「備品室」、「2F倉庫」、「小倉庫」。</p>
        </div>
      </div>
    );
  }

  function renderDepartmentsSection() {
    const list = Array.isArray(warehouseData.list) ? warehouseData.list : [];
    const byName = warehouseData.byName || {};
    const buildings = list.filter(x => x.type === 'building');
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">館別設定</h3>
          <p className="text-sm text-gray-500 mb-4">館別指建築／據點（如麗格），部門為該館別下的單位（如行政部、管理部、房務部）。請先新增館別，再為該館別新增部門。</p>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <input
              type="text"
              value={newBuilding}
              onChange={e => setNewBuilding(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBuilding()}
              placeholder="新增館別，例如：麗格"
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
            />
            <button type="button" onClick={addBuilding} disabled={saving || !newBuilding.trim()} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm font-medium">新增館別</button>
          </div>
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <select
              value={newDeptWarehouse}
              onChange={e => setNewDeptWarehouse(e.target.value)}
              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
            >
              <option value="">選擇館別</option>
              {buildings.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <input
              type="text"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDepartmentToWarehouse()}
              placeholder="部門名稱，例如：行政部、管理部、房務部"
              className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
            />
            <button
              onClick={addDepartmentToWarehouse}
              disabled={saving || !newDeptWarehouse || !newDeptName.trim()}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
            >
              新增部門
            </button>
          </div>
          {warehouseLoading ? (
            <p className="text-sm text-gray-500">載入中...</p>
          ) : buildings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">尚無館別，請先新增館別（如：麗格）</p>
          ) : (
            <div className="space-y-3">
              {buildings.map(b => (
                <div key={b.name} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                    <span className="font-medium text-gray-800">{b.name}（館別）</span>
                    <button type="button" onClick={() => deleteWarehouse(b.name)} className="text-xs text-red-500 hover:text-red-700 hover:underline">刪除館別</button>
                  </div>
                  <div className="px-4 py-3">
                    {(byName[b.name] || []).length === 0 ? (
                      <p className="text-sm text-gray-400">尚無部門</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(byName[b.name] || []).map(dept => (
                          <span key={dept} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                            {dept}
                            <button onClick={() => deleteDepartment(b.name, dept)} className="ml-1 text-blue-400 hover:text-red-500 leading-none" title="刪除部門">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">範例：館別「麗格」底下可設部門「行政部」、「管理部」、「房務部」。</p>
        </div>
      </div>
    );
  }

  // === 1. 基礎主資料 ===
  function renderMasterDataSection() {
    const masterDataItems = [
      {
        icon: '📦',
        name: '產品資料',
        count: masterDataCounts.products,
        href: '/products',
        description: '管理所有產品品項、規格與庫存設定',
      },
      {
        icon: '🏢',
        name: '廠商管理',
        count: masterDataCounts.suppliers,
        href: '/suppliers',
        description: '管理供應商資訊、聯絡方式與付款條件',
      },
      {
        icon: '📊',
        name: '會計科目',
        count: masterDataCounts.accountingSubjects,
        href: '/accounting-subjects',
        description: '管理會計科目代碼、分類與傳票對應',
      },
      {
        icon: '🏨',
        name: '館別 / 部門',
        count: masterDataCounts.warehouses,
        href: '/warehouse-departments',
        description: '管理館別、部門組織架構設定',
      },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">主資料快速連結</h3>
          <p className="text-sm text-gray-500 mb-6">管理系統的基礎主檔資料，包含產品、廠商、會計科目與組織架構。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {masterDataItems.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="group block p-5 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-400 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">{item.name}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-gray-600">{item.count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="text-xs text-gray-400 group-hover:text-gray-600 font-medium transition-colors">
                    前往管理 →
                  </span>
                </div>
              </a>
            ))}
          </div>
          {renderAuditTrail('master-data')}
        </div>
      </div>
    );
  }

  // === 2. 財務參數 (existing) ===
  function renderFinanceSection() {
    return (
      <div className="space-y-8">
        {/* Tax Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">稅率設定</h3>
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-600 whitespace-nowrap">預設稅率 (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRate}
              onChange={e => setTaxRate(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
            <button
              onClick={saveTaxRate}
              disabled={saving}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">此稅率將作為開立發票時的預設值</p>
        </div>

        {/* Invoice Titles */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">發票抬頭管理</h3>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={newInvoiceTitle}
              onChange={e => setNewInvoiceTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addInvoiceTitle()}
              placeholder="發票抬頭名稱..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
            <input
              type="text"
              value={newInvoiceTaxId}
              onChange={e => setNewInvoiceTaxId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addInvoiceTitle()}
              placeholder="統一編號（選填）"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
            <button
              onClick={addInvoiceTitle}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              新增
            </button>
          </div>
          {invoiceTitles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">尚未設定發票抬頭</p>
          ) : (
            <div className="space-y-2">
              {invoiceTitles.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div>
                    <span className="text-sm text-gray-700 font-medium">{item.title}</span>
                    {item.taxId && <span className="text-xs text-gray-400 ml-2">({item.taxId})</span>}
                  </div>
                  <button
                    onClick={() => deleteInvoiceTitle(item.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">付款方式管理</h3>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={newPaymentMethod}
              onChange={e => setNewPaymentMethod(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPaymentMethod()}
              placeholder="輸入付款方式名稱..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
            <button
              onClick={addPaymentMethod}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              新增
            </button>
          </div>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">尚未設定付款方式</p>
          ) : (
            <div className="space-y-2">
              {paymentMethods.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{item.name}</span>
                    {item.isDefault && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">預設</span>
                    )}
                  </div>
                  {!item.isDefault && (
                    <button
                      onClick={() => deletePaymentMethod(item.id)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                    >
                      刪除
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {renderAuditTrail('finance')}
      </div>
    );
  }

  // === 3. PMS 科目對應 ===
  function renderPmsMappingSection() {
    const currentEntryType = mappingSubTab === 'credit' ? '貸方' : '借方';
    const filteredRules = mappingRules
      .filter(r => r.entryType === currentEntryType)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    return (
      <div className="space-y-6">
        {/* Warning notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-medium text-amber-800">注意事項</p>
              <p className="text-xs text-amber-700 mt-1">
                修改後僅影響未來新匯入的記錄，歷史已匯入記錄不受影響。
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => { setMappingSubTab('credit'); setShowAddMappingForm(false); cancelEditMapping(); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mappingSubTab === 'credit'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              貸方對應（收入科目）
            </button>
            <button
              onClick={() => { setMappingSubTab('debit'); setShowAddMappingForm(false); cancelEditMapping(); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mappingSubTab === 'debit'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              借方對應（資產/負債科目）
            </button>
          </div>

          <div className="p-6">
            {/* Add button */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-600">
                {currentEntryType}對應規則（共 {filteredRules.length} 筆）
              </h3>
              <button
                onClick={() => {
                  setShowAddMappingForm(!showAddMappingForm);
                  cancelEditMapping();
                }}
                className="px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-xs font-medium transition-colors"
              >
                {showAddMappingForm ? '取消新增' : '+ 新增對應'}
              </button>
            </div>

            {/* Add form */}
            {showAddMappingForm && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-800 mb-3">新增 {currentEntryType} 對應規則</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">PMS 欄位名稱 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newMappingForm.pmsColumnName}
                      onChange={e => setNewMappingForm(prev => ({ ...prev, pmsColumnName: e.target.value }))}
                      placeholder="例：住房收入"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">會計科目代碼 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newMappingForm.accountingCode}
                      onChange={e => setNewMappingForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                      placeholder="例：4111"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">會計科目名稱 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={newMappingForm.accountingName}
                      onChange={e => setNewMappingForm(prev => ({ ...prev, accountingName: e.target.value }))}
                      placeholder="例：住房收入"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">說明</label>
                    <input
                      type="text"
                      value={newMappingForm.description}
                      onChange={e => setNewMappingForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="備註說明..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                </div>
                {/* Accounting subject quick pick */}
                {accountingSubjects.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-xs text-gray-500 mb-1">快速選取會計科目：</label>
                    <select
                      onChange={e => {
                        const subj = accountingSubjects.find(s => s.code === e.target.value);
                        if (subj) {
                          setNewMappingForm(prev => ({
                            ...prev,
                            accountingCode: subj.code,
                            accountingName: subj.name,
                          }));
                        }
                      }}
                      value=""
                      className="w-full md:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">-- 選擇科目 --</option>
                      {accountingSubjects.map(s => (
                        <option key={s.id} value={s.code}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  onClick={addMappingRule}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  {saving ? '新增中...' : '新增'}
                </button>
              </div>
            )}

            {/* Mapping rules table */}
            {filteredRules.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">尚無 {currentEntryType} 對應規則</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-3 text-gray-600 font-medium w-8">#</th>
                      <th className="text-left py-3 px-3 text-gray-600 font-medium">PMS 欄位名稱</th>
                      <th className="text-left py-3 px-3 text-gray-600 font-medium">科目代碼</th>
                      <th className="text-left py-3 px-3 text-gray-600 font-medium">科目名稱</th>
                      <th className="text-left py-3 px-3 text-gray-600 font-medium">說明</th>
                      <th className="text-right py-3 px-3 text-gray-600 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule, i) => (
                      <tr
                        key={rule.id}
                        className={`border-b border-gray-100 transition-colors ${
                          rule.isSystemDefault ? 'bg-gray-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="py-3 px-3 text-gray-400">{i + 1}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">{rule.pmsColumnName}</span>
                            {rule.isSystemDefault && (
                              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">預設</span>
                            )}
                          </div>
                        </td>
                        {editingMappingId === rule.id ? (
                          <>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={mappingEditForm.accountingCode}
                                onChange={e => setMappingEditForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={mappingEditForm.accountingName}
                                onChange={e => setMappingEditForm(prev => ({ ...prev, accountingName: e.target.value }))}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={mappingEditForm.description}
                                onChange={e => setMappingEditForm(prev => ({ ...prev, description: e.target.value }))}
                                className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                              />
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => saveMappingEdit(rule.id)}
                                disabled={saving}
                                className="text-green-600 hover:text-green-800 text-sm font-medium mr-2 transition-colors"
                              >
                                儲存
                              </button>
                              <button
                                onClick={cancelEditMapping}
                                className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                              >
                                取消
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-3">
                              <span className="font-mono text-gray-600">{rule.accountingCode}</span>
                            </td>
                            <td className="py-3 px-3 text-gray-700">{rule.accountingName}</td>
                            <td className="py-3 px-3 text-gray-500 text-xs">{rule.description || '-'}</td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => startEditMapping(rule)}
                                className="text-gray-600 hover:text-gray-800 text-sm font-medium mr-2 transition-colors"
                              >
                                編輯
                              </button>
                              {!rule.isSystemDefault && rule.id > 0 && (
                                <button
                                  onClick={() => deleteMappingRule(rule.id)}
                                  className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                                >
                                  刪除
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Link to PMS Income page mapping tab */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              如需在 PMS 收入匯入頁面直接管理對應設定，請前往：
            </p>
            <a
              href="/pms-income?tab=mapping"
              className="text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              前往 PMS 收入管理 →
            </a>
          </div>
        </div>
        {renderAuditTrail('pms-mapping')}
      </div>
    );
  }

  // === 4. 費用分類管理 (existing) ===
  function renderExpenseCategoriesSection() {
    return (
      <div className="space-y-6">
        {/* Category Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">
            {editingCategoryId ? '編輯費用分類' : '新增費用分類'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">分類名稱 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={categoryForm.name}
                onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例：水電費"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">說明</label>
              <input
                type="text"
                value={categoryForm.description}
                onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="分類說明..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">排序</label>
              <input
                type="number"
                value={categoryForm.sortOrder}
                onChange={e => setCategoryForm(prev => ({ ...prev, sortOrder: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveExpenseCategory}
              disabled={saving}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {saving ? '儲存中...' : editingCategoryId ? '更新分類' : '新增分類'}
            </button>
            {editingCategoryId && (
              <button
                onClick={cancelEditCategory}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
              >
                取消
              </button>
            )}
          </div>
        </div>

        {/* Category List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">費用分類列表</h3>
          {expenseCategories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">尚未設定費用分類</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">排序</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">名稱</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">說明</th>
                    <th className="text-right py-3 px-4 text-gray-600 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseCategories
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                    .map((cat) => (
                      <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-500">{cat.sortOrder ?? 0}</td>
                        <td className="py-3 px-4 text-gray-700 font-medium">{cat.name}</td>
                        <td className="py-3 px-4 text-gray-500">{cat.description || '-'}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => editExpenseCategory(cat)}
                            className="text-gray-600 hover:text-gray-800 text-sm font-medium mr-3 transition-colors"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => deleteExpenseCategory(cat.id)}
                            className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {renderAuditTrail('expense-categories')}
      </div>
    );
  }

  // === 5. 通知設定 (existing) ===
  function renderNotificationsSection() {
    return (
      <div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-6">通知門檻設定</h3>
          <p className="text-sm text-gray-500 mb-6">設定各項自動通知的提前天數或日期，系統將根據以下參數發送提醒通知。</p>
          <div className="space-y-6">
            {NOTIFICATION_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 pb-4 border-b border-gray-100 last:border-b-0">
                <div className="sm:w-72">
                  <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                  <p className="text-xs text-gray-400 mt-0.5">{field.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={notificationSettings[field.key]}
                    onChange={e =>
                      setNotificationSettings(prev => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm text-center"
                  />
                  <span className="text-sm text-gray-500">
                    {field.key.includes('Months') ? '個月' : field.key.includes('DayOfMonth') ? '號' : '天'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-4 border-t border-gray-200">
            <button
              onClick={saveNotificationSettings}
              disabled={saving}
              className="px-6 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {saving ? '儲存中...' : '儲存通知設定'}
            </button>
          </div>
          {renderAuditTrail('notifications')}
        </div>
      </div>
    );
  }

  // === 6. 使用者管理 ===
  function renderUsersSection() {
    if (usersLoading) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
            <span className="ml-3 text-sm text-gray-500">載入使用者資料中...</span>
          </div>
        </div>
      );
    }

    if (usersError) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-center py-8">
            <p className="text-sm text-red-500 mb-4">{usersError}</p>
            <button
              onClick={fetchUsers}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
            >
              重試
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header with link */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-700">使用者列表</h3>
              <p className="text-sm text-gray-500 mt-1">共 {users.length} 位使用者</p>
            </div>
            <a
              href="/admin/users"
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              前往完整使用者管理 →
            </a>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">尚無使用者資料</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">名稱</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">Email</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">角色</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">館別限制</th>
                    <th className="text-center py-3 px-4 text-gray-600 font-medium">狀態</th>
                    <th className="text-left py-3 px-4 text-gray-600 font-medium">最後登入</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-700">{user.name || '-'}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{user.email}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <span
                                key={role.id}
                                className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"
                              >
                                {role.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              {user.role || 'user'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {user.warehouseRestriction || '不限'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            user.isActive !== false ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          title={user.isActive !== false ? '啟用中' : '已停用'}
                        ></span>
                        <span className={`ml-1.5 text-xs ${user.isActive !== false ? 'text-green-600' : 'text-gray-400'}`}>
                          {user.isActive !== false ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('zh-TW')
                          : '尚未登入'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {renderAuditTrail('users')}
        </div>
      </div>
    );
  }

  // === 7. 系統資訊 (existing) ===
  function renderSystemInfoSection() {
    const dbOk = systemInfo.dbStatus === '正常';

    const dataGroups = [
      {
        label: '商品與供應商',
        items: [
          { label: '產品數量',   value: systemInfo.productCount },
          { label: '廠商數量',   value: systemInfo.supplierCount },
          { label: '館別數量',   value: systemInfo.warehouseCount },
          { label: '部門數量',   value: systemInfo.departmentCount },
        ],
      },
      {
        label: '交易與財務',
        items: [
          { label: '進貨單數量',     value: systemInfo.purchaseCount },
          { label: '發票數量',       value: systemInfo.invoiceCount },
          { label: '支出記錄數',     value: systemInfo.expenseCount },
          { label: '現金交易筆數',   value: systemInfo.cashTransactionCount },
          { label: '現金帳戶數',     value: systemInfo.cashAccountCount },
          { label: '貸款筆數',       value: systemInfo.loanCount },
        ],
      },
      {
        label: '系統',
        items: [
          { label: '使用者數量', value: systemInfo.userCount },
        ],
      },
    ];

    return (
      <div className="space-y-6">
        {/* DB status banner */}
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${dbOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`text-xl mt-0.5 ${dbOk ? 'text-emerald-500' : 'text-red-500'}`}>{dbOk ? '✅' : '❌'}</span>
          <div>
            <p className={`text-sm font-semibold ${dbOk ? 'text-emerald-800' : 'text-red-800'}`}>
              資料庫狀態：{systemInfo.dbStatus || '載入中...'}
            </p>
            {!dbOk && systemInfo.dbError && (
              <p className="text-xs text-red-600 mt-1 font-mono">{systemInfo.dbError}</p>
            )}
            {dbOk && (
              <p className="text-xs text-emerald-600 mt-0.5">PostgreSQL 連線正常，資料查詢成功</p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">系統版本</p>
            <p className="text-sm font-bold text-gray-700">{systemInfo.version || '—'}</p>
          </div>
        </div>

        {/* Data counts by group */}
        {dataGroups.map(group => (
          <div key={group.label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{group.label}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.items.map(item => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-sm text-gray-500">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {dbOk ? (item.value ?? 0).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">環境資訊</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-sm text-gray-500">框架</span>
              <span className="text-sm font-medium text-gray-700">Next.js 14 (App Router)</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-sm text-gray-500">ORM</span>
              <span className="text-sm font-medium text-gray-700">Prisma</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-sm text-gray-500">資料庫</span>
              <span className="text-sm font-medium text-gray-700">PostgreSQL</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-sm text-gray-500">UI 框架</span>
              <span className="text-sm font-medium text-gray-700">Tailwind CSS</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-700">資料庫維護</h3>
              <p className="text-sm text-gray-400 mt-1">重新整理系統快取及資料庫統計資訊</p>
            </div>
            <button
              onClick={() => {
                fetchAllData();
                showToast('系統資訊已重新載入');
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors border border-gray-300"
            >
              重新載入
            </button>
          </div>
          {renderAuditTrail('system-info')}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-700">回填廠商資料</h3>
              <p className="text-sm text-gray-400 mt-1">將現金流交易記錄中遺漏的廠商資訊（出納付款、支票兌現）補齊，執行一次即可</p>
            </div>
            <button
              onClick={async () => {
                if (!confirm('確定要執行廠商資料回填嗎？此操作不可逆，建議先備份資料。')) return;
                try {
                  const res = await fetch('/api/admin/backfill-supplier-ids', { method: 'POST' });
                  const d = await res.json();
                  if (res.ok) showToast(d.message || '回填完成');
                  else showToast(d.error?.message || '回填失敗', 'error');
                } catch { showToast('回填失敗', 'error'); }
              }}
              className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium transition-colors border border-orange-300"
            >
              執行回填
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === 6. 通知渠道管理 ===
  function renderNotificationChannelsSection() {
    return <NotificationChannelsSection showToast={showToast} />;
  }

  // === 7. 現金盤點設定 ===
  function renderCashCountConfigSection() {
    return <CashCountConfigSection showToast={showToast} />;
  }

  // === 9. 期初資料匯入 ===
  function renderDataImportSection() {
    return (
      <div className="space-y-6">
        {/* Link to full setup wizard (spec25) */}
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-amber-800 mb-1">📥 系統上線期初資料匯入精靈</h3>
              <p className="text-sm text-amber-700 mb-3">
                系統首次上線前，批量匯入帳戶餘額、庫存期初、貸款主檔、應付帳款等完整期初資料。
                支援多類型分批上傳、驗證預覽、確認匯入全流程。
              </p>
              <a
                href="/settings/setup-import"
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
              >
                <span>前往期初資料匯入精靈</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        {/* Simple JSON import for master data updates */}
        <DataImportSection showToast={showToast} />
      </div>
    );
  }

  function renderContent() {
    switch (activeSection) {
      case 'warehouses':
        return renderWarehousesSection();
      case 'departments':
        return renderDepartmentsSection();
      case 'master-data':
        return renderMasterDataSection();
      case 'finance':
        return renderFinanceSection();
      case 'pms-mapping':
        return renderPmsMappingSection();
      case 'expense-categories':
        return renderExpenseCategoriesSection();
      case 'notifications':
        return renderNotificationsSection();
      case 'notification-channels':
        return renderNotificationChannelsSection();
      case 'cash-count':
        return renderCashCountConfigSection();
      case 'data-import':
        return renderDataImportSection();
      case 'users':
        return renderUsersSection();
      case 'system-info':
        return renderSystemInfoSection();
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-gray-500" />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto"></div>
            <p className="mt-4 text-gray-500 text-sm">載入系統設定中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-gray-500" />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div
            className={`px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${
              toast.type === 'error' ? 'bg-red-500' : 'bg-gray-700'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-700">系統設定</h1>
          <p className="text-sm text-gray-500 mt-1">管理系統參數、主資料、PMS對應、財務設定、通知門檻、使用者與費用分類</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Sidebar */}
          <div className="lg:w-60 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden sticky top-8">
              <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">設定選單</h2>
              </div>
              <nav className="p-2 space-y-1">
                {SECTIONS.map((section) => (
                  section.href ? (
                    <a
                      key={section.key}
                      href={section.href}
                      className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-3 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                    >
                      <span className="text-base">{section.icon}</span>
                      <span>{section.label}</span>
                      <span className="ml-auto text-xs text-gray-400">&rarr;</span>
                    </a>
                  ) : (
                    <button
                      key={section.key}
                      onClick={() => handleSectionChange(section.key)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-3 ${
                        activeSection === section.key
                          ? 'bg-gray-700 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      <span className="text-base">{section.icon}</span>
                      <span>{section.label}</span>
                    </button>
                  )
                ))}
              </nav>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 min-w-0">
            {/* Section Title */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-700">
                {SECTIONS.find(s => s.key === activeSection)?.label}
              </h2>
              <div className="h-1 w-16 bg-gray-600 rounded mt-2"></div>
            </div>

            <div id={activeSection}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
