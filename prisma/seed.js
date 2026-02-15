const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // ========================
  // 1. 管理員帳號
  // ========================
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@hotel.com' }
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@hotel.com',
        password: hashedPassword,
        name: '系統管理員',
        role: 'admin',
        permissions: [
          'dashboard', 'products', 'suppliers', 'purchasing',
          'sales', 'finance', 'inventory', 'analytics',
          'expenses', 'payment-voucher'
        ]
      }
    });
    console.log('Default admin account created.');
  } else {
    console.log('Admin account already exists, skipping.');
  }

  // ========================
  // 2. 館別與部門
  // ========================
  const warehouseData = {
    '麗格': ['總務部', '行銷部', '財務部'],
    '麗軒': ['總務部', '行銷部', '財務部'],
    '民宿': ['總務部', '行銷部', '財務部']
  };

  for (const [whName, depts] of Object.entries(warehouseData)) {
    const wh = await prisma.warehouse.upsert({
      where: { name: whName },
      update: {},
      create: { name: whName }
    });
    for (const deptName of depts) {
      await prisma.department.upsert({
        where: { warehouseId_name: { warehouseId: wh.id, name: deptName } },
        update: {},
        create: { name: deptName, warehouseId: wh.id }
      });
    }
  }
  console.log('Warehouses and departments seeded.');

  // ========================
  // 3. 供應商
  // ========================
  const suppliers = [
    {
      id: 1, name: '供應商A', taxId: '12345678', contact: '張經理',
      personInCharge: '張董事長', phone: '02-1234-5678',
      address: '台北市信義區信義路五段7號', email: 'contact@supplier-a.com',
      paymentTerms: '月結', contractDate: '2025-01-01', contractEndDate: '2026-03-31',
      paymentStatus: '已付款', sortOrder: 1
    },
    {
      id: 2, name: '供應商B', taxId: '87654321', contact: '李經理',
      personInCharge: '李總經理', phone: '02-2345-6789',
      address: '新北市板橋區文化路一段188巷', email: 'contact@supplier-b.com',
      paymentTerms: '現金', contractDate: '2025-06-01', contractEndDate: '2026-05-31',
      paymentStatus: '未付款', sortOrder: 2
    },
    {
      id: 3, name: '供應商C', taxId: '11223344', contact: '王經理',
      personInCharge: '王執行長', phone: '02-3456-7890',
      address: '台中市西屯區台灣大道三段', email: 'contact@supplier-c.com',
      paymentTerms: '支票', contractDate: '2025-03-01', contractEndDate: '2026-02-28',
      paymentStatus: '部分付款', sortOrder: 3
    }
  ];

  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: s,
      create: s
    });
  }
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('suppliers', 'id'), (SELECT COALESCE(MAX(id), 0) FROM suppliers));`
  );
  console.log('Suppliers seeded.');

  // ========================
  // 4. 產品
  // ========================
  const products = [
    { id: 1, code: 'PROD-001', name: '產品A', category: '電子產品', unit: '個', costPrice: 100, salesPrice: 150, isInStock: true, warehouseLocation: '麗格', accountingSubject: '存貨' },
    { id: 2, code: 'PROD-002', name: '產品B', category: '辦公用品', unit: '箱', costPrice: 500, salesPrice: 750, isInStock: true, warehouseLocation: '麗軒', accountingSubject: '存貨' },
    { id: 3, code: 'PROD-003', name: '毛巾', category: '清潔用品', unit: '條', costPrice: 50, salesPrice: 80, isInStock: true, warehouseLocation: '麗格', accountingSubject: '存貨' },
    { id: 4, code: 'PROD-004', name: '洗髮精', category: '清潔用品', unit: '瓶', costPrice: 120, salesPrice: 180, isInStock: true, warehouseLocation: '麗軒', accountingSubject: '存貨' },
    { id: 5, code: 'PROD-005', name: '床單', category: '寢具', unit: '組', costPrice: 800, salesPrice: 1200, isInStock: true, warehouseLocation: '民宿', accountingSubject: '存貨' }
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: p,
      create: p
    });
  }
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT COALESCE(MAX(id), 0) FROM products));`
  );
  console.log('Products seeded.');

  // ========================
  // 5. 進貨單
  // ========================
  const purchases = [
    {
      id: 1, purchaseNo: 'PUR-20251015-0001', warehouse: '麗格', department: '總務部',
      supplierId: 3, purchaseDate: '2025-10-15', paymentTerms: '月結', taxType: 'tax-excluded',
      amount: 5000, tax: 250, totalAmount: 5250, status: '已入庫',
      items: [{ productId: 3, quantity: 100, unitPrice: 50, note: '10月份進貨 - 白色毛巾' }]
    },
    {
      id: 2, purchaseNo: 'PUR-20251020-0002', warehouse: '麗格', department: '行銷部',
      supplierId: 3, purchaseDate: '2025-10-20', paymentTerms: '月結', taxType: 'tax-excluded',
      amount: 6000, tax: 300, totalAmount: 6300, status: '已入庫',
      items: [{ productId: 3, quantity: 120, unitPrice: 50, note: '10月份進貨 - 藍色毛巾' }]
    },
    {
      id: 3, purchaseNo: 'PUR-20251105-0003', warehouse: '麗格', department: '總務部',
      supplierId: 3, purchaseDate: '2025-11-05', paymentTerms: '月結', taxType: 'tax-excluded',
      amount: 5500, tax: 275, totalAmount: 5775, status: '已入庫',
      items: [{ productId: 3, quantity: 110, unitPrice: 50, note: '11月份進貨 - 白色毛巾' }]
    },
    {
      id: 4, purchaseNo: 'PUR-20251110-0004', warehouse: '麗格', department: '財務部',
      supplierId: 3, purchaseDate: '2025-11-10', paymentTerms: '月結', taxType: 'tax-included',
      amount: 4761.90, tax: 238.10, totalAmount: 5000, status: '已入庫',
      items: [{ productId: 3, quantity: 100, unitPrice: 50, note: '11月份進貨 - 灰色毛巾' }]
    },
    {
      id: 5, purchaseNo: 'PUR-20251012-0005', warehouse: '麗軒', department: '總務部',
      supplierId: 1, purchaseDate: '2025-10-12', paymentTerms: '現金', taxType: 'tax-excluded',
      amount: 1200, tax: 60, totalAmount: 1260, status: '已入庫',
      items: [{ productId: 4, quantity: 10, unitPrice: 120, note: '10月份進貨' }]
    },
    {
      id: 6, purchaseNo: 'PUR-20251108-0006', warehouse: '民宿', department: '總務部',
      supplierId: 2, purchaseDate: '2025-11-08', paymentTerms: '支票', taxType: 'tax-free',
      amount: 8000, tax: 0, totalAmount: 8000, status: '已入庫',
      items: [{ productId: 5, quantity: 10, unitPrice: 800, note: '11月份進貨' }]
    }
  ];

  for (const purchase of purchases) {
    const { items, ...masterData } = purchase;
    const existing = await prisma.purchaseMaster.findUnique({ where: { id: purchase.id } });
    if (!existing) {
      await prisma.purchaseMaster.create({
        data: {
          ...masterData,
          details: {
            create: items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              note: item.note || '',
              status: masterData.status
            }))
          }
        }
      });
    }
  }
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('purchase_masters', 'id'), (SELECT COALESCE(MAX(id), 0) FROM purchase_masters));`
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('purchase_details', 'id'), (SELECT COALESCE(MAX(id), 0) FROM purchase_details));`
  );
  console.log('Purchases seeded.');

  // ========================
  // 6. 價格歷史
  // ========================
  const existingPH = await prisma.priceHistory.count();
  if (existingPH === 0) {
    const priceHistories = [
      { supplierId: 1, productId: 1, purchaseDate: '2024-11-01', unitPrice: 95 },
      { supplierId: 2, productId: 1, purchaseDate: '2024-11-15', unitPrice: 100 },
      { supplierId: 1, productId: 1, purchaseDate: '2024-12-01', unitPrice: 98 },
      { supplierId: 3, productId: 1, purchaseDate: '2024-12-10', unitPrice: 102 },
      { supplierId: 3, productId: 3, purchaseDate: '2025-10-15', unitPrice: 50 },
      { supplierId: 3, productId: 3, purchaseDate: '2025-10-20', unitPrice: 50 },
      { supplierId: 3, productId: 3, purchaseDate: '2025-11-05', unitPrice: 50 },
      { supplierId: 3, productId: 3, purchaseDate: '2025-11-10', unitPrice: 50 },
      { supplierId: 1, productId: 4, purchaseDate: '2025-10-12', unitPrice: 120 },
      { supplierId: 2, productId: 5, purchaseDate: '2025-11-08', unitPrice: 800 }
    ];
    for (const ph of priceHistories) {
      await prisma.priceHistory.create({ data: ph });
    }
  }
  console.log('Price history seeded.');

  // ========================
  // 7. 價格比較
  // ========================
  const priceComparisons = [
    { productId: 1, supplierId: 1, unitPrice: 98, date: '2024-12-19' },
    { productId: 1, supplierId: 2, unitPrice: 100, date: '2024-12-19' },
    { productId: 1, supplierId: 3, unitPrice: 102, date: '2024-12-19' }
  ];

  for (const pc of priceComparisons) {
    await prisma.priceComparison.upsert({
      where: {
        productId_supplierId_date: {
          productId: pc.productId,
          supplierId: pc.supplierId,
          date: pc.date
        }
      },
      update: pc,
      create: pc
    });
  }
  console.log('Price comparisons seeded.');

  // ========================
  // 8. 部門費用
  // ========================
  const departmentExpenses = [
    { id: 1, year: 2024, month: 11, department: '研發部', category: '電子產品', tax: 250, totalAmount: 5000 },
    { id: 2, year: 2024, month: 11, department: '研發部', category: '辦公用品', tax: 125, totalAmount: 2500 },
    { id: 3, year: 2024, month: 12, department: '研發部', category: '電子產品', tax: 300, totalAmount: 6000 },
    { id: 4, year: 2024, month: 11, department: '行銷部', category: '辦公用品', tax: 100, totalAmount: 2000 }
  ];

  for (const de of departmentExpenses) {
    const existing = await prisma.departmentExpense.findUnique({ where: { id: de.id } });
    if (!existing) {
      await prisma.departmentExpense.create({ data: de });
    }
  }
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('department_expenses', 'id'), (SELECT COALESCE(MAX(id), 0) FROM department_expenses));`
  );
  console.log('Department expenses seeded.');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
