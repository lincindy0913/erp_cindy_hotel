'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

export function useProducts() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [accountingSearch, setAccountingSearch] = useState('');
  const [showAccountingDropdown, setShowAccountingDropdown] = useState(false);
  const [inventorySubjectSearch, setInventorySubjectSearch] = useState('');
  const [showInventorySubjectDropdown, setShowInventorySubjectDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchTimer, setSearchTimer] = useState(null);
  const [warehouseOptions, setWarehouseOptions] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('warehouseOptions');
      return saved ? JSON.parse(saved) : ['麗格', '麗軒', '民宿'];
    }
    return ['麗格', '麗軒', '民宿'];
  });
  const [newWarehouse, setNewWarehouse] = useState('');
  const [showWarehouseManager, setShowWarehouseManager] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    unit: '',
    costPrice: '',
    salesPrice: '',
    isInStock: false,
    warehouseLocation: '',
    accountingSubject: '',
    inventorySubject: ''
  });

  useEffect(() => {
    fetchProducts(1, itemsPerPage, '');
    fetchAccountingSubjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('warehouseOptions', JSON.stringify(warehouseOptions));
  }, [warehouseOptions]);

  useEffect(() => {
    function handleClickOutside(event) {
      const a = document.querySelector('.product-accounting-search');
      if (a && !a.contains(event.target)) setShowAccountingDropdown(false);
      const b = document.querySelector('.product-inventory-subject-search');
      if (b && !b.contains(event.target)) setShowInventorySubjectDropdown(false);
    }
    if (showAccountingDropdown || showInventorySubjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountingDropdown, showInventorySubjectDropdown]);

  async function fetchAccountingSubjects() {
    try {
      const response = await fetch('/api/accounting-subjects');
      const data = await response.json();
      setAccountingSubjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得會計科目失敗:', error);
      setAccountingSubjects([]);
    }
  }

  const filterAccountingList = (search) => accountingSubjects.filter(a => {
    if (!search.trim()) return true;
    const keyword = search.toLowerCase().trim();
    return (
      a.code.includes(keyword) ||
      a.name.toLowerCase().includes(keyword) ||
      a.category.toLowerCase().includes(keyword) ||
      a.subcategory.toLowerCase().includes(keyword)
    );
  });
  const filteredAccounting = filterAccountingList(accountingSearch);
  const filteredInventorySubjects = filterAccountingList(inventorySubjectSearch);

  function addWarehouseOption() {
    const trimmed = newWarehouse.trim();
    if (!trimmed) return;
    if (warehouseOptions.includes(trimmed)) {
      showToast('此倉庫位置已存在', 'error');
      return;
    }
    setWarehouseOptions([...warehouseOptions, trimmed]);
    setNewWarehouse('');
  }

  function removeWarehouseOption(option) {
    confirm(`確定要刪除倉庫位置「${option}」嗎？`, () => {
      setWarehouseOptions(warehouseOptions.filter(o => o !== option));
      if (formData.warehouseLocation === option) {
        setFormData({ ...formData, warehouseLocation: '' });
      }
    }, '刪除確認');
  }

  async function fetchProducts(page = currentPage, limit = itemsPerPage, keyword = searchKeyword) {
    setProductsError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (keyword) params.set('keyword', keyword);
      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) { setProductsError('產品列表載入失敗，請稍後再試'); setLoading(false); return []; }
      const result = await response.json();
      if (result.data && result.pagination) {
        setProducts(result.data);
        setTotalCount(result.pagination.totalCount);
        setCurrentPage(result.pagination.page);
      } else {
        const list = Array.isArray(result) ? result : [];
        setProducts(list);
        setTotalCount(list.length);
      }
      setLoading(false);
      return result;
    } catch {
      setProductsError('產品列表載入失敗，請稍後再試');
      setProducts([]);
      setTotalCount(0);
      setLoading(false);
      return [];
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.accountingSubject) {
      showToast('請選擇會計科目', 'error');
      return;
    }

    if (formData.isInStock && !formData.warehouseLocation) {
      showToast('列入庫存時必須填寫倉庫位置', 'error');
      return;
    }

    setProductSaving(true);
    try {
      const isEditing = !!editingProduct;
      const method = isEditing ? 'PUT' : 'POST';
      const url = isEditing ? `/api/products/${editingProduct.id}` : '/api/products';

      const submitData = {
        ...formData,
        isInStock: formData.isInStock === true || formData.isInStock === '是'
      };

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });

      if (response.ok) {
        showToast(`產品${isEditing ? '更新' : '新增'}成功！`, 'success');
        setShowAddForm(false);
        setEditingProduct(null);
        setFormData({
          code: '',
          name: '',
          category: '',
          unit: '',
          costPrice: '',
          salesPrice: '',
          isInStock: false,
          warehouseLocation: '',
          accountingSubject: '',
          inventorySubject: ''
        });
        setAccountingSearch('');
        setInventorySubjectSearch('');
        if (!isEditing) {
          const countRes = await fetch('/api/products?page=1&limit=1');
          const countData = await countRes.json();
          const total = countData?.pagination?.totalCount || 0;
          const lastPage = Math.ceil(total / itemsPerPage) || 1;
          await fetchProducts(lastPage, itemsPerPage, searchKeyword);
        } else {
          await fetchProducts(currentPage, itemsPerPage, searchKeyword);
        }
      } else {
        const error = await response.json();
        showToast(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('操作失敗:', error);
      showToast('操作失敗，請稍後再試', 'error');
    } finally {
      setProductSaving(false);
    }
  }

  function handleEdit(product) {
    setEditingProduct(product);
    setShowAddForm(true);
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category || '',
      unit: product.unit || '',
      costPrice: product.costPrice,
      salesPrice: product.salesPrice,
      isInStock: product.isInStock || false,
      warehouseLocation: product.warehouseLocation || '',
      accountingSubject: product.accountingSubject || '',
      inventorySubject: product.inventorySubject || ''
    });
    setAccountingSearch(product.accountingSubject || '');
    setInventorySubjectSearch(product.inventorySubject || '');
  }

  async function handleDelete(productId) {
    if (!(await confirm('確定要刪除這個產品嗎？', { title: '刪除確認', danger: true }))) return;

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('產品刪除成功！', 'success');
        fetchProducts(currentPage, itemsPerPage, searchKeyword);
      } else {
        const error = await response.json();
        showToast('刪除失敗：' + (error.error || '未知錯誤'), 'error');
      }
    } catch (error) {
      console.error('刪除產品失敗:', error);
      showToast('刪除產品失敗，請稍後再試', 'error');
    }
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const lines = text.split('\n');

        if (lines.length < 2) {
          showToast('CSV 檔案格式錯誤：至少需要標題列和一筆資料', 'error');
          return;
        }

        const headers = lines[0].split(',');
        const importedProducts = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = line.split(',');
          if (values.length >= 7) {
            const isInStock = values[7] === '是' || values[7] === 'true' || values[7] === '1';
            importedProducts.push({
              code: values[1],
              name: values[2],
              category: values[3] || '',
              unit: values[4] || '',
              costPrice: parseFloat(values[5]) || 0,
              salesPrice: parseFloat(values[6]) || 0,
              isInStock: isInStock,
              warehouseLocation: isInStock ? (values[8] || '') : '',
              accountingSubject: values[9] || ''
            });
          }
        }

        if (importedProducts.length === 0) {
          showToast('沒有有效資料可匯入', 'error');
          return;
        }

        const confirmMsg = `即將匯入 ${importedProducts.length} 筆產品資料，是否繼續？`;
        if (!(await confirm(confirmMsg, { title: '匯入確認', danger: false }))) return;

        let successCount = 0;
        let failCount = 0;

        for (const product of importedProducts) {
          try {
            const response = await fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(product)
            });

            if (response.ok) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (error) {
            console.error('匯入產品失敗:', product, error);
            failCount++;
          }
        }

        showToast(`匯入完成！\n成功：${successCount} 筆\n失敗：${failCount} 筆`, failCount > 0 ? 'warning' : 'success');
        fetchProducts(1, itemsPerPage, searchKeyword);
      } catch (error) {
        console.error('讀取檔案失敗:', error);
        showToast('讀取檔案失敗，請確認檔案格式正確', 'error');
      }
    };
    input.click();
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const currentProducts = products;

  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pages.push(i);
        }
      }
    }
    return pages;
  };

  function cancelForm() {
    setShowAddForm(false);
    setEditingProduct(null);
    setAccountingSearch('');
    setInventorySubjectSearch('');
    setFormData({
      code: '',
      name: '',
      category: '',
      unit: '',
      costPrice: '',
      salesPrice: '',
      isInStock: false,
      warehouseLocation: '',
      accountingSubject: '',
      inventorySubject: ''
    });
  }

  return {
    products,
    loading,
    productsError,
    productSaving,
    showAddForm,
    setShowAddForm,
    editingProduct,
    accountingSubjects,
    accountingSearch,
    setAccountingSearch,
    showAccountingDropdown,
    setShowAccountingDropdown,
    inventorySubjectSearch,
    setInventorySubjectSearch,
    showInventorySubjectDropdown,
    setShowInventorySubjectDropdown,
    currentPage,
    itemsPerPage,
    setItemsPerPage,
    totalCount,
    searchKeyword,
    setSearchKeyword,
    searchTimer,
    setSearchTimer,
    warehouseOptions,
    newWarehouse,
    setNewWarehouse,
    showWarehouseManager,
    setShowWarehouseManager,
    formData,
    setFormData,
    filteredAccounting,
    filteredInventorySubjects,
    totalPages,
    currentProducts,
    getPageNumbers,
    fetchProducts,
    handleSubmit,
    handleEdit,
    handleDelete,
    handleImport,
    addWarehouseOption,
    removeWarehouseOption,
    cancelForm,
  };
}
