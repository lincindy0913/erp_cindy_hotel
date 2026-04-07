'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import AttachmentSection from '@/components/AttachmentSection';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const TABS = [
  { key: 'projects', label: '工程案' },
  { key: 'projectMgmt', label: '專案管理' },
  { key: 'contracts', label: '合約與期數' },
  { key: 'materials', label: '材料使用' },
  { key: 'payments', label: '付款單' },
  { key: 'income', label: '收款管理' },
];

const PROJECT_STATUS = ['進行中', '已結案', '暫停'];

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// 取得付款單實際已付金額：已執行的用 executions.actualAmount 合計，否則用 po.amount
function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}

export default function EngineeringPage() {
  const [activeTab, setActiveTab] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingContract, setEditingContract] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingTerm, setEditingTerm] = useState(null);

  const [projectForm, setProjectForm] = useState({ code: '', name: '', clientName: '', clientContractAmount: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
  const [contractForm, setContractForm] = useState({ projectId: '', supplierId: '', contractNo: '', totalAmount: '', signDate: '', content: '', note: '', terms: [], materials: [] });
  const [materialForm, setMaterialForm] = useState({ projectId: '', productId: '', contractId: '', termId: '', description: '', quantity: '', unit: '', unitPrice: '', usedAt: '', note: '' });
  const [termForm, setTermForm] = useState({ termName: '', amount: '', dueDate: '', status: 'pending', paidAt: '', paymentOrderId: '', note: '' });

  const [filterProjectId, setFilterProjectId] = useState('');
  const [warehouseDepartments, setWarehouseDepartments] = useState({ list: [], byName: {} });
  const [paymentOrders, setPaymentOrders] = useState([]);

  // 搜尋篩選
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchSupplierId, setSearchSupplierId] = useState('');
  const [searchWarehouse, setSearchWarehouse] = useState('');

  const { sortKey: engProjKey, sortDir: engProjDir, toggleSort: engProjToggle } = useColumnSort('code', 'asc');

  // 搜尋篩選後的工程案
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // 日期區間：工程案的起迄日與搜尋區間有交集
      if (searchDateFrom) {
        const pEnd = p.endDate || '9999-12-31';
        if (pEnd < searchDateFrom) return false;
      }
      if (searchDateTo) {
        const pStart = p.startDate || '0000-01-01';
        if (pStart > searchDateTo) return false;
      }
      // 館別
      if (searchWarehouse) {
        const whName = p.warehouseRef?.name || p.warehouse || '';
        if (whName !== searchWarehouse) return false;
      }
      // 廠商：檢查該工程案是否有合約與此廠商相關
      if (searchSupplierId) {
        const hasSupplier = contracts.some(c => c.projectId === p.id && String(c.supplierId) === searchSupplierId);
        if (!hasSupplier) return false;
      }
      return true;
    });
  }, [projects, contracts, searchDateFrom, searchDateTo, searchWarehouse, searchSupplierId]);

  const sortedProjects = useMemo(
    () =>
      sortRows(filteredProjects, engProjKey, engProjDir, {
        code: (p) => p.code || '',
        name: (p) => p.name || '',
        clientName: (p) => p.clientName || '',
        whDept: (p) => `${p.warehouseRef?.name || p.warehouse || ''} ${p.departmentRef?.name || ''}`,
        location: (p) => [p.location, p.buildingNo, p.permitNo].filter(Boolean).join(' '),
        startDate: (p) => p.startDate || '',
        endDate: (p) => p.endDate || '',
        budget: (p) => Number(p.budget || 0),
        status: (p) => p.status || '',
      }),
    [filteredProjects, engProjKey, engProjDir]
  );

  const { sortKey: engConKey, sortDir: engConDir, toggleSort: engConToggle } = useColumnSort('signDate', 'desc');
  const sortedContracts = useMemo(
    () =>
      sortRows(contracts, engConKey, engConDir, {
        projectLabel: (c) => `${c.project?.code || ''} ${c.project?.name || ''}`,
        contractNo: (c) => c.contractNo || '',
        supplier: (c) => c.supplier?.name || '',
        totalAmount: (c) => Number(c.totalAmount || 0),
        conStatus: (c) => (c.status === 'completed' ? '已完成' : '進行中'),
        signDate: (c) => c.signDate || '',
      }),
    [contracts, engConKey, engConDir]
  );

  // 付款單搜尋篩選
  const [paySearchDateFrom, setPaySearchDateFrom] = useState('');
  const [paySearchDateTo, setPaySearchDateTo] = useState('');
  const [paySearchSupplierId, setPaySearchSupplierId] = useState('');
  const [paySearchWarehouse, setPaySearchWarehouse] = useState('');
  const [payTab, setPayTab] = useState('draft'); // 草稿 / pending / executed / rejected

  // 付款單依狀態分組
  const draftPaymentOrders = useMemo(() => paymentOrders.filter(o => o.status === '草稿'), [paymentOrders]);
  const pendingPaymentOrders = useMemo(() => paymentOrders.filter(o => o.status === '待出納'), [paymentOrders]);
  const executedPaymentOrders = useMemo(() => paymentOrders.filter(o => o.status === '已執行'), [paymentOrders]);
  const rejectedPaymentOrders = useMemo(() => paymentOrders.filter(o => o.status === '已拒絕'), [paymentOrders]);

  function getPayTabOrders() {
    switch (payTab) {
      case 'draft': return draftPaymentOrders;
      case 'pending': return pendingPaymentOrders;
      case 'executed': return executedPaymentOrders;
      case 'rejected': return rejectedPaymentOrders;
      default: return paymentOrders;
    }
  }

  const filteredPaymentOrders = useMemo(() => {
    const base = getPayTabOrders();
    return base.filter(o => {
      if (paySearchDateFrom) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d < paySearchDateFrom) return false;
      }
      if (paySearchDateTo) {
        const d = (o.createdAt || '').slice(0, 10);
        if (d > paySearchDateTo) return false;
      }
      if (paySearchSupplierId && String(o.supplierId) !== paySearchSupplierId) return false;
      if (paySearchWarehouse && (o.warehouse || '') !== paySearchWarehouse) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentOrders, payTab, paySearchDateFrom, paySearchDateTo, paySearchSupplierId, paySearchWarehouse]);

  const { sortKey: engPayKey, sortDir: engPayDir, toggleSort: engPayToggle } = useColumnSort('orderNo', 'asc');
  const sortedPaymentOrders = useMemo(
    () =>
      sortRows(filteredPaymentOrders, engPayKey, engPayDir, {
        orderNo: (o) => o.orderNo || '',
        summary: (o) => o.summary || '',
        supplierName: (o) => o.supplierName || '',
        warehouse: (o) => o.warehouse || '',
        netAmount: (o) => Number(o.netAmount || 0),
        poStatus: (o) => o.status || '',
        createdAt: (o) => o.createdAt || '',
      }),
    [filteredPaymentOrders, engPayKey, engPayDir]
  );

  function handlePayPrint() {
    const rows = sortedPaymentOrders;
    if (rows.length === 0) return;
    const filterInfo = [];
    if (paySearchDateFrom || paySearchDateTo) filterInfo.push(`日期: ${paySearchDateFrom || '~'} ~ ${paySearchDateTo || '~'}`);
    if (paySearchWarehouse) filterInfo.push(`館別: ${paySearchWarehouse}`);
    if (paySearchSupplierId) { const s = suppliers.find(s => String(s.id) === paySearchSupplierId); filterInfo.push(`廠商: ${s?.name || paySearchSupplierId}`); }
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>工程付款單</title>
      <style>body{font-family:'Microsoft JhengHei',sans-serif;padding:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600}
      .right{text-align:right}
      h2{margin:0 0 4px} .info{color:#666;font-size:12px;margin-bottom:12px}
      @media print{button{display:none}}</style></head><body>
      <h2>工程付款單</h2>
      <div class="info">${filterInfo.length ? filterInfo.join('　') + '<br>' : ''}列印時間: ${new Date().toLocaleString('zh-TW')}</div>
      <table><thead><tr>
        <th>付款單號</th><th>摘要</th><th>廠商</th><th>館別</th><th class="right">金額</th><th>狀態</th><th>建立日期</th>
      </tr></thead><tbody>`);
    let total = 0;
    rows.forEach(o => {
      const amt = Number(o.netAmount || 0);
      total += amt;
      w.document.write(`<tr>
        <td>${o.orderNo || ''}</td><td>${o.summary || '－'}</td><td>${o.supplierName || '－'}</td>
        <td>${o.warehouse || '－'}</td><td class="right">${amt.toLocaleString()}</td><td>${o.status || ''}</td>
        <td>${o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td>
      </tr>`);
    });
    w.document.write(`</tbody><tfoot><tr>
      <td colspan="4" class="right"><strong>合計 (${rows.length} 筆)</strong></td>
      <td class="right"><strong>${total.toLocaleString()}</strong></td><td colspan="2"></td>
    </tr></tfoot></table>
    <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;font-size:14px;cursor:pointer">列印</button>
    </body></html>`);
    w.document.close();
  }

  function handlePayExportExcel() {
    const rows = sortedPaymentOrders;
    if (rows.length === 0) return;
    const header = ['付款單號', '摘要', '廠商', '館別', '金額', '狀態', '建立日期'];
    const csvRows = [header.join(',')];
    rows.forEach(o => {
      csvRows.push([
        o.orderNo || '',
        (o.summary || '').replace(/,/g, '，'),
        (o.supplierName || '').replace(/,/g, '，'),
        o.warehouse || '',
        Number(o.netAmount || 0),
        o.status || '',
        o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : ''
      ].map(c => `"${c}"`).join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工程付款單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { sortKey: engMatKey, sortDir: engMatDir, toggleSort: engMatToggle } = useColumnSort('usedAt', 'desc');
  // 計算每個材料的已領用數量（依 projectId + contractId + description/productId 分組）
  const materialUsedMap = useMemo(() => {
    const map = {};
    // 用於辨識同一材料的 key
    const getMatKey = (m) => `${m.projectId}_${m.contractId || ''}_${m.productId || ''}_${m.description || ''}`;
    // 先算每個 key 的已領用總量（有 usedAt 的行 = 領用記錄）
    materials.forEach(m => {
      if (!m.usedAt) return;
      const key = getMatKey(m);
      map[key] = (map[key] || 0) + Number(m.quantity || 0);
    });
    return map;
  }, [materials]);

  function getMaterialUsed(m) {
    const key = `${m.projectId}_${m.contractId || ''}_${m.productId || ''}_${m.description || ''}`;
    return materialUsedMap[key] || 0;
  }

  const sortedMaterials = useMemo(
    () =>
      sortRows(materials, engMatKey, engMatDir, {
        projectCode: (m) => m.project?.code || '',
        contractNo: (m) => m.contractNo || '',
        termName: (m) => m.termName || '',
        itemDesc: (m) =>
          m.product ? `${m.product.code || ''} ${m.product.name || ''}`.trim() : m.description || '',
        quantity: (m) => Number(m.quantity || 0),
        unit: (m) => m.unit || '',
        unitPrice: (m) => Number(m.unitPrice || 0),
        subtotal: (m) => Number(m.quantity || 0) * Number(m.unitPrice || 0),
        usedQty: (m) => m.usedAt ? Number(m.quantity || 0) : getMaterialUsed(m),
        remaining: (m) => m.usedAt ? 0 : Math.max(0, Number(m.quantity || 0) - getMaterialUsed(m)),
        usedAt: (m) => m.usedAt || '',
      }),
    [materials, engMatKey, engMatDir, materialUsedMap]
  );
  const [accounts, setAccounts] = useState([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡']);
  const [showContractUploadModal, setShowContractUploadModal] = useState(false);
  const [contractForUpload, setContractForUpload] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: '', summary: '', note: '', materials: [] });
  const [projectSaving, setProjectSaving] = useState(false);
  const [contractSaving, setContractSaving] = useState(false);
  const [termSaving, setTermSaving] = useState(false);
  const [materialSaving, setMaterialSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Income tab state
  const [incomes, setIncomes] = useState([]);
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ projectId: '', termName: '', amount: '', receivedDate: new Date().toISOString().split('T')[0], accountId: '', accountingSubject: '41000 工程收入', note: '' });
  const [incomeFilterProjectId, setIncomeFilterProjectId] = useState('');

  const { data: session } = useSession();
  const { showToast } = useToast();

  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
    fetchProducts();
    fetchWarehouseDepartments();
    fetchContracts();
  }, []);

  useEffect(() => {
    if (activeTab === 'contracts') fetchContracts(filterProjectId || undefined);
    if (activeTab === 'materials') { fetchMaterials(filterProjectId || undefined); fetchContracts(); }
    if (activeTab === 'projectMgmt') fetchContracts();
    if (activeTab === 'payments') {
      fetchPaymentOrders();
      fetchAccounts();
      fetchContracts();
      fetch('/api/settings/payment-methods').then(res => res.json()).then(d => Array.isArray(d) && d.length > 0 ? setPaymentMethodOptions(d.map(x => x.name || x)) : null).catch(() => null);
    }
    if (activeTab === 'income') {
      fetchIncomes();
      fetchAccounts();
    }
  }, [activeTab, filterProjectId]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch('/api/engineering/projects');
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); setProjects([]); }
    setLoading(false);
  }

  async function fetchContracts(projectId) {
    try {
      const url = projectId ? `/api/engineering/contracts?projectId=${projectId}` : '/api/engineering/contracts';
      const res = await fetch(url);
      const data = await res.json();
      setContracts(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); setContracts([]); }
  }

  async function fetchMaterials(projectId) {
    try {
      const url = projectId ? `/api/engineering/materials?projectId=${projectId}` : '/api/engineering/materials';
      const res = await fetch(url);
      const data = await res.json();
      setMaterials(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); setMaterials([]); }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers?all=true');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products?all=true');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch { setProducts([]); }
  }

  async function fetchWarehouseDepartments() {
    try {
      const res = await fetch('/api/warehouse-departments');
      const data = await res.json();
      setWarehouseDepartments({ list: data.list || [], byName: data.byName || {} });
    } catch { setWarehouseDepartments({ list: [], byName: {} }); }
  }

  async function fetchPaymentOrders() {
    try {
      const res = await fetch('/api/payment-orders?sourceType=engineering');
      const data = await res.json();
      setPaymentOrders(Array.isArray(data) ? data : []);
    } catch { setPaymentOrders([]); }
  }

  async function fetchIncomes(projectId) {
    try {
      const pid = projectId !== undefined ? projectId : incomeFilterProjectId;
      const url = pid ? `/api/engineering/income?projectId=${pid}` : '/api/engineering/income';
      const res = await fetch(url);
      const data = await res.json();
      setIncomes(Array.isArray(data) ? data : []);
    } catch { setIncomes([]); }
  }

  async function handleCreateIncome(e) {
    e.preventDefault();
    if (!incomeForm.projectId || !incomeForm.termName || !incomeForm.amount || !incomeForm.receivedDate) {
      showToast('請填寫工程案、期數名稱、收款金額、收款日期', 'error');
      return;
    }
    setIncomeSaving(true);
    try {
      const res = await fetch('/api/engineering/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomeForm),
      });
      const resData = await res.json();
      if (!res.ok) { showToast(resData.error?.message || '建立失敗', 'error'); return; }
      showToast('收款紀錄已建立', 'success');
      setShowIncomeForm(false);
      setIncomeForm({ projectId: '', termName: '', amount: '', receivedDate: new Date().toISOString().split('T')[0], accountId: '', accountingSubject: '41000 工程收入', note: '' });
      fetchIncomes();
    } catch { showToast('建立收款紀錄失敗', 'error'); }
    setIncomeSaving(false);
  }

  async function handleDeleteIncome(id) {
    if (!confirm('確定要刪除此收款紀錄？對應的現金流交易也會一併刪除。')) return;
    try {
      const res = await fetch(`/api/engineering/income/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('已刪除', 'success'); fetchIncomes(); }
      else { const err = await res.json(); showToast(err.error?.message || '刪除失敗', 'error'); }
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  function openAddProject() {
    setEditingProject(null);
    setProjectForm({ code: '', name: '', clientName: '', clientContractAmount: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
    setShowProjectModal(true);
  }

  function openEditProject(p) {
    setEditingProject(p);
    setProjectForm({
      code: p.code, name: p.name, clientName: p.clientName || '',
      clientContractAmount: p.clientContractAmount != null ? String(p.clientContractAmount) : '',
      startDate: p.startDate || '', endDate: p.endDate || '',
      budget: p.budget != null ? String(p.budget) : '',
      status: p.status || '進行中',
      warehouseId: p.warehouseId != null ? String(p.warehouseId) : '',
      departmentId: p.departmentId != null ? String(p.departmentId) : '',
      location: p.location || '', buildingNo: p.buildingNo || '', permitNo: p.permitNo || '', note: p.note || '',
    });
    setShowProjectModal(true);
  }

  async function saveProject() {
    if (!projectForm.code?.trim() || !projectForm.name?.trim()) { showToast('請填寫工程代碼與名稱', 'error'); return; }
    setProjectSaving(true);
    try {
      const body = {
        code: projectForm.code.trim(), name: projectForm.name.trim(),
        clientName: projectForm.clientName?.trim() || null,
        clientContractAmount: projectForm.clientContractAmount ? parseFloat(projectForm.clientContractAmount) : null,
        startDate: projectForm.startDate || null, endDate: projectForm.endDate || null,
        budget: projectForm.budget ? parseFloat(projectForm.budget) : null,
        status: projectForm.status,
        warehouseId: projectForm.warehouseId || null, departmentId: projectForm.departmentId || null,
        location: projectForm.location?.trim() || null, buildingNo: projectForm.buildingNo?.trim() || null,
        permitNo: projectForm.permitNo?.trim() || null, note: projectForm.note?.trim() || null,
      };
      if (editingProject) {
        await fetch(`/api/engineering/projects/${editingProject.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已更新', 'success');
      } else {
        await fetch('/api/engineering/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已新增', 'success');
      }
      setShowProjectModal(false); fetchProjects();
    } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
    finally { setProjectSaving(false); }
  }

  async function deleteProject(p) {
    if (!confirm(`確定刪除工程案「${p.name}」？其合約與材料記錄也會一併刪除。`)) return;
    try {
      await fetch(`/api/engineering/projects/${p.id}`, { method: 'DELETE' });
      fetchProjects();
      if (filterProjectId === String(p.id)) setFilterProjectId('');
    } catch (e) { showToast('刪除失敗', 'error'); }
  }

  function openAddContract() {
    setEditingContract(null);
    setContractForm({
      projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      supplierId: '', contractNo: '', totalAmount: '', signDate: '', content: '', note: '',
      terms: [{ termName: '第1期', amount: '', dueDate: '', content: '', note: '' }],
      materials: [{ materialName: '', quantity: '', amount: '' }],
    });
    setShowContractModal(true);
  }

  function openEditContract(c) {
    setEditingContract(c);
    const matList = (c.materials || []).length ? (c.materials || []).map(m => ({
      materialName: m.description || '', quantity: String(m.quantity ?? ''),
      amount: String((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0)),
    })) : [{ materialName: '', quantity: '', amount: '' }];
    setContractForm({
      projectId: String(c.projectId), supplierId: String(c.supplierId),
      contractNo: c.contractNo, totalAmount: String(c.totalAmount ?? ''),
      signDate: c.signDate || '', content: c.content || '', note: c.note || '',
      terms: [],
      materials: matList,
    });
    setShowContractModal(true);
  }

  function addContractMaterialRow() { setContractForm(f => ({ ...f, materials: [...f.materials, { materialName: '', quantity: '', amount: '' }] })); }
  function removeContractMaterialRow(i) { setContractForm(f => ({ ...f, materials: f.materials.filter((_, idx) => idx !== i) })); }
  function updateContractMaterial(i, field, value) {
    setContractForm(f => ({ ...f, materials: f.materials.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)) }));
  }
  function openUploadContract(c) { setContractForUpload(c); setShowContractUploadModal(true); }
  function addContractTermRow() {
    const existingCount = editingContract ? (editingContract.terms || []).length : 0;
    const n = existingCount + contractForm.terms.length + 1;
    setContractForm(f => ({ ...f, terms: [...f.terms, { termName: `第${n}期`, amount: '', dueDate: '', content: '', note: '' }] }));
  }
  function removeContractTermRow(i) { setContractForm(f => ({ ...f, terms: f.terms.filter((_, idx) => idx !== i) })); }
  function updateContractTerm(i, field, value) {
    setContractForm(f => ({ ...f, terms: f.terms.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)) }));
  }

  async function saveContract() {
    if (!contractForm.projectId || !contractForm.supplierId || !contractForm.contractNo?.trim()) { showToast('請填寫工程案、廠商、合約編號', 'error'); return; }
    if (!contractForm.content?.trim()) { showToast('請填寫合約內容後再存檔', 'error'); return; }
    if (!contractForm.note?.trim()) { showToast('請填寫備註後再存檔', 'error'); return; }
    setContractSaving(true);
    try {
      const body = {
        projectId: parseInt(contractForm.projectId), supplierId: parseInt(contractForm.supplierId),
        contractNo: contractForm.contractNo.trim(), totalAmount: parseFloat(contractForm.totalAmount) || 0,
        signDate: contractForm.signDate || null, content: contractForm.content?.trim() || null, note: contractForm.note?.trim() || null,
        terms: contractForm.terms.map((t, i) => ({
          termName: t.termName || `第${i + 1}期`, amount: parseFloat(t.amount) || 0,
          dueDate: t.dueDate || null, content: t.content?.trim() || null, note: t.note?.trim() || null,
        })).filter(t => t.amount > 0),
        materials: (contractForm.materials || []).map(m => ({
          materialName: (m.materialName || '').trim(), quantity: parseFloat(m.quantity) || 0,
          amount: parseFloat(m.amount) || 0,
        })).filter(m => m.materialName && m.quantity > 0),
      };
      if (editingContract) {
        const res = await fetch(`/api/engineering/contracts/${editingContract.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractNo: body.contractNo, totalAmount: body.totalAmount, signDate: body.signDate, content: body.content, note: body.note, materials: body.materials }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '更新失敗'); }
        // Add new terms (追加款)
        const newTerms = body.terms.filter(t => t.amount > 0);
        for (const t of newTerms) {
          const tRes = await fetch(`/api/engineering/contracts/${editingContract.id}/terms`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t)
          });
          if (!tRes.ok) { const d = await tRes.json(); showToast(`追加期數失敗: ${d.error?.message || ''}`, 'error'); }
        }
        showToast(newTerms.length > 0 ? `合約已更新，追加 ${newTerms.length} 期` : '合約已更新', 'success');
      } else {
        const res = await fetch('/api/engineering/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message || '新增失敗'); }
        showToast('已新增合約', 'success');
      }
      setShowContractModal(false);
      fetchContracts(filterProjectId || undefined);
      if (activeTab === 'materials' || !editingContract) fetchMaterials(filterProjectId || undefined);
    } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
    finally { setContractSaving(false); }
  }

  async function deleteContract(c) {
    if (!confirm(`確定刪除合約「${c.contractNo}」？`)) return;
    try {
      const res = await fetch(`/api/engineering/contracts/${c.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '刪除失敗', 'error'); return; }
      fetchContracts(filterProjectId || undefined);
    } catch (e) { showToast('刪除失敗', 'error'); }
  }

  function openMarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({ termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'paid', paidAt: new Date().toISOString().slice(0, 10),
      paymentOrderId: term.paymentOrderId ? String(term.paymentOrderId) : '', note: term.note || '' });
    setShowTermModal(true);
  }

  function openUnmarkTermPaid(term) {
    setEditingTerm(term);
    setTermForm({ termName: term.termName || '', amount: String(term.amount), dueDate: term.dueDate || '',
      content: term.content || '', status: 'pending', paidAt: '', paymentOrderId: '', note: term.note || '' });
    setShowTermModal(true);
  }

  async function saveTerm() {
    if (!editingTerm) return;
    setTermSaving(true);
    try {
      const res = await fetch(`/api/engineering/contract-terms/${editingTerm.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: termForm.status, paidAt: termForm.paidAt || null,
          paymentOrderId: termForm.paymentOrderId ? parseInt(termForm.paymentOrderId) : null,
          termName: termForm.termName || null, amount: termForm.amount ? parseFloat(termForm.amount) : undefined,
          dueDate: termForm.dueDate || null, content: termForm.content || null, note: termForm.note || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error?.message || '更新失敗', 'error'); setTermSaving(false); return; }
      setShowTermModal(false);
      fetchContracts(filterProjectId || undefined);
    } catch (e) { showToast('更新失敗', 'error'); }
    finally { setTermSaving(false); }
  }

  function openAddMaterial() {
    setEditingMaterial(null);
    setMaterialForm({ projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      productId: '', contractId: '', termId: '', description: '', quantity: '', unit: '', unitPrice: '',
      usedAt: new Date().toISOString().slice(0, 10), note: '' });
    setShowMaterialModal(true);
  }

  function openEditMaterial(m) {
    setEditingMaterial(m);
    setMaterialForm({
      projectId: String(m.projectId), productId: m.productId ? String(m.productId) : '',
      contractId: m.contractId ? String(m.contractId) : '', termId: m.termId ? String(m.termId) : '',
      description: m.description || '', quantity: String(m.quantity), unit: m.unit || '',
      unitPrice: String(m.unitPrice ?? ''), usedAt: m.usedAt || '', note: m.note || '',
    });
    setShowMaterialModal(true);
  }

  async function saveMaterial() {
    if (!materialForm.projectId || !materialForm.quantity || parseFloat(materialForm.quantity) <= 0) { showToast('請選擇工程案並填寫數量', 'error'); return; }
    setMaterialSaving(true);
    try {
      const body = {
        projectId: parseInt(materialForm.projectId),
        productId: materialForm.productId ? parseInt(materialForm.productId) : null,
        contractId: materialForm.contractId ? parseInt(materialForm.contractId) : null,
        termId: materialForm.termId ? parseInt(materialForm.termId) : null,
        description: materialForm.description?.trim() || null, quantity: parseFloat(materialForm.quantity),
        unit: materialForm.unit?.trim() || null, unitPrice: parseFloat(materialForm.unitPrice) || 0,
        usedAt: materialForm.usedAt || null, note: materialForm.note?.trim() || null,
      };
      if (editingMaterial) {
        await fetch(`/api/engineering/materials/${editingMaterial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已更新', 'success');
      } else {
        await fetch('/api/engineering/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        showToast('已新增', 'success');
      }
      setShowMaterialModal(false);
      fetchMaterials(filterProjectId || undefined);
    } catch (e) { showToast('儲存失敗', 'error'); }
    finally { setMaterialSaving(false); }
  }

  async function deleteMaterial(m) {
    if (!confirm('確定刪除此筆材料？')) return;
    try {
      await fetch(`/api/engineering/materials/${m.id}`, { method: 'DELETE' });
      fetchMaterials(filterProjectId || undefined);
    } catch (e) { showToast('刪除失敗', 'error'); }
  }

  function getTermsForContract(contractId) {
    if (!contractId) return [];
    const c = contracts.find(x => x.id === parseInt(contractId));
    return c?.terms || [];
  }

  // 列印篩選後的工程案
  function handlePrintProjects() {
    if (sortedProjects.length === 0) {
      alert('沒有可列印的資料');
      return;
    }
    const filterDesc = [
      searchDateFrom || searchDateTo ? `日期：${searchDateFrom || '?'} ~ ${searchDateTo || '?'}` : '',
      searchSupplierId ? `廠商：${suppliers.find(s => String(s.id) === searchSupplierId)?.name || ''}` : '',
      searchWarehouse ? `館別：${searchWarehouse}` : '',
    ].filter(Boolean).join('　');

    // 取得每個工程案的相關合約資訊
    const projectRows = sortedProjects.map(p => {
      const projContracts = contracts.filter(c => c.projectId === p.id && (!searchSupplierId || String(c.supplierId) === searchSupplierId));
      const totalContractAmt = projContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
      const supplierNames = [...new Set(projContracts.map(c => c.supplier?.name).filter(Boolean))].join('、');
      return { ...p, projContracts, totalContractAmt, supplierNames };
    });

    const grandTotal = projectRows.reduce((s, p) => s + Number(p.budget || 0), 0);
    const grandContractTotal = projectRows.reduce((s, p) => s + p.totalContractAmt, 0);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>工程案列表</title>
<style>
  body { font-family: "Microsoft JhengHei","PingFang TC",sans-serif; margin: 20px; font-size: 12px; }
  h2 { text-align: center; margin-bottom: 4px; }
  .filter-desc { text-align: center; color: #666; margin-bottom: 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .right { text-align: right; }
  .center { text-align: center; }
  .total-row { font-weight: bold; background: #fef3c7; }
  @media print { body { margin: 0; } }
</style></head><body>
<h2>工程案列表</h2>
${filterDesc ? `<div class="filter-desc">${filterDesc}</div>` : ''}
<div style="text-align:right;margin-bottom:4px;font-size:10px;color:#999">列印時間：${new Date().toLocaleString('zh-TW')}</div>
<table>
<thead><tr>
  <th>代碼</th><th>名稱</th><th>業主</th><th>館別</th><th>廠商</th>
  <th>起日</th><th>迄日</th><th class="right">預算</th><th class="right">合約總額</th><th class="center">狀態</th>
</tr></thead>
<tbody>
${projectRows.map(p => `<tr>
  <td>${p.code || ''}</td>
  <td>${p.name || ''}</td>
  <td>${p.clientName || ''}</td>
  <td>${p.warehouseRef?.name || p.warehouse || ''}</td>
  <td>${p.supplierNames || ''}</td>
  <td>${p.startDate || ''}</td>
  <td>${p.endDate || ''}</td>
  <td class="right">${formatNum(p.budget)}</td>
  <td class="right">${formatNum(p.totalContractAmt)}</td>
  <td class="center">${p.status || ''}</td>
</tr>`).join('')}
<tr class="total-row">
  <td colspan="7">合計（${projectRows.length} 筆）</td>
  <td class="right">${formatNum(grandTotal)}</td>
  <td class="right">${formatNum(grandContractTotal)}</td>
  <td></td>
</tr>
</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="engineering" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">工程會計</h2>
          <p className="text-sm text-gray-500 mt-1">營造工程案、廠商合約期數付款、材料使用追蹤（一般人事／廠商請款請至「付款」「費用」）</p>
        </div>

        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium ${activeTab === tab.key ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading && activeTab === 'projects' && (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
        )}

        {/* ===== 工程案 TAB ===== */}
        {activeTab === 'projects' && !loading && (
          <>
          {/* 搜尋列 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">起始日期</label>
                <input type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">廠商</label>
                <select value={searchSupplierId} onChange={e => setSearchSupplierId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[140px]">
                  <option value="">全部</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={searchWarehouse} onChange={e => setSearchWarehouse(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm min-w-[120px]">
                  <option value="">全部</option>
                  {(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <button onClick={() => { setSearchDateFrom(''); setSearchDateTo(''); setSearchSupplierId(''); setSearchWarehouse(''); }} className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-100">清除</button>
              <button onClick={handlePrintProjects} className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">列印</button>
              {(searchDateFrom || searchDateTo || searchSupplierId || searchWarehouse) && (
                <span className="text-xs text-amber-600">篩選中：{filteredProjects.length} / {projects.length} 筆</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">工程案列表</h3>
              <button onClick={openAddProject} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增工程案</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableTh label="代碼" colKey="code" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="名稱" colKey="name" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="業主" colKey="clientName" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="館別／部門" colKey="whDept" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="工程地點／建造(使)造號碼" colKey="location" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="起日" colKey="startDate" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="迄日" colKey="endDate" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <SortableTh label="預算" colKey="budget" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" align="right" />
                    <SortableTh label="狀態" colKey="status" sortKey={engProjKey} sortDir={engProjDir} onSort={engProjToggle} className="px-4 py-2" />
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedProjects.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">{(searchDateFrom || searchDateTo || searchSupplierId || searchWarehouse) ? '無符合條件的工程案' : '尚無工程案，請新增'}</td></tr>
                  ) : sortedProjects.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">{p.code}</td>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.clientName || '－'}</td>
                      <td className="px-4 py-2">{p.warehouseRef?.name || p.warehouse || '－'} {p.departmentRef ? `／${p.departmentRef.name}` : ''}</td>
                      <td className="px-4 py-2 text-xs">{p.location || '－'} {(p.buildingNo || p.permitNo) ? `（${[p.buildingNo, p.permitNo].filter(Boolean).join('、')}）` : ''}</td>
                      <td className="px-4 py-2">{p.startDate || '－'}</td>
                      <td className="px-4 py-2">{p.endDate || '－'}</td>
                      <td className="px-4 py-2 text-right">{formatNum(p.budget)}</td>
                      <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${p.status === '已結案' ? 'bg-gray-200' : 'bg-amber-100 text-amber-800'}`}>{p.status}</span></td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => openEditProject(p)} className="text-amber-600 hover:underline mr-2">編輯</button>
                        <button onClick={() => deleteProject(p)} className="text-red-600 hover:underline">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {/* ===== 合約與期數 TAB ===== */}
        {activeTab === 'contracts' && (
          <>
            <div className="flex gap-3 mb-4 items-center">
              <label className="text-sm text-gray-600">篩選工程案</label>
              <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </select>
              <button onClick={openAddContract} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增合約</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortableTh label="工程案" colKey="projectLabel" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                      <SortableTh label="合約編號" colKey="contractNo" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                      <SortableTh label="廠商" colKey="supplier" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                      <SortableTh label="合約金額" colKey="totalAmount" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="狀態" colKey="conStatus" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                      <SortableTh label="簽約日" colKey="signDate" sortKey={engConKey} sortDir={engConDir} onSort={engConToggle} className="px-4 py-2" />
                      <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">期數／付款</th>
                      <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contracts.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">尚無合約或請選擇工程案</td></tr>
                    ) : sortedContracts.map(c => {
                      const hasPaidTerms = (c.terms || []).some(t => t.status === 'paid');
                      const isCompleted = c.status === 'completed';
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{c.project?.code} {c.project?.name}</td>
                          <td className="px-4 py-2 font-mono">{c.contractNo}</td>
                          <td className="px-4 py-2">{c.supplier?.name}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNum(c.totalAmount)}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isCompleted ? '已完成' : '進行中'}
                            </span>
                          </td>
                          <td className="px-4 py-2">{c.signDate || '－'}</td>
                          <td className="px-4 py-2">
                            {(c.terms || []).length > 0 && (
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="text-gray-400 border-b border-gray-200">
                                  <th className="text-left py-1 pr-2 font-normal whitespace-nowrap">期別</th>
                                  <th className="text-right py-1 px-2 font-normal whitespace-nowrap">期款</th>
                                  <th className="text-right py-1 px-2 font-normal whitespace-nowrap">已付</th>
                                  <th className="text-right py-1 px-2 font-normal whitespace-nowrap">未付</th>
                                  <th className="text-center py-1 px-2 font-normal whitespace-nowrap">狀態</th>
                                  <th className="text-center py-1 pl-2 font-normal whitespace-nowrap">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                              {(c.terms || []).map(t => {
                                const termMaterials = (c.materials || []).filter(m => m.termId === t.id);
                                const termPOs = paymentOrders.filter(po => po.sourceRecordId === t.id);
                                const paidPOs = termPOs.filter(po => po.status === '已執行');
                                const pendingPOs = termPOs.filter(po => po.status === '待出納');
                                const paidAmount = paidPOs.reduce((s, po) => s + getActualPaid(po), 0);
                                const pendingAmount = pendingPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
                                const termAmt = Number(t.amount);
                                const unpaidAmount = Math.max(0, termAmt - paidAmount);
                                const isFullyPaid = paidAmount >= termAmt && termAmt > 0;
                                const isPartial = paidAmount > 0 && !isFullyPaid;
                                const hasDetails = paidPOs.length > 0 || pendingPOs.length > 0 || t.content || t.note || termMaterials.length > 0;
                                return (
                                <Fragment key={t.id}>
                                  <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{t.termName || `第${t.termNo}期`}</td>
                                    <td className="py-1.5 px-2 text-right whitespace-nowrap">{formatNum(termAmt)}</td>
                                    <td className={`py-1.5 px-2 text-right whitespace-nowrap ${paidAmount > 0 ? 'text-green-600 font-medium' : 'text-gray-300'}`}>{paidAmount > 0 ? formatNum(paidAmount) : '—'}</td>
                                    <td className={`py-1.5 px-2 text-right whitespace-nowrap ${isFullyPaid ? 'text-gray-300' : unpaidAmount > 0 ? 'text-amber-600 font-medium' : 'text-gray-300'}`}>{isFullyPaid ? '—' : formatNum(unpaidAmount)}</td>
                                    <td className="py-1.5 px-2 text-center whitespace-nowrap">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] leading-tight ${isFullyPaid ? 'bg-green-100 text-green-700' : isPartial ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {isFullyPaid ? '已付清' : isPartial ? '部分' : '待付'}
                                      </span>
                                      {pendingAmount > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] leading-tight bg-orange-50 text-orange-500">待出納 {formatNum(pendingAmount)}</span>}
                                    </td>
                                    <td className="py-1.5 pl-2 text-center whitespace-nowrap">
                                      {!isFullyPaid && <button onClick={() => openMarkTermPaid(t)} className="text-amber-600 hover:underline">付款</button>}
                                      {isFullyPaid && <button onClick={() => openUnmarkTermPaid(t)} className="text-gray-400 hover:text-red-600 hover:underline">取消</button>}
                                    </td>
                                  </tr>
                                  {/* 付款進度條 */}
                                  {(isPartial || isFullyPaid) && (
                                    <tr><td colSpan="6" className="pb-1 pt-0">
                                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isFullyPaid ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${Math.min((paidAmount / (termAmt || 1)) * 100, 100)}%` }} />
                                      </div>
                                    </td></tr>
                                  )}
                                  {/* 付款紀錄展開 */}
                                  {hasDetails && (
                                    <tr><td colSpan="6" className="pb-2 pt-0">
                                      <div className="pl-3 space-y-0.5">
                                        {paidPOs.map((po, pi) => (
                                          <div key={pi} className="flex items-center gap-2 text-[11px] text-gray-500">
                                            <span className="text-green-600">✓</span>
                                            <span>{po.dueDate || po.createdAt?.slice(0,10) || ''}</span>
                                            <span className="text-green-600 font-medium">{formatNum(getActualPaid(po))}</span>
                                            <span className="text-gray-400">{po.paymentMethod || ''}</span>
                                            {po.paymentNo && <span className="font-mono text-gray-300">{po.paymentNo}</span>}
                                          </div>
                                        ))}
                                        {pendingPOs.map((po, pi) => (
                                          <div key={`p${pi}`} className="flex items-center gap-2 text-[11px] text-orange-500">
                                            <span>⏳</span>
                                            <span>{po.dueDate || ''}</span>
                                            <span className="font-medium">{formatNum(Number(po.amount))}</span>
                                            <span className="text-orange-400">待出納</span>
                                            {po.paymentNo && <span className="font-mono text-orange-300">{po.paymentNo}</span>}
                                          </div>
                                        ))}
                                        {t.content && <div className="text-[11px] text-gray-500">📋 {t.content}</div>}
                                        {t.note && <div className="text-[11px] text-gray-400">💬 {t.note}</div>}
                                        {termMaterials.length > 0 && (
                                          <div className="text-[11px] text-blue-600">
                                            📦 {termMaterials.map(m => `${m.description || (m.product ? `${m.product.code} ${m.product.name}` : '—')} ×${Number(m.quantity)}`).join('、')}
                                          </div>
                                        )}
                                      </div>
                                    </td></tr>
                                  )}
                                </Fragment>
                              )})}
                              </tbody>
                            </table>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => openUploadContract(c)} className="text-blue-600 hover:underline mr-2">上傳</button>
                            {!isCompleted && <button onClick={() => openEditContract(c)} className="text-amber-600 hover:underline mr-2">編輯</button>}
                            {!hasPaidTerms && <button onClick={() => deleteContract(c)} className="text-red-600 hover:underline">刪除</button>}
                            {isCompleted && <span className="text-xs text-gray-400 ml-1">已鎖定</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== 專案管理 TAB (含預算追蹤) ===== */}
        {activeTab === 'projectMgmt' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">專案管理：各工程案廠商進度與預算</h3>
              <p className="text-xs text-gray-500 mt-1">依工程案檢視每家廠商合約期數、付款進度與預算使用情況</p>
            </div>
            <div className="p-4 space-y-6">
              {projects.length === 0 ? (
                <p className="text-gray-400 text-center py-8">尚無工程案</p>
              ) : projects.map(proj => {
                const projContracts = contracts.filter(c => c.projectId === proj.id);
                const totalContractAmount = projContracts.reduce((s, c) => s + Number(c.totalAmount), 0);
                const totalPaid = projContracts.reduce((s, c) => s + (c.terms || []).reduce((ts, t) => {
                  const tPOs = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行');
                  return ts + tPOs.reduce((ps, po) => ps + getActualPaid(po), 0);
                }, 0), 0);
                const budget = Number(proj.budget) || 0;
                const overBudget = budget > 0 && totalContractAmount > budget;
                return (
                  <div key={proj.id} className="border rounded-lg p-4 bg-gray-50/50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-gray-800">{proj.code} {proj.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{proj.clientName || ''} {proj.warehouseRef?.name || proj.warehouse || ''}</div>
                      </div>
                      {budget > 0 && (
                        <div className={`text-right text-sm ${overBudget ? 'text-red-600' : 'text-gray-600'}`}>
                          <div>預算：{formatNum(budget)}</div>
                          <div>合約總額：{formatNum(totalContractAmount)} {overBudget && <span className="font-bold">（超支！）</span>}</div>
                          <div>已付：{formatNum(totalPaid)}</div>
                          <div className="mt-1">
                            <div className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min((totalPaid / (budget || 1)) * 100, 100)}%` }} />
                            </div>
                            <span className="text-xs">{budget > 0 ? `${((totalPaid / budget) * 100).toFixed(1)}%` : '－'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {projContracts.length === 0 ? (
                      <p className="text-sm text-gray-400">尚無合約</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-gray-500"><th className="pb-2">廠商</th><th className="pb-2">合約編號</th><th className="pb-2 text-right">合約金額</th><th className="pb-2 text-center">狀態</th><th className="pb-2 text-center">期數進度</th><th className="pb-2 text-right">已付／總額</th></tr></thead>
                        <tbody>
                          {projContracts.map(c => {
                            const terms = c.terms || [];
                            const totalSum = terms.reduce((s, t) => s + Number(t.amount), 0);
                            let paidByPO = 0;
                            let fullyPaidCount = 0;
                            for (const t of terms) {
                              const tPaid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0);
                              paidByPO += tPaid;
                              if (tPaid >= Number(t.amount) && Number(t.amount) > 0) fullyPaidCount++;
                            }
                            return (
                              <tr key={c.id} className="border-t">
                                <td className="py-2">{c.supplier?.name}</td>
                                <td className="py-2 font-mono">{c.contractNo}</td>
                                <td className="py-2 text-right">{formatNum(c.totalAmount)}</td>
                                <td className="py-2 text-center">
                                  <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {c.status === 'completed' ? '已完成' : '進行中'}
                                  </span>
                                </td>
                                <td className="py-2 text-center">{fullyPaidCount}／{terms.length} 期</td>
                                <td className="py-2 text-right">{formatNum(paidByPO)}／{formatNum(totalSum)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== 付款單 TAB ===== */}
        {activeTab === 'payments' && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500">草稿</p>
                <p className="text-xl font-bold text-gray-700">{draftPaymentOrders.length}</p>
                <p className="text-xs text-gray-400">NT$ {draftPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg border border-yellow-200 px-4 py-3">
                <p className="text-xs text-yellow-600">待出納</p>
                <p className="text-xl font-bold text-yellow-700">{pendingPaymentOrders.length}</p>
                <p className="text-xs text-yellow-500">NT$ {pendingPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg border border-green-200 px-4 py-3">
                <p className="text-xs text-green-600">已執行</p>
                <p className="text-xl font-bold text-green-700">{executedPaymentOrders.length}</p>
                <p className="text-xs text-green-500">NT$ {executedPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg border border-red-200 px-4 py-3">
                <p className="text-xs text-red-500">已拒絕</p>
                <p className="text-xl font-bold text-red-600">{rejectedPaymentOrders.length}</p>
                <p className="text-xs text-red-400">NT$ {rejectedPaymentOrders.reduce((s, o) => s + Number(o.netAmount || 0), 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-3 mb-4 items-center flex-wrap">
              <button onClick={() => { setEditingPaymentOrder(null); setPaymentForm({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: new Date().toISOString().slice(0, 10), summary: '', note: '', materials: [] }); setShowPaymentModal(true);}} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 建立付款單</button>
              <Link href="/cashier" className="text-sm text-amber-600 hover:underline">→ 至出納執行付款</Link>
              <div className="ml-auto flex gap-2">
                <button onClick={handlePayPrint} className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-300">🖨 列印</button>
                <button onClick={handlePayExportExcel} className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-green-700 hover:bg-green-50 border border-green-300">📥 匯出Excel</button>
              </div>
            </div>

            {/* 搜尋篩選 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">建立日期起</label>
                  <input type="date" value={paySearchDateFrom} onChange={e => setPaySearchDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">建立日期迄</label>
                  <input type="date" value={paySearchDateTo} onChange={e => setPaySearchDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={paySearchWarehouse} onChange={e => setPaySearchWarehouse(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                    <option value="">全部館別</option>
                    {(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">廠商</label>
                  <select value={paySearchSupplierId} onChange={e => setPaySearchSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                    <option value="">全部廠商</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <button onClick={() => { setPaySearchDateFrom(''); setPaySearchDateTo(''); setPaySearchSupplierId(''); setPaySearchWarehouse(''); }}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">清除</button>
                </div>
              </div>
            </div>

            {/* 狀態分頁 Tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {[
                { key: 'draft',    label: '草稿',  count: draftPaymentOrders.length,    color: 'text-gray-700',   active: 'border-gray-600 text-gray-800' },
                { key: 'pending',  label: '待出納', count: pendingPaymentOrders.length,  color: 'text-yellow-700', active: 'border-yellow-500 text-yellow-700' },
                { key: 'executed', label: '已執行', count: executedPaymentOrders.length, color: 'text-green-700',  active: 'border-green-600 text-green-700' },
                { key: 'rejected', label: '已拒絕', count: rejectedPaymentOrders.length, color: 'text-red-600',    active: 'border-red-500 text-red-600' },
              ].map(t => (
                <button key={t.key} onClick={() => setPayTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${payTab === t.key ? t.active + ' border-b-2' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {t.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-semibold ${payTab === t.key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400 self-center">共 {filteredPaymentOrders.length} 筆</span>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    <SortableTh label="付款單號" colKey="orderNo" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <SortableTh label="摘要" colKey="summary" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <SortableTh label="廠商" colKey="supplierName" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <SortableTh label="館別" colKey="warehouse" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <SortableTh label="金額" colKey="netAmount" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" align="right" />
                    <SortableTh label="狀態" colKey="poStatus" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <SortableTh label="建立日期" colKey="createdAt" sortKey={engPayKey} sortDir={engPayDir} onSort={engPayToggle} className="px-4 py-2" />
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {sortedPaymentOrders.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                        {payTab === 'draft' ? '目前無草稿付款單' : payTab === 'pending' ? '目前無待出納的付款單' : payTab === 'executed' ? '目前無已執行的付款單' : '目前無已拒絕的付款單'}
                      </td></tr>
                    ) : sortedPaymentOrders.map(o => {
                      const isExecuted = o.status === '已執行';
                      const isDraft = o.status === '草稿';
                      const isPending = o.status === '待出納';
                      const isRejected = o.status === '已拒絕';
                      const statusColor = isExecuted ? 'bg-green-100 text-green-700' : isPending ? 'bg-yellow-100 text-yellow-800' : isRejected ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700';
                      return (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{o.orderNo}</td>
                          <td className="px-4 py-2">{o.summary || '－'}</td>
                          <td className="px-4 py-2">{o.supplierName || '－'}</td>
                          <td className="px-4 py-2">{o.warehouse || '－'}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNum(o.netAmount)}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${statusColor}`}>{o.status}</span></td>
                          <td className="px-4 py-2 text-sm text-gray-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}</td>
                          <td className="px-4 py-2 text-center">
                            {isExecuted ? (
                              <span className="text-xs text-gray-400">已執行</span>
                            ) : isPending ? (
                              <div className="flex items-center justify-center gap-2">
                                <Link href="/cashier" className="text-amber-600 hover:underline text-xs whitespace-nowrap">→ 至出納</Link>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => {
                                  setEditingPaymentOrder(o);
                                  setPaymentForm({
                                    projectId: '', termId: o.sourceRecordId ? String(o.sourceRecordId) : '', contractId: '',
                                    supplierId: o.supplierId ? String(o.supplierId) : '', supplierName: o.supplierName || '',
                                    amount: String(o.amount || o.netAmount), netAmount: String(o.netAmount),
                                    paymentMethod: o.paymentMethod || '轉帳', accountId: o.accountId ? String(o.accountId) : '',
                                    dueDate: o.dueDate || '', summary: o.summary || '', note: o.note || '',
                                    materials: [],
                                  });
                                  setShowPaymentModal(true);
                                }} className="text-amber-600 hover:underline text-xs">編輯</button>
                                {(isDraft || isRejected) && (
                                  <button onClick={async () => {
                                    if (!confirm(`確定要將付款單 ${o.orderNo} 送出出納？`)) return;
                                    const action = isRejected ? 'resubmit' : 'submit';
                                    const res = await fetch(`/api/payment-orders/${o.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
                                    if (res.ok) { showToast('已送出出納', 'success'); fetchPaymentOrders(); setPayTab('pending'); }
                                    else { const d = await res.json(); showToast((typeof d.error === 'string' ? d.error : d.error?.message) || '送出失敗', 'error'); }
                                  }} className="text-blue-600 hover:underline text-xs">送出出納</button>
                                )}
                                <button onClick={async () => {
                                  if (!confirm(`確定要刪除付款單 ${o.orderNo}？`)) return;
                                  const res = await fetch(`/api/payment-orders/${o.id}`, { method: 'DELETE' });
                                  if (res.ok) { showToast('付款單已刪除', 'success'); fetchPaymentOrders(); }
                                  else { const d = await res.json(); showToast((typeof d.error === 'string' ? d.error : d.error?.message) || '刪除失敗', 'error'); }
                                }} className="text-red-500 hover:underline text-xs">刪除</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== 材料使用 TAB ===== */}
        {activeTab === 'materials' && (
          <>
            <div className="flex gap-3 mb-4 items-center">
              <label className="text-sm text-gray-600">篩選工程案</label>
              <select value={filterProjectId} onChange={e => setFilterProjectId(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </select>
              <button onClick={openAddMaterial} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增材料</button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <SortableTh label="工程案" colKey="projectCode" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <SortableTh label="合約" colKey="contractNo" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <SortableTh label="期別" colKey="termName" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <SortableTh label="品項／說明" colKey="itemDesc" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <SortableTh label="數量" colKey="quantity" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="單位" colKey="unit" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <SortableTh label="單價" colKey="unitPrice" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="小計" colKey="subtotal" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="已領用" colKey="usedQty" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="剩餘" colKey="remaining" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" align="right" />
                      <SortableTh label="使用日" colKey="usedAt" sortKey={engMatKey} sortDir={engMatDir} onSort={engMatToggle} className="px-4 py-2" />
                      <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materials.length === 0 ? (
                      <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">尚無材料記錄或請選擇工程案</td></tr>
                    ) : sortedMaterials.map(m => {
                      const sub = Number(m.quantity) * Number(m.unitPrice);
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{m.project?.code}</td>
                          <td className="px-4 py-2 text-gray-600">{m.contractNo || '－'}</td>
                          <td className="px-4 py-2 text-gray-600">{m.termName || '－'}</td>
                          <td className="px-4 py-2">{m.product ? `${m.product.code} ${m.product.name}` : (m.description || '－')}</td>
                          <td className="px-4 py-2 text-right">{formatNum(m.quantity)}</td>
                          <td className="px-4 py-2">{m.unit || '－'}</td>
                          <td className="px-4 py-2 text-right">{formatNum(m.unitPrice)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNum(sub)}</td>
                          <td className="px-4 py-2 text-right">{(() => {
                            if (m.usedAt) return <span className="text-green-600 font-medium">{formatNum(m.quantity)}</span>;
                            const used = getMaterialUsed(m);
                            return used > 0 ? <span className="text-green-600 font-medium">{formatNum(used)}</span> : <span className="text-gray-400">0</span>;
                          })()}</td>
                          <td className="px-4 py-2 text-right">{(() => {
                            if (m.usedAt) return <span className="text-gray-400">—</span>;
                            const remaining = Math.max(0, Number(m.quantity || 0) - getMaterialUsed(m));
                            const qty = Number(m.quantity || 0);
                            return remaining <= 0
                              ? <span className="text-red-500 font-medium">0</span>
                              : remaining < qty
                                ? <span className="text-amber-600 font-medium">{formatNum(remaining)}</span>
                                : <span className="text-gray-600">{formatNum(remaining)}</span>;
                          })()}</td>
                          <td className="px-4 py-2">{m.usedAt || '－'}</td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => openEditMaterial(m)} className="text-amber-600 hover:underline mr-2">編輯</button>
                            <button onClick={() => deleteMaterial(m)} className="text-red-600 hover:underline">刪除</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== 收款管理 TAB ===== */}
        {activeTab === 'income' && (() => {
          // Group incomes by projectId
          const incomesByProject = {};
          incomes.forEach(inc => {
            const pid = String(inc.projectId);
            if (!incomesByProject[pid]) incomesByProject[pid] = [];
            incomesByProject[pid].push(inc);
          });

          // Determine which projects to display
          const displayProjects = incomeFilterProjectId
            ? projects.filter(p => String(p.id) === incomeFilterProjectId)
            : projects;

          return (
            <div>
              {/* Filter & Add toolbar */}
              <div className="flex gap-3 mb-5 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">篩選工程案</label>
                  <select value={incomeFilterProjectId} onChange={e => { setIncomeFilterProjectId(e.target.value); fetchIncomes(e.target.value); }}
                    className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
                    <option value="">全部工程案</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                  </select>
                </div>
                <button onClick={() => setShowIncomeForm(f => !f)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                  + 新增收款
                </button>
              </div>

              {/* Income Form */}
              {showIncomeForm && (
                <form onSubmit={handleCreateIncome} className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
                  <h4 className="text-sm font-semibold text-green-800 mb-3">新增收款紀錄</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">工程案 *</label>
                      <select value={incomeForm.projectId} onChange={e => setIncomeForm(f => ({ ...f, projectId: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" required>
                        <option value="">請選擇</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">期數名稱 *</label>
                      <input value={incomeForm.termName} onChange={e => setIncomeForm(f => ({ ...f, termName: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：第一期款" required />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">收款金額 *</label>
                      <input type="number" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" step="0.01" min="0.01" required />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">收款日期 *</label>
                      <input type="date" value={incomeForm.receivedDate} onChange={e => setIncomeForm(f => ({ ...f, receivedDate: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" required />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">收款帳戶</label>
                      <select value={incomeForm.accountId} onChange={e => setIncomeForm(f => ({ ...f, accountId: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">請選擇（選擇後自動建立現金流）</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.warehouse ? `${a.warehouse} - ` : ''}{a.name} ({a.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">會計科目</label>
                      <input value={incomeForm.accountingSubject} onChange={e => setIncomeForm(f => ({ ...f, accountingSubject: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="41000 工程收入" />
                    </div>
                    <div className="col-span-2 md:col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">備註</label>
                      <input value={incomeForm.note} onChange={e => setIncomeForm(f => ({ ...f, note: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={incomeSaving} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                      {incomeSaving ? '儲存中…' : '儲存收款'}
                    </button>
                    <button type="button" onClick={() => setShowIncomeForm(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
                  </div>
                </form>
              )}

              {/* Per-project sections */}
              {displayProjects.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">尚無工程案</div>
              ) : (
                <div className="space-y-5">
                  {displayProjects.map(proj => {
                    const projIncomes = incomesByProject[String(proj.id)] || [];
                    const contractAmt = Number(proj.clientContractAmount || 0);
                    const received = projIncomes.reduce((s, i) => s + Number(i.amount), 0);
                    const remaining = contractAmt - received;
                    const pct = contractAmt > 0 ? Math.min((received / contractAmt) * 100, 100) : 0;

                    return (
                      <div key={proj.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        {/* Project header */}
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-200 px-5 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">{proj.code}</span>
                                <span className="font-bold text-gray-900 text-base">{proj.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  proj.status === '進行中' ? 'bg-green-100 text-green-700' :
                                  proj.status === '已結案' ? 'bg-gray-100 text-gray-500' :
                                  'bg-amber-100 text-amber-700'
                                }`}>{proj.status}</span>
                              </div>
                              <div className="text-sm text-gray-500">業主：{proj.clientName || '－'}</div>
                            </div>
                            {/* KPI summary */}
                            <div className="flex gap-6 text-sm shrink-0">
                              <div className="text-right">
                                <div className="text-xs text-gray-400 mb-0.5">合約金額</div>
                                <div className="font-semibold text-gray-700">
                                  {contractAmt > 0 ? `NT$ ${contractAmt.toLocaleString()}` : <span className="text-gray-400 text-xs">未設定</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-gray-400 mb-0.5">已收款 ({projIncomes.length} 筆)</div>
                                <div className="font-bold text-green-700">NT$ {received.toLocaleString()}</div>
                              </div>
                              {contractAmt > 0 && (
                                <div className="text-right">
                                  <div className="text-xs text-gray-400 mb-0.5">尚未收款</div>
                                  <div className={`font-bold ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    NT$ {remaining.toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Progress bar */}
                          {contractAmt > 0 && (
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>收款進度</span>
                                <span>{pct.toFixed(1)}%</span>
                              </div>
                              <div className="bg-gray-200 rounded-full h-2">
                                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Income records table */}
                        {projIncomes.length === 0 ? (
                          <div className="px-5 py-5 text-center text-sm text-gray-400">
                            此工程案尚無收款紀錄
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                              <tr>
                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-6">#</th>
                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">期數 / 品項</th>
                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">收款日期</th>
                                <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500">收款金額</th>
                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">收款帳戶</th>
                                <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500">備註</th>
                                <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500">現金流</th>
                                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {projIncomes.map((inc, idx) => (
                                <tr key={inc.id} className="hover:bg-green-50/40">
                                  <td className="px-5 py-3 text-xs text-gray-400">{idx + 1}</td>
                                  <td className="px-5 py-3">
                                    <span className="font-semibold text-gray-800">{inc.termName}</span>
                                  </td>
                                  <td className="px-5 py-3 text-gray-600">{inc.receivedDate}</td>
                                  <td className="px-5 py-3 text-right font-bold text-green-700 text-base">
                                    NT$ {Number(inc.amount).toLocaleString()}
                                  </td>
                                  <td className="px-5 py-3 text-gray-500 text-xs">
                                    {inc.account ? `${inc.account.warehouse ? inc.account.warehouse + ' - ' : ''}${inc.account.name}` : '－'}
                                  </td>
                                  <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px]">
                                    {inc.note || <span className="text-gray-300">－</span>}
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    {inc.cashTransactionId
                                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已連動</span>
                                      : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">無帳戶</span>}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button onClick={() => handleDeleteIncome(inc.id)} className="text-red-500 hover:text-red-700 text-xs hover:underline">刪除</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-green-50 border-t border-green-100">
                              <tr>
                                <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-gray-600">
                                  共 {projIncomes.length} 筆收款
                                </td>
                                <td className="px-5 py-2.5 text-right font-bold text-green-800">
                                  NT$ {received.toLocaleString()}
                                </td>
                                <td colSpan={4} />
                              </tr>
                            </tfoot>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ===== 工程案 Modal ===== */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingProject ? '編輯工程案' : '新增工程案'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">工程代碼 *</label><input value={projectForm.code} onChange={e => setProjectForm(f => ({ ...f, code: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：PRJ-001" disabled={!!editingProject} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">名稱 *</label><input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">業主／客戶</label><input value={projectForm.clientName} onChange={e => setProjectForm(f => ({ ...f, clientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">業主合約金額（收款總額）</label><input type="number" value={projectForm.clientContractAmount} onChange={e => setProjectForm(f => ({ ...f, clientContractAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">開始日期</label><input type="date" value={projectForm.startDate} onChange={e => setProjectForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">結束日期</label><input type="date" value={projectForm.endDate} onChange={e => setProjectForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">預算</label><input type="number" value={projectForm.budget} onChange={e => setProjectForm(f => ({ ...f, budget: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">狀態</label><select value={projectForm.status} onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">{PROJECT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">館別</label><select value={projectForm.warehouseId} onChange={e => setProjectForm(f => ({ ...f, warehouseId: e.target.value, departmentId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">部門</label><select value={projectForm.departmentId} onChange={e => setProjectForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{projectForm.warehouseId && (() => { const wh = (warehouseDepartments.list || []).find(w => w.id === parseInt(projectForm.warehouseId)); return (wh?.departments || []).map(d => typeof d === 'object' && d.id != null ? <option key={d.id} value={d.id}>{d.name}</option> : <option key={d} value={d}>{d}</option>); })()}</select></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">工程地點</label><input value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">建造號碼</label><input value={projectForm.buildingNo} onChange={e => setProjectForm(f => ({ ...f, buildingNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">使造號碼</label><input value={projectForm.permitNo} onChange={e => setProjectForm(f => ({ ...f, permitNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><textarea value={projectForm.note} onChange={e => setProjectForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={projectSaving}>取消</button>
              <button onClick={saveProject} disabled={projectSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{projectSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 合約 Modal ===== */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 my-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingContract ? '編輯合約' : '新增合約'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">工程案 *</label><select value={contractForm.projectId} onChange={e => setContractForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">廠商 *</label><select value={contractForm.supplierId} onChange={e => setContractForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}><option value="">請選擇</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">合約編號 *</label><input value={contractForm.contractNo} onChange={e => setContractForm(f => ({ ...f, contractNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract} /></div>
                <div><label className="block text-xs text-gray-500 mb-1">合約總金額</label><input type="number" value={contractForm.totalAmount} onChange={e => setContractForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">簽約日</label><input type="date" value={contractForm.signDate} onChange={e => setContractForm(f => ({ ...f, signDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div />
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">合約內容 *</label><textarea value={contractForm.content} onChange={e => setContractForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="請填寫合約內容（必填）" /></div>
              {editingContract && (editingContract.terms || []).length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">既有期數（至期數列表編輯）</label>
                  <div className="border rounded-lg overflow-hidden bg-gray-50">
                    <table className="w-full text-sm"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">期別</th><th className="px-2 py-1 text-right">金額</th><th className="px-2 py-1 text-left">到期日</th><th className="px-2 py-1 text-left">狀態</th></tr></thead><tbody>
                      {(editingContract.terms || []).map(t => (<tr key={t.id} className="border-t"><td className="px-2 py-1 text-gray-600">{t.termName || `第${t.termNo}期`}</td><td className="px-2 py-1 text-right text-gray-600">{formatNum(t.amount)}</td><td className="px-2 py-1 text-gray-600">{t.dueDate || '—'}</td><td className="px-2 py-1"><span className={`text-xs ${t.status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>{t.status === 'paid' ? '已付' : '待付'}</span></td></tr>))}
                    </tbody></table>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center"><label className="text-xs text-gray-500">{editingContract ? '追加期數' : '付款期數'}</label><button type="button" onClick={addContractTermRow} className="text-amber-600 text-sm">＋ 新增一期</button></div>
              <div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">期別</th><th className="px-2 py-1 text-right">金額</th><th className="px-2 py-1 text-left">到期日</th><th className="px-2 py-1 text-left">內容</th><th className="px-2 py-1 text-left">備註</th><th className="w-8" /></tr></thead><tbody>
                {contractForm.terms.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-400 text-xs">{editingContract ? '點擊上方「＋ 新增一期」追加期數' : '尚未新增期數'}</td></tr>
                ) : contractForm.terms.map((t, i) => (<tr key={i} className="border-t"><td className="px-2 py-1"><input value={t.termName} onChange={e => updateContractTerm(i, 'termName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" /></td><td className="px-2 py-1"><input type="number" value={t.amount} onChange={e => updateContractTerm(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="0.01" /></td><td className="px-2 py-1"><input type="date" value={t.dueDate} onChange={e => updateContractTerm(i, 'dueDate', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" /></td><td className="px-2 py-1"><input value={t.content || ''} onChange={e => updateContractTerm(i, 'content', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" placeholder="付款內容" /></td><td className="px-2 py-1"><input value={t.note || ''} onChange={e => updateContractTerm(i, 'note', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" placeholder="備註" /></td><td className="px-2 py-1"><button type="button" onClick={() => removeContractTermRow(i)} className="text-red-500">×</button></td></tr>))}
              </tbody></table></div>
              <div className="flex justify-between items-center"><label className="text-xs text-gray-500">材料（會連動至「材料使用」TAB）</label><button type="button" onClick={addContractMaterialRow} className="text-amber-600 text-sm">＋ 新增一筆</button></div>
              <div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">材料名稱</th><th className="px-2 py-1 text-right">數量</th><th className="px-2 py-1 text-right">金額</th><th className="w-8" /></tr></thead><tbody>
                {(contractForm.materials || []).map((m, i) => (<tr key={i} className="border-t"><td className="px-2 py-1"><input value={m.materialName} onChange={e => updateContractMaterial(i, 'materialName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" placeholder="材料名稱" /></td><td className="px-2 py-1"><input type="number" value={m.quantity} onChange={e => updateContractMaterial(i, 'quantity', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="any" min="0" /></td><td className="px-2 py-1"><input type="number" value={m.amount} onChange={e => updateContractMaterial(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="0.01" min="0" /></td><td className="px-2 py-1"><button type="button" onClick={() => removeContractMaterialRow(i)} className="text-red-500">×</button></td></tr>))}
              </tbody></table></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註 *</label><textarea value={contractForm.note} onChange={e => setContractForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="請填寫備註（必填）" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowContractModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={contractSaving}>取消</button>
              <button onClick={saveContract} disabled={contractSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{contractSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 上傳合約附件 Modal ===== */}
      {showContractUploadModal && contractForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractUploadModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">上傳合約檔案</h3>
            <p className="text-sm text-gray-500 mb-4">合約：{contractForUpload.contractNo}（{contractForUpload.supplier?.name}）</p>
            <AttachmentSection sourceModule="engineering_contract" sourceRecordId={contractForUpload.id} canUpload canDelete userEmail={session?.user?.email || ''} />
            <div className="mt-4 flex justify-end"><button onClick={() => setShowContractUploadModal(false)} className="px-4 py-2 border rounded-lg text-sm">關閉</button></div>
          </div>
        </div>
      )}

      {/* ===== 期數標記 / 取消付款 Modal ===== */}
      {showTermModal && editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTermModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{termForm.status === 'paid' ? '標記期數已付款' : '取消付款標記'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">期別</label><input value={termForm.termName} onChange={e => setTermForm(f => ({ ...f, termName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={termForm.status === 'pending'} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">金額</label><input type="number" value={termForm.amount} onChange={e => setTermForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" disabled={termForm.status === 'pending'} /></div>
              <div><label className="block text-xs text-gray-500 mb-1">到期日</label><input type="date" value={termForm.dueDate} onChange={e => setTermForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">內容</label><input value={termForm.content || ''} onChange={e => setTermForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="付款內容" /></div>
              {termForm.status === 'paid' && (<>
                <div><label className="block text-xs text-gray-500 mb-1">付款日期</label><input type="date" value={termForm.paidAt} onChange={e => setTermForm(f => ({ ...f, paidAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">付款單 ID（選填）</label><input type="number" value={termForm.paymentOrderId} onChange={e => setTermForm(f => ({ ...f, paymentOrderId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </>)}
              {termForm.status === 'pending' && <p className="text-sm text-gray-600 bg-yellow-50 p-3 rounded-lg">取消此期的付款標記後，合約狀態也會同步更新為「進行中」</p>}
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={termForm.note} onChange={e => setTermForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTermModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={termSaving}>取消</button>
              <button onClick={saveTerm} disabled={termSaving} className={`px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50 ${termForm.status === 'pending' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>{termSaving ? '儲存中…' : (termForm.status === 'pending' ? '確認取消付款' : '儲存')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 建立付款單 Modal ===== */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingPaymentOrder ? '編輯付款單' : '建立工程付款單'}</h3>
            <div className="space-y-3">
              {!editingPaymentOrder && <div>
                <label className="block text-xs text-gray-500 mb-1">連結合約期數（選填）</label>
                <select value={paymentForm.termId} onChange={e => {
                  const v = e.target.value;
                  if (!v) { setPaymentForm(f => ({ ...f, termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', summary: '' })); return; }
                  const [tid, cid] = v.split('-').map(Number);
                  const contract = contracts.find(c => c.id === cid);
                  const term = contract?.terms?.find(t => t.id === tid);
                  if (term && contract) {
                    const proj = projects.find(p => p.id === contract.projectId);
                    const whName = proj?.warehouseRef?.name || proj?.warehouse || '';
                    const deptName = proj?.departmentRef?.name || '';
                    const termPaidAmt = paymentOrders.filter(po => po.sourceRecordId === tid && (po.status === '已執行' || po.status === '待出納')).reduce((s, po) => s + (po.status === '已執行' ? getActualPaid(po) : Number(po.amount || 0)), 0);
                    const remaining = Math.max(0, Number(term.amount) - termPaidAmt);
                    const fillAmount = remaining > 0 ? String(remaining) : String(term.amount);
                    setPaymentForm(f => ({ ...f, termId: tid, contractId: cid, supplierId: String(contract.supplierId),
                      supplierName: contract.supplier?.name || '', amount: fillAmount, netAmount: fillAmount,
                      warehouse: whName, department: deptName,
                      summary: `工程 ${contract.project?.code || ''} ${contract.contractNo} ${term.termName || `第${term.termNo}期`}` }));
                  }
                }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">一般工程付款（不連結期數）</option>
                  {contracts.map(c =>
                    (c.terms || []).filter(t => {
                      const paid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((s, po) => s + getActualPaid(po), 0);
                      return paid < Number(t.amount); // show terms not fully paid by actual amount
                    }).map(t => {
                      const paidAmt = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((s, po) => s + getActualPaid(po), 0);
                      const pendingAmt = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '待出納').reduce((s, po) => s + Number(po.amount || 0), 0);
                      const remaining = Number(t.amount) - paidAmt;
                      return (
                        <option key={t.id} value={`${t.id}-${c.id}`}>
                          {c.project?.code} {c.contractNo} － {t.termName || `第${t.termNo}期`} 期款{formatNum(t.amount)}
                          {paidAmt > 0 ? ` (已付${formatNum(paidAmt)}, 餘${formatNum(remaining)})` : ''}
                          {pendingAmt > 0 ? ` [待出納${formatNum(pendingAmt)}]` : ''}
                        </option>
                      );
                    })
                  ).flat()}
                </select>
              </div>}
              {/* 選擇期數後顯示付款狀態 */}
              {!editingPaymentOrder && paymentForm.termId && (() => {
                const selContract = contracts.find(c => c.id === Number(paymentForm.contractId));
                const selTerm = selContract?.terms?.find(t => t.id === Number(paymentForm.termId));
                if (!selTerm) return null;
                const selPaidPOs = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '已執行');
                const selPaidAmt = selPaidPOs.reduce((s, po) => s + getActualPaid(po), 0);
                const selPendingAmt = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '待出納').reduce((s, po) => s + Number(po.amount || 0), 0);
                const selRemaining = Number(selTerm.amount) - selPaidAmt;
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>期款金額：{formatNum(selTerm.amount)}</span>
                      <span className={selRemaining > 0 ? 'text-amber-600' : 'text-green-600'}>剩餘應付：{formatNum(Math.max(0, selRemaining))}</span>
                    </div>
                    {selPaidAmt > 0 && <div className="text-green-700">已付款合計：{formatNum(selPaidAmt)}（{selPaidPOs.length} 筆）</div>}
                    {selPendingAmt > 0 && <div className="text-orange-600">待出納合計：{formatNum(selPendingAmt)}</div>}
                    {selPaidPOs.map((po, i) => (
                      <div key={i} className="text-gray-500 pl-2">• {po.paymentNo} {po.dueDate || ''} {formatNum(getActualPaid(po))} {po.paymentMethod || ''}</div>
                    ))}
                  </div>
                );
              })()}
              {(paymentForm.warehouse || paymentForm.department) && (
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                  館別：{paymentForm.warehouse || '—'} {paymentForm.department ? `／ 部門：${paymentForm.department}` : ''}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">廠商</label><input value={paymentForm.supplierName} onChange={e => setPaymentForm(f => ({ ...f, supplierName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">應付金額</label><input type="number" value={paymentForm.netAmount} onChange={e => setPaymentForm(f => ({ ...f, netAmount: e.target.value, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">摘要</label><input value={paymentForm.summary} onChange={e => setPaymentForm(f => ({ ...f, summary: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：工程案 XXX 第N期款" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">付款方式</label><select value={paymentForm.paymentMethod} onChange={e => setPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">{paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">資金帳戶</label><select value={paymentForm.accountId} onChange={e => setPaymentForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">請選擇</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">預計付款日</label><input type="date" value={paymentForm.dueDate} onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              {/* 領用材料 — 從合約材料選取 */}
              {(() => {
                const selContract = paymentForm.contractId ? contracts.find(c => c.id === Number(paymentForm.contractId)) : null;
                const contractMats = selContract?.materials || [];
                if (contractMats.length === 0 && paymentForm.materials.length === 0) return null;
                return (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs text-gray-500">領用材料</label>
                  {contractMats.length > 0 && (
                    <button type="button" onClick={() => setPaymentForm(f => ({ ...f, materials: [...f.materials, { materialId: '', quantity: '', note: '' }] }))} className="text-amber-600 text-xs hover:underline">＋ 新增領用</button>
                  )}
                </div>
                {contractMats.length === 0 && <div className="text-xs text-gray-400 mb-1">此合約尚無材料可領用</div>}
                {paymentForm.materials.length > 0 && (
                  <div className="space-y-2">
                    {paymentForm.materials.map((mat, mi) => {
                      const selMat = contractMats.find(cm => cm.id === Number(mat.materialId));
                      return (
                      <div key={mi} className="border rounded-lg p-2 bg-gray-50">
                        <div className="grid grid-cols-12 gap-2 mb-1">
                          <div className="col-span-7">
                            <select value={mat.materialId} onChange={e => { const ms = [...paymentForm.materials]; const cm = contractMats.find(c => c.id === Number(e.target.value)); ms[mi] = { ...ms[mi], materialId: e.target.value, quantity: cm ? String(cm.quantity) : '' }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs">
                              <option value="">選擇材料</option>
                              {contractMats.map(cm => (
                                <option key={cm.id} value={cm.id}>{cm.description} （數量{cm.quantity}，單價{cm.unitPrice}）</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3"><input placeholder="領用數量" type="number" value={mat.quantity} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], quantity: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs" step="any" min="0" max={selMat ? selMat.quantity : undefined} /></div>
                          <div className="col-span-2 flex items-center justify-end">
                            <button type="button" onClick={() => { const ms = paymentForm.materials.filter((_, i) => i !== mi); setPaymentForm(f => ({ ...f, materials: ms })); }} className="text-red-500 text-xs hover:underline">移除</button>
                          </div>
                        </div>
                        {selMat && <div className="text-xs text-gray-500">單價 {selMat.unitPrice} × {mat.quantity || 0} = {((parseFloat(mat.quantity) || 0) * selMat.unitPrice).toLocaleString()}</div>}
                        <input placeholder="備註" value={mat.note || ''} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], note: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs mt-1" />
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={paymentSaving}>取消</button>
              <button onClick={async () => {
                if (!paymentForm.netAmount || parseFloat(paymentForm.netAmount) <= 0) { showToast('請填寫應付金額', 'error'); return; }
                setPaymentSaving(true);
                try {
                  if (editingPaymentOrder) {
                    // Edit existing payment order
                    const res = await fetch(`/api/payment-orders/${editingPaymentOrder.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        paymentMethod: paymentForm.paymentMethod,
                        netAmount: parseFloat(paymentForm.netAmount), amount: parseFloat(paymentForm.amount || paymentForm.netAmount),
                        supplierName: paymentForm.supplierName || null,
                        dueDate: paymentForm.dueDate || null, accountId: paymentForm.accountId || null,
                        summary: paymentForm.summary || null, note: paymentForm.note || null,
                        status: '待出納',
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || data.message || '更新失敗');
                    setShowPaymentModal(false); setEditingPaymentOrder(null);
                    fetchPaymentOrders();
                    showToast('付款單已更新', 'success');
                  } else {
                    // Create new payment order
                    const res = await fetch('/api/payment-orders', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        invoiceIds: [], paymentMethod: paymentForm.paymentMethod,
                        netAmount: parseFloat(paymentForm.netAmount), amount: parseFloat(paymentForm.amount || paymentForm.netAmount),
                        discount: 0, supplierId: paymentForm.supplierId || null, supplierName: paymentForm.supplierName || null,
                        dueDate: paymentForm.dueDate || null, accountId: paymentForm.accountId || null,
                        summary: paymentForm.summary || null, note: paymentForm.note || null,
                        status: '待出納', sourceType: 'engineering',
                        sourceRecordId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                        warehouse: paymentForm.warehouse || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error?.message || '建立失敗');
                    // Create material requisition records from selected contract materials
                    const selContract = paymentForm.contractId ? contracts.find(c => c.id === Number(paymentForm.contractId)) : null;
                    const contractMats = selContract?.materials || [];
                    const matRows = (paymentForm.materials || []).filter(m => m.materialId && parseFloat(m.quantity) > 0);
                    if (matRows.length > 0) {
                      const projId = selContract?.projectId || (paymentForm.projectId ? parseInt(paymentForm.projectId) : null);
                      for (const mat of matRows) {
                        const cm = contractMats.find(c => c.id === Number(mat.materialId));
                        if (!cm) continue;
                        const qty = parseFloat(mat.quantity) || 0;
                        await fetch('/api/engineering/materials', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            projectId: projId, contractId: paymentForm.contractId ? parseInt(paymentForm.contractId) : null,
                            termId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                            description: cm.description, quantity: qty, unit: cm.unit || '式', unitPrice: cm.unitPrice,
                            usedAt: new Date().toISOString().slice(0, 10),
                            note: mat.note?.trim() || `付款單 ${data.paymentNo || ''} 領用`,
                          }),
                        });
                      }
                      fetchMaterials(filterProjectId || undefined);
                    }
                    setShowPaymentModal(false);
                    fetchPaymentOrders();
                    if (activeTab === 'contracts' || activeTab === 'projectMgmt') fetchContracts(filterProjectId || undefined);
                    showToast('付款單已建立，請至出納執行付款（出納付款後自動更新期數狀態）', 'success');
                  }
                } catch (e) { showToast(e.message || '儲存失敗', 'error'); }
                finally { setPaymentSaving(false); }
              }} disabled={paymentSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{paymentSaving ? '儲存中…' : (editingPaymentOrder ? '儲存' : '儲存並送交出納')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 材料 Modal ===== */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingMaterial ? '編輯材料' : '新增材料'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">工程案 *</label><select value={materialForm.projectId} onChange={e => setMaterialForm(f => ({ ...f, projectId: e.target.value, contractId: '', termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingMaterial}><option value="">請選擇</option>{projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">合約（選填）</label><select value={materialForm.contractId} onChange={e => setMaterialForm(f => ({ ...f, contractId: e.target.value, termId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">不關聯合約</option>{contracts.filter(c => !materialForm.projectId || c.projectId === parseInt(materialForm.projectId)).map(c => <option key={c.id} value={c.id}>{c.contractNo} - {c.supplier?.name}</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">期別（選填）</label><select value={materialForm.termId} onChange={e => setMaterialForm(f => ({ ...f, termId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!materialForm.contractId}><option value="">不關聯期別</option>{getTermsForContract(materialForm.contractId).map(t => <option key={t.id} value={t.id}>{t.termName || `第${t.termNo}期`} ({formatNum(t.amount)})</option>)}</select></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">產品（選填，可改為手動說明）</label><select value={materialForm.productId} onChange={e => setMaterialForm(f => ({ ...f, productId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">手動輸入說明</option>{products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-1">說明（無產品時填寫）</label><input value={materialForm.description} onChange={e => setMaterialForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="材料名稱或規格" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">數量 *</label><input type="number" value={materialForm.quantity} onChange={e => setMaterialForm(f => ({ ...f, quantity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.0001" min="0" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">單位</label><input value={materialForm.unit} onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：式、m²" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">單價</label><input type="number" value={materialForm.unitPrice} onChange={e => setMaterialForm(f => ({ ...f, unitPrice: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">使用日期</label><input type="date" value={materialForm.usedAt} onChange={e => setMaterialForm(f => ({ ...f, usedAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-1">備註</label><input value={materialForm.note} onChange={e => setMaterialForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMaterialModal(false)} className="px-4 py-2 border rounded-lg text-sm" disabled={materialSaving}>取消</button>
              <button onClick={saveMaterial} disabled={materialSaving} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50">{materialSaving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Engineering cashier execute modal ── */}
    </div>
  );
}
