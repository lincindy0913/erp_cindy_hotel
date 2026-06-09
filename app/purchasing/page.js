'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import MonthlyExpenseTab from '@/components/purchasing/MonthlyExpenseTab';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { usePurchaseExpense } from '@/hooks/usePurchaseExpense';
import { usePurchasingOrders } from './_hooks/usePurchasingOrders';
import OrdersTab from './_tabs/OrdersTab';

function PurchasingPageInner() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isLoggedIn = !!session;

  // Shared data
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [paymentMethodOptions, setPaymentMethodOptions] = useState([]);
  const [invoiceTitles, setInvoiceTitles] = useState([]);

  // Monthly expense tab hook
  const expense = usePurchaseExpense({ showToast, confirm, session, products, suppliers });
  const { purchasePageTab, setPurchasePageTab } = expense;

  // Orders tab hook
  const ordersHook = usePurchasingOrders({ searchParams, products, suppliers });
  const { warehouseDepts, fetchPurchases } = ordersHook;
  const { warehouseList, fetchWarehouseDepartments } = warehouseDepts;

  const warehousesList = warehouseList.filter(w => w.type === 'building').map(w => w.name);
  const storageLocationsList = warehouseList.filter(w => w.type === 'storage').map(w => w.name);

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers?all=true');
      if (!response.ok) { showToast('載入廠商清單失敗', 'error'); return; }
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      showToast('載入廠商清單失敗', 'error');
      setSuppliers([]);
    }
  }

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products?all=true', { credentials: 'include' });
      if (!response.ok) { showToast('載入品項清單失敗', 'error'); return; }
      const data = await response.json().catch(() => []);
      setProducts(Array.isArray(data) ? data : (data?.products || []));
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      showToast('載入品項清單失敗', 'error');
      setProducts([]);
    }
  }

  async function fetchPaymentMethods() {
    try {
      const res = await fetch('/api/settings/payment-methods', { credentials: 'include' });
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) setPaymentMethodOptions(data.map(m => m.name));
    } catch (err) {
      console.error('載入付款方式失敗:', err);
    }
  }

  async function fetchInvoiceTitles() {
    try {
      const res = await fetch('/api/settings/invoice-titles', { credentials: 'include' });
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setInvoiceTitles(data);
      } else if (res.ok && data && !Array.isArray(data)) {
        setInvoiceTitles(data.titles || data.data || []);
      } else {
        setInvoiceTitles([]);
      }
    } catch (err) {
      console.error('載入發票抬頭失敗:', err);
      setInvoiceTitles([]);
    }
  }

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    const initFilter = {
      supplierId: '',
      startDate: searchParams.get('startDate') || '',
      endDate:   searchParams.get('endDate')   || '',
      warehouse: searchParams.get('warehouse') || '',
    };
    fetchPurchases(1, 50, initFilter);
    fetchWarehouseDepartments();
    fetchInvoiceTitles();
    fetchPaymentMethods();
    ordersHook.reorderHook.fetchReorderSuggestions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (purchasePageTab === 'monthlyExpense') fetchInvoiceTitles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchasePageTab]);

  const { fetchError } = ordersHook;

  return (
    <div className="min-h-screen page-bg-purchasing">
      <Navigation borderColor="border-orange-500" />
      {fetchError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={fetchError} onRetry={() => fetchPurchases()} />
        </div>
      )}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <ModuleGuideCard
          title="採購日常流程"
          color="amber"
          steps={[
            { label: '確認低庫存', desc: '首頁儀錶板查看低庫存警示，或到庫存頁確認補貨需求', link: { href: '/inventory', text: '前往庫存' } },
            { label: '建立進貨單', desc: '選擇廠商、品項、數量，送出後等待入庫確認' },
            { label: '入庫確認', desc: '貨物到達後在進貨單「確認入庫」，庫存自動增加' },
            { label: '發票登錄', desc: '廠商發票到達後到「發票登錄」建立進項發票，再至「付款」建立付款單', link: { href: '/sales', text: '前往發票登錄' } },
          ]}
        />

        {/* 主分頁：進貨單 | 進銷存每月費用 */}
        <div className="flex gap-2 mb-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => { setPurchasePageTab('orders'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${purchasePageTab === 'orders' ? 'bg-orange-100 text-orange-800 border border-b-0 border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            進貨單
          </button>
          <button
            type="button"
            onClick={() => { setPurchasePageTab('monthlyExpense'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${purchasePageTab === 'monthlyExpense' ? 'bg-orange-100 text-orange-800 border border-b-0 border-orange-300' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            進銷存每月費用
          </button>
        </div>

        {purchasePageTab === 'orders' && (
          <OrdersTab
            isLoggedIn={isLoggedIn}
            suppliers={suppliers}
            products={products}
            warehousesList={warehousesList}
            storageLocationsList={storageLocationsList}
            confirm={confirm}
            {...ordersHook}
            warehouseDepts={ordersHook.warehouseDepts}
            reorderHook={ordersHook.reorderHook}
          />
        )}

        {purchasePageTab === 'monthlyExpense' && (
          <MonthlyExpenseTab
            expense={expense}
            suppliers={suppliers}
            products={products}
            warehousesList={warehousesList}
            storageLocationsList={storageLocationsList}
            paymentMethodOptions={paymentMethodOptions}
            invoiceTitles={invoiceTitles}
          />
        )}
      </main>
    </div>
  );
}

export default function PurchasingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">載入中…</div>}>
      <PurchasingPageInner />
    </Suspense>
  );
}
