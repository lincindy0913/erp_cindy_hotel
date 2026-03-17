'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import AttachmentSection from '@/components/AttachmentSection';
import { useToast } from '@/context/ToastContext';

const TABS = [
  { key: 'projects', label: '工程案' },
  { key: 'projectMgmt', label: '專案管理' },
  { key: 'contracts', label: '合約與期數' },
  { key: 'materials', label: '材料使用' },
  { key: 'payments', label: '付款單' },
];

const PROJECT_STATUS = ['進行中', '已結案', '暫停'];

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

  const [projectForm, setProjectForm] = useState({ code: '', name: '', clientName: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
  const [contractForm, setContractForm] = useState({ projectId: '', supplierId: '', contractNo: '', totalAmount: '', signDate: '', content: '', note: '', terms: [], materials: [] });
  const [materialForm, setMaterialForm] = useState({ projectId: '', productId: '', contractId: '', termId: '', description: '', quantity: '', unit: '', unitPrice: '', usedAt: '', note: '' });
  const [termForm, setTermForm] = useState({ termName: '', amount: '', dueDate: '', status: 'pending', paidAt: '', paymentOrderId: '', note: '' });

  const [filterProjectId, setFilterProjectId] = useState('');
  const [warehouseDepartments, setWarehouseDepartments] = useState({ list: [], byName: {} });
  const [paymentOrders, setPaymentOrders] = useState([]);
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
  const { data: session } = useSession();
  const { showToast } = useToast();

  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
    fetchProducts();
    fetchWarehouseDepartments();
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
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products');
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

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  function openAddProject() {
    setEditingProject(null);
    setProjectForm({ code: '', name: '', clientName: '', startDate: '', endDate: '', budget: '', status: '進行中', warehouseId: '', departmentId: '', location: '', buildingNo: '', permitNo: '', note: '' });
    setShowProjectModal(true);
  }

  function openEditProject(p) {
    setEditingProject(p);
    setProjectForm({
      code: p.code, name: p.name, clientName: p.clientName || '',
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="engineering" />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">工程會計</h2>
          <p className="text-sm text-gray-500 mt-1">營造工程案、廠商合約期數付款、材料使用追蹤（一般人事／廠商請款請至「付款」「費用」）</p>
        </div>

        <div className="flex gap-1 mb-6 bg-white rounded-lg shadow p-1">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">工程案列表</h3>
              <button onClick={openAddProject} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 新增工程案</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">代碼</th><th className="px-4 py-2 text-left">名稱</th>
                    <th className="px-4 py-2 text-left">業主</th><th className="px-4 py-2 text-left">館別／部門</th>
                    <th className="px-4 py-2 text-left">工程地點／建造(使)造號碼</th><th className="px-4 py-2 text-left">起訖</th>
                    <th className="px-4 py-2 text-right">預算</th><th className="px-4 py-2 text-left">狀態</th>
                    <th className="px-4 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {projects.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無工程案，請新增</td></tr>
                  ) : projects.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">{p.code}</td>
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="px-4 py-2">{p.clientName || '－'}</td>
                      <td className="px-4 py-2">{p.warehouseRef?.name || p.warehouse || '－'} {p.departmentRef ? `／${p.departmentRef.name}` : ''}</td>
                      <td className="px-4 py-2 text-xs">{p.location || '－'} {(p.buildingNo || p.permitNo) ? `（${[p.buildingNo, p.permitNo].filter(Boolean).join('、')}）` : ''}</td>
                      <td className="px-4 py-2">{p.startDate || '－'} ～ {p.endDate || '－'}</td>
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
                      <th className="px-4 py-2 text-left">工程案</th><th className="px-4 py-2 text-left">合約編號</th>
                      <th className="px-4 py-2 text-left">廠商</th><th className="px-4 py-2 text-right">合約金額</th>
                      <th className="px-4 py-2 text-left">狀態</th><th className="px-4 py-2 text-left">簽約日</th>
                      <th className="px-4 py-2 text-center">期數／付款</th><th className="px-4 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contracts.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">尚無合約或請選擇工程案</td></tr>
                    ) : contracts.map(c => {
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
                            <div className="space-y-1.5">
                              {(c.terms || []).map(t => {
                                const termMaterials = (c.materials || []).filter(m => m.termId === t.id);
                                const termPOs = paymentOrders.filter(po => po.sourceRecordId === t.id);
                                const paidPOs = termPOs.filter(po => po.status === '已付款');
                                const pendingPOs = termPOs.filter(po => po.status === '待出納');
                                const paidAmount = paidPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
                                const pendingAmount = pendingPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
                                const termAmt = Number(t.amount);
                                const unpaidAmount = termAmt - paidAmount;
                                const isFullyPaid = paidAmount >= termAmt && termAmt > 0;
                                const isPartial = paidAmount > 0 && !isFullyPaid;
                                return (
                                <div key={t.id} className="border-b border-gray-100 pb-1.5 last:border-0">
                                  <div className="flex items-center gap-2 text-xs flex-wrap">
                                    <span className="font-medium">{t.termName || `第${t.termNo}期`}</span>
                                    <span className="text-gray-500">期款 {formatNum(termAmt)}</span>
                                    <span className={isFullyPaid ? 'text-green-600 font-medium' : isPartial ? 'text-blue-600 font-medium' : 'text-amber-600'}>
                                      {isFullyPaid ? '已付清' : isPartial ? '部分付款' : '待付款'}
                                    </span>
                                    {!isFullyPaid && <button onClick={() => openMarkTermPaid(t)} className="text-amber-600 hover:underline">標記已付</button>}
                                    {isFullyPaid && <button onClick={() => openUnmarkTermPaid(t)} className="text-gray-400 hover:text-red-600 hover:underline text-xs">取消</button>}
                                  </div>
                                  {/* 付款明細 */}
                                  {(isPartial || isFullyPaid) && (
                                    <div className="pl-3 mt-0.5 space-y-0.5">
                                      <div className="grid grid-cols-3 gap-1 text-xs">
                                        <span className="text-green-700 font-medium">已付：{formatNum(paidAmount)}</span>
                                        <span className={`font-medium ${unpaidAmount > 0 ? 'text-amber-600' : 'text-green-600'}`}>未付：{formatNum(Math.max(0, unpaidAmount))}</span>
                                        {pendingAmount > 0 && <span className="text-orange-500">待出納：{formatNum(pendingAmount)}</span>}
                                      </div>
                                      {paidPOs.map((po, pi) => (
                                        <div key={pi} className="text-xs text-gray-500 flex gap-2">
                                          <span className="font-mono">{po.paymentNo}</span>
                                          <span>{po.dueDate || po.createdAt?.slice(0,10) || ''}</span>
                                          <span className="text-green-600">{formatNum(Number(po.amount))}</span>
                                          <span className="text-gray-400">{po.paymentMethod || ''}</span>
                                        </div>
                                      ))}
                                      {pendingPOs.map((po, pi) => (
                                        <div key={`p${pi}`} className="text-xs text-orange-500 flex gap-2">
                                          <span className="font-mono">{po.paymentNo}</span>
                                          <span>{po.dueDate || ''}</span>
                                          <span>{formatNum(Number(po.amount))}</span>
                                          <span className="text-orange-400">待出納</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {t.content && <div className="text-xs text-gray-500 pl-2 mt-0.5">內容：{t.content}</div>}
                                  {t.note && <div className="text-xs text-gray-400 pl-2">備註：{t.note}</div>}
                                  {termMaterials.length > 0 && (
                                    <div className="text-xs text-blue-600 pl-2 mt-0.5">
                                      領用：{termMaterials.map(m => `${m.description || (m.product ? `${m.product.code} ${m.product.name}` : '—')} ×${Number(m.quantity)}`).join('、')}
                                    </div>
                                  )}
                                </div>
                              )})}
                            </div>
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
                  const tPOs = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已付款');
                  return ts + tPOs.reduce((ps, po) => ps + Number(po.amount || 0), 0);
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
                              const tPaid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已付款').reduce((ps, po) => ps + Number(po.amount || 0), 0);
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
            <div className="flex gap-3 mb-4 items-center">
              <button onClick={() => { setEditingPaymentOrder(null); setPaymentForm({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: new Date().toISOString().slice(0, 10), summary: '', note: '', materials: [] }); setShowPaymentModal(true); }} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 建立付款單</button>
              <Link href="/cashier" className="text-sm text-amber-600 hover:underline">→ 至出納執行付款</Link>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-800">工程付款單（連動出納）</h3>
                <p className="text-xs text-gray-500 mt-1">存檔後至「出納」執行付款；出納付款完成後自動標記對應合約期數為已付</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">付款單號</th><th className="px-4 py-2 text-left">摘要</th><th className="px-4 py-2 text-left">廠商</th><th className="px-4 py-2 text-right">金額</th><th className="px-4 py-2 text-left">狀態</th><th className="px-4 py-2 text-center">操作</th></tr></thead>
                  <tbody className="divide-y">
                    {paymentOrders.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">尚無工程付款單</td></tr>
                    ) : paymentOrders.map(o => {
                      const isExecuted = o.status === '已執行';
                      return (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{o.orderNo}</td>
                          <td className="px-4 py-2">{o.summary || '－'}</td>
                          <td className="px-4 py-2">{o.supplierName || '－'}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNum(o.netAmount)}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${isExecuted ? 'bg-green-100 text-green-700' : o.status === '待出納' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100'}`}>{o.status}</span></td>
                          <td className="px-4 py-2 text-center">
                            {isExecuted ? <span className="text-xs text-gray-400">已付款 (不可修改)</span> : (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => {
                                  setEditingPaymentOrder(o);
                                  setPaymentForm({
                                    projectId: '', termId: o.sourceRecordId ? String(o.sourceRecordId) : '', contractId: '',
                                    supplierId: o.supplierId ? String(o.supplierId) : '', supplierName: o.supplierName || '',
                                    amount: String(o.amount || o.netAmount), netAmount: String(o.netAmount),
                                    paymentMethod: o.paymentMethod || '轉帳', accountId: o.accountId ? String(o.accountId) : '',
                                    dueDate: o.dueDate || '', summary: o.summary || '', note: o.note || '',
                                  });
                                  setShowPaymentModal(true);
                                }} className="text-amber-600 hover:underline text-xs">編輯</button>
                                <Link href="/cashier" className="text-teal-600 hover:underline text-xs">出納</Link>
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
                      <th className="px-4 py-2 text-left">工程案</th><th className="px-4 py-2 text-left">合約</th>
                      <th className="px-4 py-2 text-left">期別</th><th className="px-4 py-2 text-left">品項／說明</th>
                      <th className="px-4 py-2 text-right">數量</th><th className="px-4 py-2 text-left">單位</th>
                      <th className="px-4 py-2 text-right">單價</th><th className="px-4 py-2 text-right">小計</th>
                      <th className="px-4 py-2 text-right">領用</th>
                      <th className="px-4 py-2 text-left">使用日</th><th className="px-4 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materials.length === 0 ? (
                      <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">尚無材料記錄或請選擇工程案</td></tr>
                    ) : materials.map(m => {
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
                          <td className="px-4 py-2 text-right">{m.usedAt ? <span className="text-green-600 font-medium">{formatNum(m.quantity)}</span> : <span className="text-gray-400">0</span>}</td>
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
              <div><label className="block text-xs text-gray-500 mb-1">業主／客戶</label><input value={projectForm.clientName} onChange={e => setProjectForm(f => ({ ...f, clientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
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
                    const termPaidAmt = paymentOrders.filter(po => po.sourceRecordId === tid && (po.status === '已付款' || po.status === '待出納')).reduce((s, po) => s + Number(po.amount || 0), 0);
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
                      const paid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已付款').reduce((s, po) => s + Number(po.amount || 0), 0);
                      return paid < Number(t.amount); // show terms not fully paid by actual amount
                    }).map(t => {
                      const paidAmt = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已付款').reduce((s, po) => s + Number(po.amount || 0), 0);
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
                const selPaidPOs = paymentOrders.filter(po => po.sourceRecordId === selTerm.id && po.status === '已付款');
                const selPaidAmt = selPaidPOs.reduce((s, po) => s + Number(po.amount || 0), 0);
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
                      <div key={i} className="text-gray-500 pl-2">• {po.paymentNo} {po.dueDate || ''} {formatNum(Number(po.amount))} {po.paymentMethod || ''}</div>
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
              {/* 領用材料 */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs text-gray-500">領用材料</label>
                  <button type="button" onClick={() => setPaymentForm(f => ({ ...f, materials: [...f.materials, { description: '', quantity: '', amount: '', note: '' }] }))} className="text-amber-600 text-xs hover:underline">＋ 新增材料</button>
                </div>
                {paymentForm.materials.length > 0 && (
                  <div className="space-y-2">
                    {paymentForm.materials.map((mat, mi) => (
                      <div key={mi} className="border rounded-lg p-2 bg-gray-50">
                        <div className="grid grid-cols-4 gap-2 mb-1">
                          <div className="col-span-2"><input placeholder="材料名稱" value={mat.description} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], description: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs" /></div>
                          <div><input placeholder="數量" type="number" value={mat.quantity} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], quantity: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs" /></div>
                          <div><input placeholder="金額" type="number" value={mat.amount} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], amount: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="w-full border rounded px-2 py-1 text-xs" /></div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input placeholder="備註" value={mat.note} onChange={e => { const ms = [...paymentForm.materials]; ms[mi] = { ...ms[mi], note: e.target.value }; setPaymentForm(f => ({ ...f, materials: ms })); }} className="flex-1 border rounded px-2 py-1 text-xs" />
                          <button type="button" onClick={() => { const ms = paymentForm.materials.filter((_, i) => i !== mi); setPaymentForm(f => ({ ...f, materials: ms })); }} className="text-red-500 text-xs hover:underline">移除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                    // Create material records if any
                    const matRows = (paymentForm.materials || []).filter(m => m.description?.trim() && parseFloat(m.quantity) > 0);
                    if (matRows.length > 0) {
                      const contract = paymentForm.contractId ? contracts.find(c => c.id === Number(paymentForm.contractId)) : null;
                      const projId = contract?.projectId || (paymentForm.projectId ? parseInt(paymentForm.projectId) : null);
                      for (const mat of matRows) {
                        const qty = parseFloat(mat.quantity) || 0;
                        const amt = parseFloat(mat.amount) || 0;
                        const unitPrice = qty > 0 ? amt / qty : 0;
                        await fetch('/api/engineering/materials', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            projectId: projId, contractId: paymentForm.contractId ? parseInt(paymentForm.contractId) : null,
                            termId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                            description: mat.description.trim(), quantity: qty, unit: '式', unitPrice,
                            usedAt: new Date().toISOString().slice(0, 10),
                            note: mat.note?.trim() || `付款單 ${data.paymentNo || ''}`,
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
    </div>
  );
}
