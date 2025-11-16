/**
 * 進銷存系統 - 資料結構定義
 * 根據 OpenSpec 規範定義所有表格結構
 */

// ============================================
// 主資料層 (10-19)
// ============================================

/**
 * 產品主檔 (10_Products)
 */
export const ProductsSchema = {
  tableName: '10_Products',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    Code: { type: 'string', required: true, unique: true },
    Name: { type: 'string', required: true },
    Category: { type: 'string', required: true },
    Unit: { type: 'string', required: true },
    CostPrice: { type: 'number', required: true, min: 0 },
    SalesPrice: { type: 'number', required: true, min: 0 },
    IsInStock: { type: 'boolean', required: true, default: false },
    WarehouseLocation: { type: 'string', required: false, enum: ['麗格', '麗軒', '民宿'] },
    AccountingSubject: { type: 'string', required: false }
  }
};

/**
 * 廠商資料 (11_Suppliers)
 */
export const SuppliersSchema = {
  tableName: '11_Suppliers',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    Code: { type: 'string', required: true, unique: true },
    Name: { type: 'string', required: true },
    TaxID: { type: 'string', required: true },
    Contact: { type: 'string', required: true },
    PaymentTerms: { type: 'string', required: true }
  }
};

/**
 * 客戶資料 (12_Customers)
 */
export const CustomersSchema = {
  tableName: '12_Customers',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    Code: { type: 'string', required: true, unique: true },
    Name: { type: 'string', required: true },
    TaxID: { type: 'string', required: true },
    Contact: { type: 'string', required: true },
    CreditLimit: { type: 'number', required: true, min: 0 }
  }
};

// ============================================
// 進貨模組 (20-29)
// ============================================

/**
 * 進貨主檔 (20_PurchaseMaster)
 */
export const PurchaseMasterSchema = {
  tableName: '20_PurchaseMaster',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    PurchaseNo: { type: 'string', required: true, unique: true },
    SupplierID: { type: 'number', required: true, foreignKey: '11_Suppliers.ID' },
    Date: { type: 'date', required: true },
    Amount: { type: 'number', required: true, min: 0 },
    Tax: { type: 'number', required: true, min: 0 },
    Status: { type: 'enum', enum: ['待入庫', '已入庫', '已取消'], default: '待入庫' }
  }
};

/**
 * 進貨明細 (21_PurchaseDetails)
 */
export const PurchaseDetailsSchema = {
  tableName: '21_PurchaseDetails',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    PurchaseID: { type: 'number', required: true, foreignKey: '20_PurchaseMaster.ID' },
    ProductID: { type: 'number', required: true, foreignKey: '10_Products.ID' },
    Quantity: { type: 'number', required: true, min: 1 },
    UnitPrice: { type: 'number', required: true, min: 0 },
    SubTotal: { type: 'number', required: true, min: 0, formula: 'Quantity * UnitPrice' }
  }
};

// ============================================
// 銷貨模組 (30-39)
// ============================================

/**
 * 銷貨主檔 (30_SalesMaster)
 */
export const SalesMasterSchema = {
  tableName: '30_SalesMaster',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    SalesNo: { type: 'string', required: true, unique: true },
    CustomerID: { type: 'number', required: true, foreignKey: '12_Customers.ID' },
    Date: { type: 'date', required: true },
    Amount: { type: 'number', required: true, min: 0 },
    Tax: { type: 'number', required: true, min: 0 },
    InvoiceNo: { type: 'string', required: true, unique: true },
    InvoiceDate: { type: 'date', required: true },
    Status: { type: 'enum', enum: ['待出貨', '已出貨', '已取消'], default: '待出貨' }
  }
};

/**
 * 銷貨明細 (31_SalesDetails)
 */
export const SalesDetailsSchema = {
  tableName: '31_SalesDetails',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    SalesID: { type: 'number', required: true, foreignKey: '30_SalesMaster.ID' },
    ProductID: { type: 'number', required: true, foreignKey: '10_Products.ID' },
    Quantity: { type: 'number', required: true, min: 1 },
    UnitPrice: { type: 'number', required: true, min: 0 },
    SubTotal: { type: 'number', required: true, min: 0, formula: 'Quantity * UnitPrice' }
  }
};

// ============================================
// 財務模組 (40-49)
// ============================================

/**
 * 付款紀錄 (40_Payments)
 */
export const PaymentsSchema = {
  tableName: '40_Payments',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    SalesID: { type: 'number', required: true, foreignKey: '30_SalesMaster.ID' },
    PaymentNo: { type: 'string', required: true, unique: true },
    Date: { type: 'date', required: true },
    PaymentMethod: { type: 'enum', enum: ['現金', '轉帳', '支票', '信用卡'], required: true },
    Amount: { type: 'number', required: true, min: 0 }
  }
};

// ============================================
// 庫存模組 (50-59)
// ============================================

/**
 * 即時庫存 (50_Inventory)
 */
export const InventorySchema = {
  tableName: '50_Inventory',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    ProductID: { type: 'number', required: true, unique: true, foreignKey: '10_Products.ID' },
    BeginningQty: { type: 'number', required: true, default: 0 },
    PurchaseQty: { type: 'number', required: true, default: 0 },
    SalesQty: { type: 'number', required: true, default: 0 },
    CurrentQty: { type: 'number', required: true, formula: 'BeginningQty + PurchaseQty - SalesQty' }
  }
};

// ============================================
// 分析模組 (60-89)
// ============================================

/**
 * 歷史進貨價格 (60_PriceHistory)
 */
export const PriceHistorySchema = {
  tableName: '60_PriceHistory',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    SupplierID: { type: 'number', required: true, foreignKey: '11_Suppliers.ID' },
    ProductID: { type: 'number', required: true, foreignKey: '10_Products.ID' },
    PurchaseDate: { type: 'date', required: true },
    UnitPrice: { type: 'number', required: true, min: 0 }
  }
};

/**
 * 比價分析來源 (61_PriceComparison)
 */
export const PriceComparisonSchema = {
  tableName: '61_PriceComparison',
  columns: {
    ProductID: { type: 'number', required: true, foreignKey: '10_Products.ID' },
    SupplierID: { type: 'number', required: true, foreignKey: '11_Suppliers.ID' },
    UnitPrice: { type: 'number', required: true, min: 0 },
    Date: { type: 'date', required: true }
  }
};

/**
 * 部門支出來源 (70_DepartmentExpense)
 */
export const DepartmentExpenseSchema = {
  tableName: '70_DepartmentExpense',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    Year: { type: 'number', required: true },
    Month: { type: 'number', required: true, min: 1, max: 12 },
    Department: { type: 'string', required: true },
    Category: { type: 'string', required: true },
    Tax: { type: 'number', required: true, min: 0 },
    TotalAmount: { type: 'number', required: true, min: 0 }
  }
};

/**
 * 儀表板資料 (80_DashboardData)
 */
export const DashboardDataSchema = {
  tableName: '80_DashboardData',
  columns: {
    ID: { type: 'number', primaryKey: true, autoIncrement: true },
    Year: { type: 'number', required: true },
    Month: { type: 'number', required: true, min: 1, max: 12 },
    IndicatorType: { type: 'enum', enum: ['進貨總額', '銷貨總額', '毛利', '毛利潤率'], required: true },
    Amount: { type: 'number', required: true }
  }
};

// ============================================
// 匯出所有 Schema
// ============================================

export const AllSchemas = {
  Products: ProductsSchema,
  Suppliers: SuppliersSchema,
  Customers: CustomersSchema,
  PurchaseMaster: PurchaseMasterSchema,
  PurchaseDetails: PurchaseDetailsSchema,
  SalesMaster: SalesMasterSchema,
  SalesDetails: SalesDetailsSchema,
  Payments: PaymentsSchema,
  Inventory: InventorySchema,
  PriceHistory: PriceHistorySchema,
  PriceComparison: PriceComparisonSchema,
  DepartmentExpense: DepartmentExpenseSchema,
  DashboardData: DashboardDataSchema
};

