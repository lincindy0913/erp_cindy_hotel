'use client';

import { useState, useEffect, useCallback } from 'react';

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function useEngineeringData({ activeTab, filterProjectId }) {
  const [projects, setProjects]                     = useState([]);
  const [contracts, setContracts]                   = useState([]);
  const [suppliers, setSuppliers]                   = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [projectsError, setProjectsError]           = useState(null);
  const [contractsError, setContractsError]         = useState(null);
  const [paymentOrdersError, setPaymentOrdersError] = useState(null);
  const [authError, setAuthError]                   = useState(false);
  const [warehouseDepartments, setWarehouseDepts]   = useState({ list: [], byName: {} });
  const [paymentOrders, setPaymentOrders]           = useState([]);
  const [progressClaims, setProgressClaims]         = useState([]);
  const [outputInvoicesList, setOutputInvoicesList] = useState([]);
  const [dashStats, setDashStats]                   = useState({ totalIncome: 0, totalInputInvoices: 0, totalOutputInvoices: 0, byProject: {} });
  const [dashStatsError, setDashStatsError]         = useState(false);
  const [warrantyRecords, setWarrantyRecords]       = useState([]);
  const [accounts, setAccounts]                     = useState([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['轉帳', '票據', '現金']);
  const [unassignedInvCount, setUnassignedInvCount] = useState(0);

  // ── shared error dispatcher ───────────────────────────────────────────────

  const handleErr = useCallback((e, label) => {
    if (e?.name === 'AbortError') return;
    if (e?.status === 401) { setAuthError(true); return; }
    console.error(`[${label}]`, e);
  }, []);

  // ── fetch functions ──────────────────────────────────────────────────────

  const fetchProjects = useCallback(async (signal) => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/engineering/projects', signal ? { signal } : undefined);
      setProjectsError(null);
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e?.name === 'AbortError') { setLoading(false); return; }
      if (e?.status === 401) { setAuthError(true); setLoading(false); return; }
      console.error('[fetchProjects]', e);
      setProjectsError('工程案列表載入失敗，請重試。');
    }
    setLoading(false);
  }, []);

  const fetchContracts = useCallback(async (projectId, signal) => {
    try {
      const url = projectId ? `/api/engineering/contracts?projectId=${projectId}` : '/api/engineering/contracts';
      const data = await fetchJson(url, signal ? { signal } : undefined);
      setContractsError(null);
      setContracts(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (e?.status === 401) { setAuthError(true); return; }
      console.error('[fetchContracts]', e);
      setContractsError('合約資料載入失敗，請重試。');
      setContracts([]);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const data = await fetchJson('/api/suppliers?all=true');
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (e) { handleErr(e, 'fetchSuppliers'); setSuppliers([]); }
  }, [handleErr]);

  const fetchWarehouseDepartments = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/warehouse-departments', signal ? { signal } : undefined);
      setWarehouseDepts({ list: data.list || [], byName: data.byName || {} });
    } catch (e) { handleErr(e, 'fetchWarehouseDepts'); setWarehouseDepts({ list: [], byName: {} }); }
  }, [handleErr]);

  const fetchPaymentOrders = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/payment-orders?sourceType=engineering', signal ? { signal } : undefined);
      setPaymentOrdersError(null);
      setPaymentOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (e?.status === 401) { setAuthError(true); return; }
      console.error('[fetchPaymentOrders]', e);
      setPaymentOrdersError('付款單資料載入失敗，請重試。');
      setPaymentOrders([]);
    }
  }, []);

  const refreshDashStats = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/engineering/dashboard-stats', signal ? { signal } : undefined);
      setDashStats(data);
      setDashStatsError(false);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      handleErr(e, 'refreshDashStats');
      setDashStatsError(true);
    }
  }, [handleErr]);

  const fetchAccounts = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/cashflow/accounts', signal ? { signal } : undefined);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) { handleErr(e, 'fetchAccounts'); setAccounts([]); }
  }, [handleErr]);

  const fetchProgressClaims = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/engineering/progress-claims', signal ? { signal } : undefined);
      setProgressClaims(Array.isArray(data) ? data : []);
    } catch (e) { handleErr(e, 'fetchProgressClaims'); setProgressClaims([]); }
  }, [handleErr]);

  const fetchOutputInvoicesList = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/engineering/output-invoices', signal ? { signal } : undefined);
      setOutputInvoicesList(Array.isArray(data) ? data : []);
    } catch (e) { handleErr(e, 'fetchOutputInvoicesList'); setOutputInvoicesList([]); }
  }, [handleErr]);

  const fetchWarrantyRecords = useCallback(async (signal) => {
    try {
      const data = await fetchJson('/api/engineering/warranty-records', signal ? { signal } : undefined);
      setWarrantyRecords(Array.isArray(data) ? data : []);
    } catch (e) { handleErr(e, 'fetchWarrantyRecords'); setWarrantyRecords([]); }
  }, [handleErr]);

  // ── initial load ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
    refreshDashStats();
    fetchJson('/api/company-expenses?type=invoice&projectId=null')
      .then(data => setUnassignedInvCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [fetchProjects, fetchSuppliers, refreshDashStats]);

  // ── tab-based load ────────────────────────────────────────────────────────

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;

    if (activeTab === 'projects') {
      fetchContracts(undefined, signal);
      fetchPaymentOrders(signal);
      refreshDashStats(signal);
      fetchWarehouseDepartments(signal);
    }
    if (activeTab === 'contracts') fetchContracts(filterProjectId || undefined, signal);
    if (activeTab === 'materials') fetchContracts(undefined, signal);
    if (activeTab === 'projectMgmt') {
      fetchContracts(undefined, signal);
      fetchPaymentOrders(signal);
      fetchWarehouseDepartments(signal);
      fetchWarrantyRecords(signal);
    }
    if (activeTab === 'payments') {
      fetchPaymentOrders(signal);
      fetchAccounts(signal);
      fetchContracts(undefined, signal);
      fetchJson('/api/settings/payment-methods', { signal })
        .then(d => Array.isArray(d) && d.length > 0 ? setPaymentMethodOptions(d.map(x => x.name || x)) : null)
        .catch(e => { if (e?.name !== 'AbortError') console.warn('[payment-methods]', e.message); });
    }
    if (activeTab === 'progressClaims') fetchProgressClaims(signal);
    if (activeTab === 'income') { fetchProgressClaims(signal); fetchOutputInvoicesList(signal); }
    if (activeTab === 'budgetReport') {
      fetchContracts(undefined, signal);
      fetchPaymentOrders(signal);
      fetchProgressClaims(signal);
      refreshDashStats(signal);
    }
    if (activeTab === 'outputInvoices') fetchProgressClaims(signal);

    return () => ctrl.abort();
  }, [activeTab, filterProjectId,
    fetchContracts, fetchPaymentOrders, refreshDashStats, fetchWarehouseDepartments,
    fetchWarrantyRecords, fetchAccounts, fetchProgressClaims, fetchOutputInvoicesList]);

  return {
    // data
    projects, contracts, suppliers, loading,
    projectsError, contractsError, paymentOrdersError, authError,
    warehouseDepartments, paymentOrders, progressClaims,
    outputInvoicesList, dashStats, dashStatsError, warrantyRecords, accounts,
    paymentMethodOptions, unassignedInvCount,
    // setters needed by page mutations
    setProjects, setUnassignedInvCount,
    // fetch functions
    fetchProjects, fetchContracts, fetchSuppliers,
    fetchPaymentOrders, refreshDashStats, fetchAccounts,
    fetchProgressClaims, fetchOutputInvoicesList, fetchWarrantyRecords,
  };
}
