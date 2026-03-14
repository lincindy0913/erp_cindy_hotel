'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import AttachmentSection from '@/components/AttachmentSection';

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
  const [materialForm, setMaterialForm] = useState({ projectId: '', productId: '', description: '', quantity: '', unit: '', unitPrice: '', usedAt: '', note: '' });
  const [termForm, setTermForm] = useState({ termName: '', amount: '', dueDate: '', status: 'pending', paidAt: '', paymentOrderId: '', note: '' });

  const [filterProjectId, setFilterProjectId] = useState('');
  const [warehouseDepartments, setWarehouseDepartments] = useState({ list: [], byName: {} });
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡']);
  const [showContractUploadModal, setShowContractUploadModal] = useState(false);
  const [contractForUpload, setContractForUpload] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: '', summary: '', note: '' });
  const { data: session } = useSession();

  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
    fetchProducts();
    fetchWarehouseDepartments();
  }, []);

  useEffect(() => {
    if (activeTab === 'contracts') fetchContracts(filterProjectId || undefined);
    if (activeTab === 'materials') fetchMaterials(filterProjectId || undefined);
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
      code: p.code,
      name: p.name,
      clientName: p.clientName || '',
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      budget: p.budget != null ? String(p.budget) : '',
      status: p.status || '進行中',
      warehouseId: p.warehouseId != null ? String(p.warehouseId) : '',
      departmentId: p.departmentId != null ? String(p.departmentId) : '',
      location: p.location || '',
      buildingNo: p.buildingNo || '',
      permitNo: p.permitNo || '',
      note: p.note || '',
    });
    setShowProjectModal(true);
  }

  async function saveProject() {
    if (!projectForm.code?.trim() || !projectForm.name?.trim()) {
      alert('請填寫工程代碼與名稱');
      return;
    }
    try {
      const body = {
        code: projectForm.code.trim(),
        name: projectForm.name.trim(),
        clientName: projectForm.clientName?.trim() || null,
        startDate: projectForm.startDate || null,
        endDate: projectForm.endDate || null,
        budget: projectForm.budget ? parseFloat(projectForm.budget) : null,
        status: projectForm.status,
        warehouseId: projectForm.warehouseId || null,
        departmentId: projectForm.departmentId || null,
        location: projectForm.location?.trim() || null,
        buildingNo: projectForm.buildingNo?.trim() || null,
        permitNo: projectForm.permitNo?.trim() || null,
        note: projectForm.note?.trim() || null,
      };
      if (editingProject) {
        await fetch(`/api/engineering/projects/${editingProject.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        alert('已更新');
      } else {
        await fetch('/api/engineering/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        alert('已新增');
      }
      setShowProjectModal(false);
      fetchProjects();
    } catch (e) {
      alert(e.message || '儲存失敗');
    }
  }

  async function deleteProject(p) {
    if (!confirm(`確定刪除工程案「${p.name}」？其合約與材料記錄也會一併刪除。`)) return;
    try {
      await fetch(`/api/engineering/projects/${p.id}`, { method: 'DELETE' });
      fetchProjects();
      if (filterProjectId === String(p.id)) setFilterProjectId('');
    } catch (e) { alert('刪除失敗'); }
  }

  function openAddContract() {
    setEditingContract(null);
    setContractForm({
      projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      supplierId: '',
      contractNo: '',
      totalAmount: '',
      signDate: '',
      content: '',
      note: '',
      terms: [{ termName: '第1期', amount: '', dueDate: '', note: '' }],
      materials: [{ materialName: '', quantity: '', amount: '' }],
    });
    setShowContractModal(true);
  }

  function openEditContract(c) {
    setEditingContract(c);
    const matList = (c.materials || []).length ? (c.materials || []).map(m => ({
      materialName: m.description || '',
      quantity: String(m.quantity ?? ''),
      amount: String((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0)),
    })) : [{ materialName: '', quantity: '', amount: '' }];
    setContractForm({
      projectId: String(c.projectId),
      supplierId: String(c.supplierId),
      contractNo: c.contractNo,
      totalAmount: String(c.totalAmount ?? ''),
      signDate: c.signDate || '',
      content: c.content || '',
      note: c.note || '',
      terms: (c.terms || []).map(t => ({ termName: t.termName || `第${t.termNo}期`, amount: String(t.amount), dueDate: t.dueDate || '', note: t.note || '' })),
      materials: matList,
    });
    setShowContractModal(true);
  }

  function addContractMaterialRow() {
    setContractForm(f => ({ ...f, materials: [...f.materials, { materialName: '', quantity: '', amount: '' }] }));
  }

  function removeContractMaterialRow(i) {
    setContractForm(f => ({ ...f, materials: f.materials.filter((_, idx) => idx !== i) }));
  }

  function updateContractMaterial(i, field, value) {
    setContractForm(f => ({
      ...f,
      materials: f.materials.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)),
    }));
  }

  function openUploadContract(c) {
    setContractForUpload(c);
    setShowContractUploadModal(true);
  }

  function addContractTermRow() {
    const n = contractForm.terms.length + 1;
    setContractForm(f => ({ ...f, terms: [...f.terms, { termName: `第${n}期`, amount: '', dueDate: '', note: '' }] }));
  }

  function removeContractTermRow(i) {
    setContractForm(f => ({ ...f, terms: f.terms.filter((_, idx) => idx !== i) }));
  }

  function updateContractTerm(i, field, value) {
    setContractForm(f => ({
      ...f,
      terms: f.terms.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)),
    }));
  }

  async function saveContract() {
    if (!contractForm.projectId || !contractForm.supplierId || !contractForm.contractNo?.trim()) {
      alert('請填寫工程案、廠商、合約編號');
      return;
    }
    if (!contractForm.content?.trim()) {
      alert('請填寫合約內容後再存檔');
      return;
    }
    if (!contractForm.note?.trim()) {
      alert('請填寫備註後再存檔');
      return;
    }
    try {
      const body = {
        projectId: parseInt(contractForm.projectId),
        supplierId: parseInt(contractForm.supplierId),
        contractNo: contractForm.contractNo.trim(),
        totalAmount: parseFloat(contractForm.totalAmount) || 0,
        signDate: contractForm.signDate || null,
        content: contractForm.content?.trim() || null,
        note: contractForm.note?.trim() || null,
        terms: contractForm.terms.map((t, i) => ({
          termName: t.termName || `第${i + 1}期`,
          amount: parseFloat(t.amount) || 0,
          dueDate: t.dueDate || null,
          note: t.note?.trim() || null,
        })).filter(t => t.amount > 0),
        materials: (contractForm.materials || []).map(m => ({
          materialName: (m.materialName || '').trim(),
          quantity: parseFloat(m.quantity) || 0,
          amount: parseFloat(m.amount) || 0,
        })).filter(m => m.materialName && m.quantity > 0),
      };
      if (editingContract) {
        await fetch(`/api/engineering/contracts/${editingContract.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractNo: body.contractNo, totalAmount: body.totalAmount, signDate: body.signDate, content: body.content, note: body.note, materials: body.materials }) });
        alert('合約已更新（期數請於列表內編輯）');
      } else {
        await fetch('/api/engineering/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        alert('已新增合約');
      }
      setShowContractModal(false);
      fetchContracts(filterProjectId || undefined);
      if (activeTab === 'materials' || !editingContract) fetchMaterials(filterProjectId || undefined);
    } catch (e) {
      alert(e.message || '儲存失敗');
    }
  }

  async function deleteContract(c) {
    if (!confirm(`確定刪除合約「${c.contractNo}」？`)) return;
    try {
      await fetch(`/api/engineering/contracts/${c.id}`, { method: 'DELETE' });
      fetchContracts(filterProjectId || undefined);
    } catch (e) { alert('刪除失敗'); }
  }

  function openMarkTermPaid(term, contract) {
    setEditingTerm(term);
    setTermForm({
      termName: term.termName || '',
      amount: String(term.amount),
      dueDate: term.dueDate || '',
      status: 'paid',
      paidAt: new Date().toISOString().slice(0, 10),
      paymentOrderId: term.paymentOrderId ? String(term.paymentOrderId) : '',
      note: term.note || '',
    });
    setShowTermModal(true);
  }

  async function saveTerm() {
    if (!editingTerm) return;
    try {
      await fetch(`/api/engineering/contract-terms/${editingTerm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: termForm.status,
          paidAt: termForm.paidAt || null,
          paymentOrderId: termForm.paymentOrderId ? parseInt(termForm.paymentOrderId) : null,
          termName: termForm.termName || null,
          dueDate: termForm.dueDate || null,
          note: termForm.note || null,
        }),
      });
      setShowTermModal(false);
      fetchContracts(filterProjectId || undefined);
    } catch (e) { alert('更新失敗'); }
  }

  function openAddMaterial() {
    setEditingMaterial(null);
    setMaterialForm({
      projectId: filterProjectId || (projects[0]?.id ? String(projects[0].id) : ''),
      productId: '',
      description: '',
      quantity: '',
      unit: '',
      unitPrice: '',
      usedAt: new Date().toISOString().slice(0, 10),
      note: '',
    });
    setShowMaterialModal(true);
  }

  function openEditMaterial(m) {
    setEditingMaterial(m);
    setMaterialForm({
      projectId: String(m.projectId),
      productId: m.productId ? String(m.productId) : '',
      description: m.description || '',
      quantity: String(m.quantity),
      unit: m.unit || '',
      unitPrice: String(m.unitPrice ?? ''),
      usedAt: m.usedAt || '',
      note: m.note || '',
    });
    setShowMaterialModal(true);
  }

  async function saveMaterial() {
    if (!materialForm.projectId || !materialForm.quantity || parseFloat(materialForm.quantity) <= 0) {
      alert('請選擇工程案並填寫數量');
      return;
    }
    try {
      const body = {
        projectId: parseInt(materialForm.projectId),
        productId: materialForm.productId ? parseInt(materialForm.productId) : null,
        description: materialForm.description?.trim() || null,
        quantity: parseFloat(materialForm.quantity),
        unit: materialForm.unit?.trim() || null,
        unitPrice: parseFloat(materialForm.unitPrice) || 0,
        usedAt: materialForm.usedAt || null,
        note: materialForm.note?.trim() || null,
      };
      if (editingMaterial) {
        await fetch(`/api/engineering/materials/${editingMaterial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        alert('已更新');
      } else {
        await fetch('/api/engineering/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        alert('已新增');
      }
      setShowMaterialModal(false);
      fetchMaterials(filterProjectId || undefined);
    } catch (e) { alert('儲存失敗'); }
  }

  async function deleteMaterial(m) {
    if (!confirm('確定刪除此筆材料？')) return;
    try {
      await fetch(`/api/engineering/materials/${m.id}`, { method: 'DELETE' });
      fetchMaterials(filterProjectId || undefined);
    } catch (e) { alert('刪除失敗'); }
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
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium ${activeTab === tab.key ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && activeTab === 'projects' && (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" /></div>
        )}

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
                    <th className="px-4 py-2 text-left">代碼</th>
                    <th className="px-4 py-2 text-left">名稱</th>
                    <th className="px-4 py-2 text-left">業主</th>
                    <th className="px-4 py-2 text-left">館別／部門</th>
                    <th className="px-4 py-2 text-left">工程地點／建造(使)造號碼</th>
                    <th className="px-4 py-2 text-left">起訖</th>
                    <th className="px-4 py-2 text-right">預算</th>
                    <th className="px-4 py-2 text-left">狀態</th>
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
                      <th className="px-4 py-2 text-left">工程案</th>
                      <th className="px-4 py-2 text-left">合約編號</th>
                      <th className="px-4 py-2 text-left">廠商</th>
                      <th className="px-4 py-2 text-right">合約金額</th>
                      <th className="px-4 py-2 text-left">簽約日</th>
                      <th className="px-4 py-2 text-center">期數／付款</th>
                      <th className="px-4 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {contracts.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">尚無合約或請選擇工程案</td></tr>
                    ) : contracts.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{c.project?.code} {c.project?.name}</td>
                        <td className="px-4 py-2 font-mono">{c.contractNo}</td>
                        <td className="px-4 py-2">{c.supplier?.name}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatNum(c.totalAmount)}</td>
                        <td className="px-4 py-2">{c.signDate || '－'}</td>
                        <td className="px-4 py-2">
                          <div className="space-y-1">
                            {(c.terms || []).map(t => (
                              <div key={t.id} className="flex items-center gap-2 text-xs">
                                <span>{t.termName || `第${t.termNo}期`}</span>
                                <span className="text-gray-500">{formatNum(t.amount)}</span>
                                <span className={t.status === 'paid' ? 'text-green-600' : 'text-amber-600'}>{t.status === 'paid' ? '已付款' : '待付款'}</span>
                                {t.status !== 'paid' && (
                                  <button onClick={() => openMarkTermPaid(t, c)} className="text-amber-600 hover:underline">標記已付</button>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => openUploadContract(c)} className="text-blue-600 hover:underline mr-2">上傳合約</button>
                          <button onClick={() => openEditContract(c)} className="text-amber-600 hover:underline mr-2">編輯</button>
                          <button onClick={() => deleteContract(c)} className="text-red-600 hover:underline">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'projectMgmt' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">專案管理：各工程案廠商進度</h3>
              <p className="text-xs text-gray-500 mt-1">依工程案檢視每家廠商合約期數與付款進度</p>
            </div>
            <div className="p-4 space-y-6">
              {projects.length === 0 ? (
                <p className="text-gray-400 text-center py-8">尚無工程案</p>
              ) : (
                projects.map(proj => {
                  const projContracts = contracts.filter(c => c.projectId === proj.id);
                  return (
                    <div key={proj.id} className="border rounded-lg p-4 bg-gray-50/50">
                      <div className="font-medium text-gray-800 mb-2">{proj.code} {proj.name}</div>
                      {projContracts.length === 0 ? (
                        <p className="text-sm text-gray-400">尚無合約</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-gray-500"><th className="pb-2">廠商</th><th className="pb-2">合約編號</th><th className="pb-2 text-right">合約金額</th><th className="pb-2 text-center">期數進度</th><th className="pb-2 text-right">已付／總額</th></tr></thead>
                          <tbody>
                            {projContracts.map(c => {
                              const terms = c.terms || [];
                              const paid = terms.filter(t => t.status === 'paid');
                              const paidSum = paid.reduce((s, t) => s + Number(t.amount), 0);
                              const totalSum = terms.reduce((s, t) => s + Number(t.amount), 0);
                              return (
                                <tr key={c.id} className="border-t">
                                  <td className="py-2">{c.supplier?.name}</td>
                                  <td className="py-2 font-mono">{c.contractNo}</td>
                                  <td className="py-2 text-right">{formatNum(c.totalAmount)}</td>
                                  <td className="py-2 text-center">{paid.length}／{terms.length} 期</td>
                                  <td className="py-2 text-right">{formatNum(paidSum)}／{formatNum(totalSum)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <>
            <div className="flex gap-3 mb-4 items-center">
              <button onClick={() => { setPaymentForm({ projectId: '', termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', paymentMethod: '轉帳', accountId: '', dueDate: new Date().toISOString().slice(0, 10), summary: '', note: '' }); setShowPaymentModal(true); }} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">＋ 建立付款單</button>
              <Link href="/cashier" className="text-sm text-amber-600 hover:underline">→ 至出納執行付款</Link>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-800">工程付款單（連動出納）</h3>
                <p className="text-xs text-gray-500 mt-1">存檔後至「出納」執行付款；若付款對應合約期數將自動標記已付</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">付款單號</th><th className="px-4 py-2 text-left">摘要</th><th className="px-4 py-2 text-left">廠商</th><th className="px-4 py-2 text-right">金額</th><th className="px-4 py-2 text-left">狀態</th><th className="px-4 py-2 text-center">操作</th></tr></thead>
                  <tbody className="divide-y">
                    {paymentOrders.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">尚無工程付款單</td></tr>
                    ) : paymentOrders.map(o => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono">{o.orderNo}</td>
                        <td className="px-4 py-2">{o.summary || '－'}</td>
                        <td className="px-4 py-2">{o.supplierName || '－'}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatNum(o.netAmount)}</td>
                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-xs ${o.status === '已執行' ? 'bg-green-100' : o.status === '待出納' ? 'bg-amber-100' : 'bg-gray-100'}`}>{o.status}</span></td>
                        <td className="px-4 py-2 text-center"><Link href="/cashier" className="text-amber-600 hover:underline">出納</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

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
                      <th className="px-4 py-2 text-left">工程案</th>
                      <th className="px-4 py-2 text-left">合約</th>
                      <th className="px-4 py-2 text-left">品項／說明</th>
                      <th className="px-4 py-2 text-right">數量</th>
                      <th className="px-4 py-2 text-left">單位</th>
                      <th className="px-4 py-2 text-right">單價</th>
                      <th className="px-4 py-2 text-right">小計</th>
                      <th className="px-4 py-2 text-left">使用日</th>
                      <th className="px-4 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {materials.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無材料記錄或請選擇工程案</td></tr>
                    ) : materials.map(m => {
                      const q = Number(m.quantity);
                      const u = Number(m.unitPrice);
                      const sub = q * u;
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{m.project?.code}</td>
                          <td className="px-4 py-2 text-gray-600">{m.contractNo || '－'}</td>
                          <td className="px-4 py-2">{m.product ? `${m.product.code} ${m.product.name}` : (m.description || '－')}</td>
                          <td className="px-4 py-2 text-right">{formatNum(m.quantity)}</td>
                          <td className="px-4 py-2">{m.unit || '－'}</td>
                          <td className="px-4 py-2 text-right">{formatNum(m.unitPrice)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatNum(sub)}</td>
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

      {/* 工程案 Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingProject ? '編輯工程案' : '新增工程案'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">工程代碼 *</label>
                  <input value={projectForm.code} onChange={e => setProjectForm(f => ({ ...f, code: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：PRJ-001" disabled={!!editingProject} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">名稱 *</label>
                  <input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="工程案名稱" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">業主／客戶</label>
                <input value={projectForm.clientName} onChange={e => setProjectForm(f => ({ ...f, clientName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">開始日期</label>
                  <input type="date" value={projectForm.startDate} onChange={e => setProjectForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                  <input type="date" value={projectForm.endDate} onChange={e => setProjectForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">預算</label>
                  <input type="number" value={projectForm.budget} onChange={e => setProjectForm(f => ({ ...f, budget: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">狀態</label>
                  <select value={projectForm.status} onChange={e => setProjectForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {PROJECT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={projectForm.warehouseId} onChange={e => setProjectForm(f => ({ ...f, warehouseId: e.target.value, departmentId: '' }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">請選擇</option>
                    {(warehouseDepartments.list || []).filter(w => w.type === 'building').map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">部門</label>
                  <select value={projectForm.departmentId} onChange={e => setProjectForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">請選擇</option>
                    {projectForm.warehouseId && (() => {
                      const wh = (warehouseDepartments.list || []).find(w => w.id === parseInt(projectForm.warehouseId));
                      const depts = wh?.departments || [];
                      return depts.map(d => (typeof d === 'object' && d.id != null ? <option key={d.id} value={d.id}>{d.name}</option> : <option key={d} value={d}>{d}</option>));
                    })()}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">工程地點</label>
                <input value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="工程所在地點" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">建造號碼</label>
                  <input value={projectForm.buildingNo} onChange={e => setProjectForm(f => ({ ...f, buildingNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">使造號碼</label>
                  <input value={projectForm.permitNo} onChange={e => setProjectForm(f => ({ ...f, permitNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <textarea value={projectForm.note} onChange={e => setProjectForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={saveProject} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* 合約 Modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 my-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingContract ? '編輯合約' : '新增合約'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">工程案 *</label>
                  <select value={contractForm.projectId} onChange={e => setContractForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}>
                    <option value="">請選擇</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">廠商 *</label>
                  <select value={contractForm.supplierId} onChange={e => setContractForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract}>
                    <option value="">請選擇</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">合約編號 *</label>
                  <input value={contractForm.contractNo} onChange={e => setContractForm(f => ({ ...f, contractNo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingContract} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">合約總金額</label>
                  <input type="number" value={contractForm.totalAmount} onChange={e => setContractForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">簽約日</label>
                  <input type="date" value={contractForm.signDate} onChange={e => setContractForm(f => ({ ...f, signDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">合約內容 *</label>
                <textarea value={contractForm.content} onChange={e => setContractForm(f => ({ ...f, content: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="請填寫合約內容（必填）" required />
              </div>
              {!editingContract && (
                <>
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-gray-500">付款期數</label>
                    <button type="button" onClick={addContractTermRow} className="text-amber-600 text-sm">＋ 新增一期</button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">期別</th><th className="px-2 py-1 text-right">金額</th><th className="px-2 py-1 text-left">到期日</th><th className="w-8" /></tr></thead>
                      <tbody>
                        {contractForm.terms.map((t, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1"><input value={t.termName} onChange={e => updateContractTerm(i, 'termName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" /></td>
                            <td className="px-2 py-1"><input type="number" value={t.amount} onChange={e => updateContractTerm(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="0.01" /></td>
                            <td className="px-2 py-1"><input type="date" value={t.dueDate} onChange={e => updateContractTerm(i, 'dueDate', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" /></td>
                            <td className="px-2 py-1"><button type="button" onClick={() => removeContractTermRow(i)} className="text-red-500">×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <label className="text-xs text-gray-500">材料（會連動至「材料使用」TAB）</label>
                <button type="button" onClick={addContractMaterialRow} className="text-amber-600 text-sm">＋ 新增一筆</button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">材料名稱</th><th className="px-2 py-1 text-right">數量</th><th className="px-2 py-1 text-right">金額</th><th className="w-8" /></tr></thead>
                  <tbody>
                    {(contractForm.materials || []).map((m, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1"><input value={m.materialName} onChange={e => updateContractMaterial(i, 'materialName', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm" placeholder="材料名稱" /></td>
                        <td className="px-2 py-1"><input type="number" value={m.quantity} onChange={e => updateContractMaterial(i, 'quantity', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="any" min="0" placeholder="0" /></td>
                        <td className="px-2 py-1"><input type="number" value={m.amount} onChange={e => updateContractMaterial(i, 'amount', e.target.value)} className="w-full border rounded px-2 py-0.5 text-sm text-right" step="0.01" min="0" placeholder="0" /></td>
                        <td className="px-2 py-1"><button type="button" onClick={() => removeContractMaterialRow(i)} className="text-red-500">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註 *</label>
                <textarea value={contractForm.note} onChange={e => setContractForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="請填寫備註（必填）" required />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowContractModal(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={saveContract} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* 上傳合約附件 Modal */}
      {showContractUploadModal && contractForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowContractUploadModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">上傳合約檔案</h3>
            <p className="text-sm text-gray-500 mb-4">合約：{contractForUpload.contractNo}（{contractForUpload.supplier?.name}）</p>
            <AttachmentSection sourceModule="engineering_contract" sourceRecordId={contractForUpload.id} canUpload canDelete userEmail={session?.user?.email || ''} />
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowContractUploadModal(false)} className="px-4 py-2 border rounded-lg text-sm">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* 期數標記已付 Modal */}
      {showTermModal && editingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTermModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">標記期數已付款</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">期別</label>
                <input value={termForm.termName} onChange={e => setTermForm(f => ({ ...f, termName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">付款日期</label>
                <input type="date" value={termForm.paidAt} onChange={e => setTermForm(f => ({ ...f, paidAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">付款單 ID（選填，對應付款管理之付款單）</label>
                <input type="number" value={termForm.paymentOrderId} onChange={e => setTermForm(f => ({ ...f, paymentOrderId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={termForm.note} onChange={e => setTermForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowTermModal(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={saveTerm} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* 建立付款單 Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-4" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">建立工程付款單</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">連結合約期數（選填）</label>
                <select
                  value={paymentForm.termId}
                  onChange={e => {
                    const v = e.target.value;
                    if (!v) { setPaymentForm(f => ({ ...f, termId: '', contractId: '', supplierId: '', supplierName: '', amount: '', netAmount: '', summary: '' })); return; }
                    const [tid, cid] = v.split('-').map(Number);
                    const contract = contracts.find(c => c.id === cid);
                    const term = contract?.terms?.find(t => t.id === tid);
                    if (term && contract) {
                      setPaymentForm(f => ({
                        ...f,
                        termId: tid,
                        contractId: cid,
                        supplierId: String(contract.supplierId),
                        supplierName: contract.supplier?.name || '',
                        amount: String(term.amount),
                        netAmount: String(term.amount),
                        summary: `工程 ${contract.project?.code || ''} ${contract.contractNo} ${term.termName || `第${term.termNo}期`}`,
                      }));
                    }
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">一般工程付款（不連結期數）</option>
                  {contracts.filter(c => (c.terms || []).some(t => t.status !== 'paid')).map(c =>
                    (c.terms || []).filter(t => t.status !== 'paid').map(t => (
                      <option key={t.id} value={`${t.id}-${c.id}`}>{c.project?.code} {c.contractNo} － {t.termName || `第${t.termNo}期`} {formatNum(t.amount)}</option>
                    ))
                  ).flat()}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">廠商</label>
                  <input value={paymentForm.supplierName} onChange={e => setPaymentForm(f => ({ ...f, supplierName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="廠商名稱" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">應付金額</label>
                  <input type="number" value={paymentForm.netAmount} onChange={e => setPaymentForm(f => ({ ...f, netAmount: e.target.value, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">摘要</label>
                <input value={paymentForm.summary} onChange={e => setPaymentForm(f => ({ ...f, summary: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：工程案 XXX 第N期款" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">付款方式</label>
                  <select value={paymentForm.paymentMethod} onChange={e => setPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {paymentMethodOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">資金帳戶</label>
                  <select value={paymentForm.accountId} onChange={e => setPaymentForm(f => ({ ...f, accountId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">請選擇</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">預計付款日</label>
                <input type="date" value={paymentForm.dueDate} onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={async () => {
                if (!paymentForm.netAmount || parseFloat(paymentForm.netAmount) <= 0) { alert('請填寫應付金額'); return; }
                try {
                  const res = await fetch('/api/payment-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      invoiceIds: [],
                      paymentMethod: paymentForm.paymentMethod,
                      netAmount: parseFloat(paymentForm.netAmount),
                      amount: parseFloat(paymentForm.amount || paymentForm.netAmount),
                      discount: 0,
                      supplierId: paymentForm.supplierId || null,
                      supplierName: paymentForm.supplierName || null,
                      dueDate: paymentForm.dueDate || null,
                      accountId: paymentForm.accountId || null,
                      summary: paymentForm.summary || null,
                      note: paymentForm.note || null,
                      status: '待出納',
                      sourceType: 'engineering',
                      sourceRecordId: paymentForm.termId ? parseInt(paymentForm.termId) : null,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error?.message || '建立失敗');
                  const orderId = data.id;
                  if (paymentForm.termId) {
                    await fetch(`/api/engineering/contract-terms/${paymentForm.termId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'paid', paymentOrderId: orderId, paidAt: paymentForm.dueDate || new Date().toISOString().slice(0, 10) }),
                    });
                  }
                  setShowPaymentModal(false);
                  fetchPaymentOrders();
                  if (activeTab === 'contracts' || activeTab === 'projectMgmt') fetchContracts(filterProjectId || undefined);
                  if (activeTab === 'projectMgmt') fetchContracts();
                  alert('付款單已建立，請至出納執行付款');
                } catch (e) {
                  alert(e.message || '建立失敗');
                }
              }} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">儲存並送交出納</button>
            </div>
          </div>
        </div>
      )}

      {/* 材料 Modal */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMaterialModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editingMaterial ? '編輯材料' : '新增材料'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">工程案 *</label>
                <select value={materialForm.projectId} onChange={e => setMaterialForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" disabled={!!editingMaterial}>
                  <option value="">請選擇</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">產品（選填，可改為手動說明）</label>
                <select value={materialForm.productId} onChange={e => setMaterialForm(f => ({ ...f, productId: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">手動輸入說明</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">說明（無產品時填寫）</label>
                <input value={materialForm.description} onChange={e => setMaterialForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="材料名稱或規格" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">數量 *</label>
                  <input type="number" value={materialForm.quantity} onChange={e => setMaterialForm(f => ({ ...f, quantity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.0001" min="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">單位</label>
                  <input value={materialForm.unit} onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：式、m²" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">單價</label>
                  <input type="number" value={materialForm.unitPrice} onChange={e => setMaterialForm(f => ({ ...f, unitPrice: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" step="0.01" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">使用日期</label>
                <input type="date" value={materialForm.usedAt} onChange={e => setMaterialForm(f => ({ ...f, usedAt: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <input value={materialForm.note} onChange={e => setMaterialForm(f => ({ ...f, note: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowMaterialModal(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={saveMaterial} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
