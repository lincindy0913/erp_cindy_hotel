'use client';

import { useState, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { PROPERTY_STATUS_LABEL, PROPERTY_STATUSES } from '@/lib/propertyStatus';

export function useAssetFilter({ mergedRows, year, activeRange, loadProperties }) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const { sortKey: assetSortKey, sortDir: assetSortDir, toggleSort: assetToggleSort } = useColumnSort('sortOrder', 'asc');

  // Batch select state
  const [selectedPropIds, setSelectedPropIds] = useState(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const [batchSavingProps, setBatchSavingProps] = useState(false);

  const filteredRows = useMemo(() => {
    return mergedRows.filter(p => {
      if (searchText) {
        const q = searchText.toLowerCase();
        const match = (p.name || '').toLowerCase().includes(q)
          || (p.buildingName || '').toLowerCase().includes(q)
          || (p.currentTenantName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterCategory && p.category !== filterCategory) return false;
      return true;
    });
  }, [mergedRows, searchText, filterStatus, filterCategory]);

  const sortedRows = useMemo(() => {
    const accessors = {
      sortOrder: r => r.sortOrder ?? Infinity,
      name: r => r.name || '',
      category: r => r.category || '',
      status: r => r.status || '',
      tenantName: r => r.currentTenant || '',
      monthlyRent: r => Number(r.monthlyRent || 0),
      rentIncome: r => Number(r.rentIncome || 0),
      houseTax: r => Number(r.houseTax || 0),
      landTax: r => Number(r.landTax || 0),
      maintenanceAmount: r => Number(r.maintenanceAmount || 0),
      netProfit: r => Number(r.rentIncome || 0) - Number(r.houseTax || 0) - Number(r.landTax || 0) - Number(r.maintenanceAmount || 0),
    };
    return sortRows(filteredRows, assetSortKey, assetSortDir, accessors);
  }, [filteredRows, assetSortKey, assetSortDir]);

  async function handleBatchStatusChange() {
    if (!selectedPropIds.size || !batchStatus) return;
    const label = PROPERTY_STATUS_LABEL[batchStatus] || batchStatus;
    if (!(await confirm(`確定要將已選 ${selectedPropIds.size} 筆物業狀態改為「${label}」？`, { title: '批次狀態變更', danger: false }))) return;
    setBatchSavingProps(true);
    try {
      const results = await Promise.all([...selectedPropIds].map(id =>
        fetch(`/api/rentals/properties/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: batchStatus }),
        }).then(async r => ({ ok: r.ok, error: r.ok ? null : (await r.json().catch(() => ({}))).error }))
      ));
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        const contractBlocked = failed.filter(r => r.error?.includes('活躍合約'));
        const msg = contractBlocked.length > 0
          ? `${results.length - failed.length} 筆成功，${contractBlocked.length} 筆因有活躍合約無法變更`
          : `${results.length - failed.length} 筆成功，${failed.length} 筆失敗`;
        showToast(msg, 'error');
      } else {
        showToast(`已將 ${results.length} 筆物業狀態改為「${PROPERTY_STATUS_LABEL[batchStatus] || batchStatus}」`, 'success');
      }
      setSelectedPropIds(new Set());
      setBatchStatus('');
      await loadProperties();
    } catch { showToast('批次更新失敗', 'error'); }
    finally { setBatchSavingProps(false); }
  }

  function exportCSV() {
    const periodLabel = activeRange ? `${activeRange.start}~${activeRange.end}` : `${year}年`;
    const headers = [
      '序號', '物業', '戶別', '大樓名稱', '地址', '分類', '狀態',
      '所有權人', '房屋稅稅籍編號', '收租帳戶', '押金帳戶', '收水電費',
      '公益出租人', '公益申請人', '公益租約起', '公益租約迄', '公益月租金',
      '綁定資產名稱',
      '租客', '月租金',
      `${periodLabel}租金+水電實收`, `${year}年房屋稅`, `${year}年地價稅`, `${periodLabel}維護費`, `${periodLabel}淨利`,
    ];
    const csvRows = sortedRows.map(p => [
      p.sortOrder ?? '',
      p.name,
      p.unitNo || '',
      p.buildingName || '',
      p.address || '',
      p.category || '',
      PROPERTY_STATUS_LABEL[p.status] || p.status || '',
      p.ownerName || '',
      p.houseTaxRegistrationNo || '',
      p.rentCollectAccount?.name || '',
      p.depositAccount?.name || '',
      p.collectUtilityFee ? '是' : '否',
      p.publicInterestLandlord ? '是' : '否',
      p.publicInterestApplicant || '',
      p.publicInterestStartDate || '',
      p.publicInterestEndDate || '',
      p.publicInterestRent ?? '',
      p.asset?.name || '',
      p.currentTenantName || '',
      p.currentMonthlyRent || '',
      p.rentIncome || 0,
      p.houseTax || 0,
      p.landTax || 0,
      p.maintenanceAmount || 0,
      p.netProfit || 0,
    ]);
    const csv = [headers, ...csvRows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `資產管理_${periodLabel}_${new Date().toLocaleDateString('zh-TW').replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    searchText, setSearchText,
    filterStatus, setFilterStatus,
    filterCategory, setFilterCategory,
    assetSortKey, assetSortDir, assetToggleSort,
    selectedPropIds, setSelectedPropIds,
    batchStatus, setBatchStatus,
    batchSavingProps,
    filteredRows,
    sortedRows,
    handleBatchStatusChange,
    exportCSV,
  };
}
