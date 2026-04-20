'use client';

import { useState, useEffect, useCallback } from 'react';
import { parsePdfByBank } from './bankParsers';

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export const CC_STATUS_MAP = {
  pending:   { label: '待對帳',   color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  matched:   { label: '已對帳',   color: 'bg-blue-100 text-blue-700 border-blue-300' },
  confirmed: { label: '已確認',   color: 'bg-green-100 text-green-700 border-green-300' },
  no_data:   { label: '無資料',   color: 'bg-gray-100 text-gray-500 border-gray-300' },
  partial:   { label: '部分完成', color: 'bg-orange-100 text-orange-700 border-orange-300' },
};

export function useCreditCardTab({ activeTab, showMessage }) {
  const now = new Date();

  const [ccStatements, setCcStatements] = useState([]);
  const [ccSummary, setCcSummary] = useState(null);
  const [ccMerchantConfigs, setCcMerchantConfigs] = useState([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccMonth, setCcMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [ccWarehouseFilter, setCcWarehouseFilter] = useState('');
  const [ccStatusFilter, setCcStatusFilter] = useState('all');
  const [ccExpandedId, setCcExpandedId] = useState(null);
  const [ccBuildings, setCcBuildings] = useState([]);
  const [ccShowUpload, setCcShowUpload] = useState(false);
  const [ccUploadWarehouse, setCcUploadWarehouse] = useState('');
  const [ccParsedData, setCcParsedData] = useState(null);
  const [ccMatchResults, setCcMatchResults] = useState({});
  const [ccMatchLoading, setCcMatchLoading] = useState({});
  const [ccInnerTab, setCcInnerTab] = useState('statements');
  const [ccPmsRecords, setCcPmsRecords] = useState([]);
  const [ccPmsLoading, setCcPmsLoading] = useState(false);
  const [ccPmsStartDate, setCcPmsStartDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  );
  const [ccPmsEndDate, setCcPmsEndDate] = useState(() => {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  });
  const [ccPmsWarehouse, setCcPmsWarehouse] = useState('');
  const [ccShowConfigModal, setCcShowConfigModal] = useState(false);
  const [ccConfigForm, setCcConfigForm] = useState({
    warehouseId: '', bankName: '國泰世華', merchantId: '', merchantName: '',
    accountNo: '', domesticFeeRate: '1.70', foreignFeeRate: '2.30', selfFeeRate: '1.70',
  });
  const [ccBankType, setCcBankType] = useState('國泰世華');
  const [ccConfigSaving, setCcConfigSaving] = useState(false);

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
      showMessage('載入信用卡對帳失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setCcLoading(false);
  }, [ccMonth, ccWarehouseFilter, ccStatusFilter, showMessage]);

  useEffect(() => {
    if (activeTab === 'credit-card') fetchCcData();
  }, [activeTab, fetchCcData]);

  const fetchCcPmsData = useCallback(async () => {
    setCcPmsLoading(true);
    try {
      const params = new URLSearchParams({ pmsColumnName: '信用卡', limit: '500' });
      if (ccPmsStartDate) params.set('startDate', ccPmsStartDate);
      if (ccPmsEndDate) params.set('endDate', ccPmsEndDate);
      if (ccPmsWarehouse) params.set('warehouse', ccPmsWarehouse);
      const res = await fetch(`/api/pms-income?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCcPmsRecords(data.records || []);
      }
    } catch (e) {
      showMessage('載入 PMS 信用卡收入失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setCcPmsLoading(false);
  }, [ccPmsStartDate, ccPmsEndDate, ccPmsWarehouse, showMessage]);

  useEffect(() => {
    if (activeTab === 'credit-card' && ccInnerTab === 'pms') fetchCcPmsData();
  }, [activeTab, ccInnerTab, fetchCcPmsData]);

  const handleCcPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      const parsed = parsePdfByBank(fullText, ccBankType);
      if (parsed) {
        setCcParsedData(parsed);
        showMessage(`解析成功：${parsed.merchantName || '(未識別名稱)'}，請款金額 ${formatMoney(parsed.totalAmount)}`);
      } else {
        showMessage(`無法解析 PDF 內容，請確認格式是否符合 ${ccBankType} 信用卡對帳單`, 'error');
      }
    } catch (err) {
      showMessage('PDF 解析失敗：' + (err.message || '未知錯誤'), 'error');
    }
    e.target.value = '';
  };

  const matchCcPms = useCallback(async (id) => {
    setCcMatchLoading(prev => ({ ...prev, [id]: true }));
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
        setCcMatchResults(prev => ({ ...prev, [id]: { pmsRecords: data.pmsRecords || [], matchedDates: data.matchedDates || [] } }));
        fetchCcData();
      }
    } catch { showMessage('比對失敗', 'error'); }
    finally { setCcMatchLoading(prev => ({ ...prev, [id]: false })); }
  }, [showMessage, fetchCcData]);

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
          action: 'upload_parsed',
          statements: [{
            ...ccParsedData,
            warehouseId: parseInt(ccUploadWarehouse),
            warehouse: bld?.name || '',
          }],
        }),
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        const skipped = data.skipped > 0 ? `（${data.skipped} 筆重複略過）` : '';
        showMessage(`對帳單已匯入${skipped}，正在比對PMS...`);
        let targetMonth = null;
        if (ccParsedData?.billingDate) {
          const parts = ccParsedData.billingDate.replace(/-/g, '/').split('/');
          if (parts.length >= 2) {
            targetMonth = `${parts[0]}-${parts[1].padStart(2, '0')}`;
            setCcMonth(targetMonth);
          }
        }
        setCcParsedData(null);
        setCcShowUpload(false);
        if (data.created > 0 && Array.isArray(data.results)) {
          for (const r of data.results) {
            if (r.id && !r.skipped) await matchCcPms(r.id);
          }
        }
        if (targetMonth && targetMonth !== ccMonth) {
          const params = new URLSearchParams({ month: targetMonth });
          if (ccWarehouseFilter) params.set('warehouseId', ccWarehouseFilter);
          const res2 = await fetch(`/api/reconciliation/credit-card-statements?${params}`);
          if (res2.ok) setCcStatements(await res2.json());
        } else {
          fetchCcData();
        }
      }
    } catch {
      showMessage('匯入失敗', 'error');
    }
  };

  const matchAllCcPms = async () => {
    const pendingStmts = ccStatements.filter(s => s.status !== 'confirmed');
    if (pendingStmts.length === 0) {
      showMessage('沒有待比對的對帳單', 'error');
      return;
    }
    let matched = 0, failed = 0;
    for (const stmt of pendingStmts) {
      try {
        const res = await fetch('/api/reconciliation/credit-card-statements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: stmt.id, action: 'match_pms' }),
        });
        const data = await res.json();
        if (!data.error) matched++;
        else failed++;
      } catch { failed++; }
    }
    showMessage(`批次比對完成：${matched} 筆成功${failed > 0 ? `，${failed} 筆失敗` : ''}`);
    fetchCcData();
  };

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

  const deleteCcStatement = async (id) => {
    if (!confirm('確定刪除此對帳單？')) return;
    try {
      await fetch(`/api/reconciliation/credit-card-statements?id=${id}`, { method: 'DELETE' });
      fetchCcData();
      showMessage('已刪除');
    } catch { showMessage('刪除失敗', 'error'); }
  };

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

  return {
    ccStatements, setCcStatements,
    ccSummary,
    ccMerchantConfigs,
    ccLoading,
    ccMonth, setCcMonth,
    ccWarehouseFilter, setCcWarehouseFilter,
    ccStatusFilter, setCcStatusFilter,
    ccExpandedId, setCcExpandedId,
    ccBuildings,
    ccShowUpload, setCcShowUpload,
    ccUploadWarehouse, setCcUploadWarehouse,
    ccParsedData, setCcParsedData,
    ccMatchResults,
    ccMatchLoading,
    ccInnerTab, setCcInnerTab,
    ccPmsRecords,
    ccPmsLoading,
    ccPmsStartDate, setCcPmsStartDate,
    ccPmsEndDate, setCcPmsEndDate,
    ccPmsWarehouse, setCcPmsWarehouse,
    ccShowConfigModal, setCcShowConfigModal,
    ccConfigForm, setCcConfigForm,
    ccBankType, setCcBankType,
    ccConfigSaving,
    fetchCcData,
    fetchCcPmsData,
    handleCcPdfUpload,
    saveParsedCcStatement,
    matchCcPms,
    matchAllCcPms,
    toggleCcConfirm,
    deleteCcStatement,
    saveCcConfig,
  };
}
