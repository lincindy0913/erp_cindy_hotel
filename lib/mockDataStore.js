/**
 * 模擬資料存儲
 * 在開發環境中使用全局變數暫存資料
 * 生產環境應使用資料庫
 */

// 使用全局對象共享資料（在無狀態環境中）
if (typeof global.mockDataStore === 'undefined') {
  global.mockDataStore = {
    suppliers: [
      { id: 1, code: 'SUP-001', name: '供應商A', taxId: '12345678', contact: '張經理', paymentTerms: '月結' },
      { id: 2, code: 'SUP-002', name: '供應商B', taxId: '87654321', contact: '李經理', paymentTerms: '現金' },
      { id: 3, code: 'SUP-003', name: '供應商C', taxId: '11223344', contact: '王經理', paymentTerms: '支票' }
    ],
    customers: [
      { id: 1, code: 'CUS-001', name: '客戶A', taxId: '98765432', contact: '陳經理', creditLimit: 100000 },
      { id: 2, code: 'CUS-002', name: '客戶B', taxId: '45678901', contact: '林經理', creditLimit: 200000 },
      { id: 3, code: 'CUS-003', name: '客戶C', taxId: '23456789', contact: '黃經理', creditLimit: 150000 }
    ],
    products: [
      { id: 1, code: 'PROD-001', name: '產品A', category: '電子產品', unit: '個', costPrice: 100, salesPrice: 150, isInStock: true, warehouseLocation: '麗格', accountingSubject: '存貨' },
      { id: 2, code: 'PROD-002', name: '產品B', category: '辦公用品', unit: '箱', costPrice: 500, salesPrice: 750, isInStock: true, warehouseLocation: '麗軒', accountingSubject: '存貨' }
    ],
    purchases: [],
    sales: [],
    payments: [],
    priceHistory: [
      { id: 1, supplierId: 1, productId: 1, purchaseDate: '2024-11-01', unitPrice: 95 },
      { id: 2, supplierId: 2, productId: 1, purchaseDate: '2024-11-15', unitPrice: 100 },
      { id: 3, supplierId: 1, productId: 1, purchaseDate: '2024-12-01', unitPrice: 98 },
      { id: 4, supplierId: 3, productId: 1, purchaseDate: '2024-12-10', unitPrice: 102 },
    ],
    priceComparisons: [
      { productId: 1, supplierId: 1, unitPrice: 98, date: '2024-12-19' },
      { productId: 1, supplierId: 2, unitPrice: 100, date: '2024-12-19' },
      { productId: 1, supplierId: 3, unitPrice: 102, date: '2024-12-19' },
    ],
    departmentExpenses: [
      { id: 1, year: 2024, month: 11, department: '研發部', category: '電子產品', tax: 250, totalAmount: 5000 },
      { id: 2, year: 2024, month: 11, department: '研發部', category: '辦公用品', tax: 125, totalAmount: 2500 },
      { id: 3, year: 2024, month: 12, department: '研發部', category: '電子產品', tax: 300, totalAmount: 6000 },
      { id: 4, year: 2024, month: 11, department: '行銷部', category: '辦公用品', tax: 100, totalAmount: 2000 },
    ],
    counters: {
      supplier: 4,
      customer: 4,
      product: 3,
      purchase: 1,
      sales: 1,
      payment: 1,
      priceHistory: 5,
      departmentExpenses: 5
    }
  };
}

export const getStore = () => global.mockDataStore;
