/**
 * 模擬資料存儲
 * 在開發環境中使用全局變數暫存資料
 * 生產環境應使用資料庫
 */

// 使用全局對象共享資料（在無狀態環境中）
// 確保在 Node.js 環境中初始化
if (typeof global !== 'undefined' && typeof global.mockDataStore === 'undefined') {
  global.mockDataStore = {
    suppliers: [
      {
        id: 1,
        name: '供應商A',
        taxId: '12345678',
        contact: '張經理',
        personInCharge: '張董事長',
        phone: '02-1234-5678',
        address: '台北市信義區信義路五段7號',
        email: 'contact@supplier-a.com',
        paymentTerms: '月結',
        contractDate: '2025-01-01',
        contractEndDate: '2026-03-31',
        paymentStatus: '已付款',
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 2,
        name: '供應商B',
        taxId: '87654321',
        contact: '李經理',
        personInCharge: '李總經理',
        phone: '02-2345-6789',
        address: '新北市板橋區文化路一段188巷',
        email: 'contact@supplier-b.com',
        paymentTerms: '現金',
        contractDate: '2025-06-01',
        contractEndDate: '2026-05-31',
        paymentStatus: '未付款',
        sortOrder: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 3,
        name: '供應商C',
        taxId: '11223344',
        contact: '王經理',
        personInCharge: '王執行長',
        phone: '02-3456-7890',
        address: '台中市西屯區台灣大道三段',
        email: 'contact@supplier-c.com',
        paymentTerms: '支票',
        contractDate: '2025-03-01',
        contractEndDate: '2026-02-28',
        paymentStatus: '部分付款',
        sortOrder: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    customers: [
      { id: 1, code: 'CUS-001', name: '客戶A', taxId: '98765432', contact: '陳經理', creditLimit: 100000 },
      { id: 2, code: 'CUS-002', name: '客戶B', taxId: '45678901', contact: '林經理', creditLimit: 200000 },
      { id: 3, code: 'CUS-003', name: '客戶C', taxId: '23456789', contact: '黃經理', creditLimit: 150000 }
    ],
    products: [
      { id: 1, code: 'PROD-001', name: '產品A', category: '電子產品', unit: '個', costPrice: 100, salesPrice: 150, isInStock: true, warehouseLocation: '麗格', accountingSubject: '存貨' },
      { id: 2, code: 'PROD-002', name: '產品B', category: '辦公用品', unit: '箱', costPrice: 500, salesPrice: 750, isInStock: true, warehouseLocation: '麗軒', accountingSubject: '存貨' },
      { id: 3, code: 'PROD-003', name: '毛巾', category: '清潔用品', unit: '條', costPrice: 50, salesPrice: 80, isInStock: true, warehouseLocation: '麗格', accountingSubject: '存貨' },
      { id: 4, code: 'PROD-004', name: '洗髮精', category: '清潔用品', unit: '瓶', costPrice: 120, salesPrice: 180, isInStock: true, warehouseLocation: '麗軒', accountingSubject: '存貨' },
      { id: 5, code: 'PROD-005', name: '床單', category: '寢具', unit: '組', costPrice: 800, salesPrice: 1200, isInStock: true, warehouseLocation: '民宿', accountingSubject: '存貨' }
    ],
    purchases: [
      {
        id: 1,
        purchaseNo: 'PUR-20251015-0001',
        warehouse: '麗格',
        department: '總務部',
        supplierId: 3, // 供應商C
        purchaseDate: '2025-10-15',
        paymentTerms: '月結',
        taxType: 'tax-excluded',
        amount: 5000, // 稅前金額
        tax: 250, // 稅額
        totalAmount: 5250, // 總金額
        status: '已入庫',
        items: [
          {
            productId: 3, // 毛巾
            quantity: 100,
            unitPrice: 50,
            note: '10月份進貨 - 白色毛巾'
          }
        ],
        createdAt: '2024-10-15T10:00:00.000Z',
        updatedAt: '2024-10-15T10:00:00.000Z'
      },
      {
        id: 2,
        purchaseNo: 'PUR-20251020-0002',
        warehouse: '麗格',
        department: '行銷部',
        supplierId: 3, // 供應商C
        purchaseDate: '2025-10-20',
        paymentTerms: '月結',
        taxType: 'tax-excluded',
        amount: 6000,
        tax: 300,
        totalAmount: 6300,
        status: '已入庫',
        items: [
          {
            productId: 3, // 毛巾
            quantity: 120,
            unitPrice: 50,
            note: '10月份進貨 - 藍色毛巾'
          }
        ],
        createdAt: '2024-10-20T14:30:00.000Z',
        updatedAt: '2024-10-20T14:30:00.000Z'
      },
      {
        id: 3,
        purchaseNo: 'PUR-20251105-0003',
        warehouse: '麗格',
        department: '總務部',
        supplierId: 3, // 供應商C
        purchaseDate: '2025-11-05',
        paymentTerms: '月結',
        taxType: 'tax-excluded',
        amount: 5500,
        tax: 275,
        totalAmount: 5775,
        status: '已入庫',
        items: [
          {
            productId: 3, // 毛巾
            quantity: 110,
            unitPrice: 50,
            note: '11月份進貨 - 白色毛巾'
          }
        ],
        createdAt: '2024-11-05T09:15:00.000Z',
        updatedAt: '2024-11-05T09:15:00.000Z'
      },
      {
        id: 4,
        purchaseNo: 'PUR-20251110-0004',
        warehouse: '麗格',
        department: '財務部',
        supplierId: 3, // 供應商C
        purchaseDate: '2025-11-10',
        paymentTerms: '月結',
        taxType: 'tax-included',
        amount: 4761.90, // 稅前金額（反推）
        tax: 238.10, // 稅額
        totalAmount: 5000, // 含稅總金額
        status: '已入庫',
        items: [
          {
            productId: 3, // 毛巾
            quantity: 100,
            unitPrice: 50,
            note: '11月份進貨 - 灰色毛巾'
          }
        ],
        createdAt: '2024-11-10T11:20:00.000Z',
        updatedAt: '2024-11-10T11:20:00.000Z'
      },
      {
        id: 5,
        purchaseNo: 'PUR-20251012-0005',
        warehouse: '麗軒',
        department: '總務部',
        supplierId: 1, // 供應商A
        purchaseDate: '2025-10-12',
        paymentTerms: '現金',
        taxType: 'tax-excluded',
        amount: 1200,
        tax: 60,
        totalAmount: 1260,
        status: '已入庫',
        items: [
          {
            productId: 4, // 洗髮精
            quantity: 10,
            unitPrice: 120,
            note: '10月份進貨'
          }
        ],
        createdAt: '2024-10-12T08:00:00.000Z',
        updatedAt: '2024-10-12T08:00:00.000Z'
      },
      {
        id: 6,
        purchaseNo: 'PUR-20251108-0006',
        warehouse: '民宿',
        department: '總務部',
        supplierId: 2, // 供應商B
        purchaseDate: '2025-11-08',
        paymentTerms: '支票',
        taxType: 'tax-free',
        amount: 8000,
        tax: 0,
        totalAmount: 8000,
        status: '已入庫',
        items: [
          {
            productId: 5, // 床單
            quantity: 10,
            unitPrice: 800,
            note: '11月份進貨'
          }
        ],
        createdAt: '2024-11-08T13:45:00.000Z',
        updatedAt: '2024-11-08T13:45:00.000Z'
      }
    ],
    sales: [],
    payments: [],
    expenses: [], // 支出管理
    priceHistory: [
      { id: 1, supplierId: 1, productId: 1, purchaseDate: '2024-11-01', unitPrice: 95 },
      { id: 2, supplierId: 2, productId: 1, purchaseDate: '2024-11-15', unitPrice: 100 },
      { id: 3, supplierId: 1, productId: 1, purchaseDate: '2024-12-01', unitPrice: 98 },
      { id: 4, supplierId: 3, productId: 1, purchaseDate: '2024-12-10', unitPrice: 102 },
      // 毛巾的價格歷史（從現有進貨單中提取）
      { id: 5, supplierId: 3, productId: 3, purchaseDate: '2025-10-15', unitPrice: 50 }, // PUR-20251015-0001
      { id: 6, supplierId: 3, productId: 3, purchaseDate: '2025-10-20', unitPrice: 50 }, // PUR-20251020-0002
      { id: 7, supplierId: 3, productId: 3, purchaseDate: '2025-11-05', unitPrice: 50 }, // PUR-20251105-0003
      { id: 8, supplierId: 3, productId: 3, purchaseDate: '2025-11-10', unitPrice: 50 }, // PUR-20251110-0004
      // 洗髮精的價格歷史
      { id: 9, supplierId: 1, productId: 4, purchaseDate: '2025-10-12', unitPrice: 120 }, // PUR-20251012-0005
      // 床單的價格歷史
      { id: 10, supplierId: 2, productId: 5, purchaseDate: '2025-11-08', unitPrice: 800 }, // PUR-20251108-0006
    ],
    priceComparisons: [
      { productId: 1, supplierId: 1, unitPrice: 98, date: '2024-12-19' },
      { productId: 1, supplierId: 2, unitPrice: 100, date: '2024-12-19' },
      { productId: 1, supplierId: 3, unitPrice: 102, date: '2024-12-19' },
    ],
    supplierContracts: [], // 廠商合約檔案
    warehouseDepartments: {
      '麗格': ['總務部', '行銷部', '財務部'],
      '麗軒': ['總務部', '行銷部', '財務部'],
      '民宿': ['總務部', '行銷部', '財務部']
    },
    departmentExpenses: [
      { id: 1, year: 2024, month: 11, department: '研發部', category: '電子產品', tax: 250, totalAmount: 5000 },
      { id: 2, year: 2024, month: 11, department: '研發部', category: '辦公用品', tax: 125, totalAmount: 2500 },
      { id: 3, year: 2024, month: 12, department: '研發部', category: '電子產品', tax: 300, totalAmount: 6000 },
      { id: 4, year: 2024, month: 11, department: '行銷部', category: '辦公用品', tax: 100, totalAmount: 2000 },
    ],
    counters: {
      supplier: 4,
      customer: 4,
      product: 6,
      purchase: 7,
      sales: 1,
      payment: 1,
      expense: 1,
      priceHistory: 11,
      departmentExpenses: 5,
      supplierContract: 1
    }
  };
}

export const getStore = () => {
  // 確保 global.mockDataStore 已初始化
  if (typeof global === 'undefined' || typeof global.mockDataStore === 'undefined') {
    // 如果未初始化，返回空結構（這不應該發生，但作為安全措施）
    console.warn('警告: global.mockDataStore 未初始化，返回空結構');
    return {
      suppliers: [],
      products: [],
      purchases: [],
      sales: [],
      payments: [],
      expenses: [],
      priceHistory: [],
      priceComparisons: [],
      departmentExpenses: [],
      supplierContracts: [],
      counters: {
        supplier: 1,
        customer: 1,
        product: 1,
        purchase: 1,
        sales: 1,
        payment: 1,
        expense: 1,
        priceHistory: 1,
        departmentExpenses: 1,
        supplierContract: 1
      }
    };
  }
  return global.mockDataStore;
};
