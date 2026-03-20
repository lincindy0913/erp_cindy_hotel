import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Tables that store warehouse as free-text string
const WAREHOUSE_TABLES = [
  { model: 'purchaseMaster', field: 'warehouse', label: '進貨單' },
  { model: 'purchaseDetail', field: 'inventoryWarehouse', label: '進貨明細(庫存)' },
  { model: 'salesDetail', field: 'warehouse', label: '發票明細' },
  { model: 'cashAccount', field: 'warehouse', label: '現金帳戶' },
  { model: 'cashCategory', field: 'warehouse', label: '現金類別' },
  { model: 'cashTransaction', field: 'warehouse', label: '現金交易' },
  { model: 'expense', field: 'warehouse', label: '費用' },
  { model: 'paymentOrder', field: 'warehouse', label: '付款單' },
  { model: 'commonExpenseRecord', field: 'warehouse', label: '固定費用紀錄' },
  { model: 'employeeAdvance', field: 'warehouse', label: '員工代墊' },
  { model: 'purchaseAllowance', field: 'warehouse', label: '進貨折讓' },
  { model: 'pmsImportBatch', field: 'warehouse', label: 'PMS匯入' },
  { model: 'pmsIncomeRecord', field: 'warehouse', label: 'PMS收入' },
  { model: 'pmsPaymentMethodConfig', field: 'warehouse', label: 'PMS付款設定' },
  { model: 'utilityBillRecord', field: 'warehouse', label: '水電費' },
  { model: 'inventoryRequisition', field: 'warehouse', label: '領料單' },
  { model: 'stockCount', field: 'warehouse', label: '盤點' },
  { model: 'monthEndStatus', field: 'warehouse', label: '月結狀態' },
  { model: 'monthEndReport', field: 'warehouse', label: '月結報表' },
  { model: 'departmentExpense', field: 'warehouse', label: '部門費用' },
  { model: 'monthlyAggregation', field: 'warehouse', label: '月彙總' },
  { model: 'creditCardStatement', field: 'warehouse', label: '信用卡帳單' },
];

// Tables that store supplierName as free-text
const SUPPLIER_TABLES = [
  { model: 'expense', field: 'supplierName', label: '費用' },
  { model: 'paymentOrder', field: 'supplierName', label: '付款單' },
  { model: 'commonExpenseRecord', field: 'supplierName', label: '固定費用紀錄' },
  { model: 'templateEntryLine', field: 'supplierName', label: '範本明細' },
  { model: 'purchaseAllowance', field: 'supplierName', label: '進貨折讓' },
];

// GET: scan all tables for inconsistent names
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'warehouse', 'supplier', 'all'

    // Get master lists
    const [masterWarehouses, masterSuppliers] = await Promise.all([
      prisma.warehouse.findMany({ where: { type: 'building', parentId: null }, select: { name: true } }),
      prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const validWarehouseNames = new Set(masterWarehouses.map(w => w.name));
    const validSupplierNames = new Set(masterSuppliers.map(s => s.name));

    const result = { warehouse: [], supplier: [] };

    // Scan warehouse fields
    if (type === 'all' || type === 'warehouse') {
      const warehouseValues = {};
      for (const t of WAREHOUSE_TABLES) {
        try {
          const rows = await prisma[t.model].groupBy({
            by: [t.field],
            _count: { [t.field]: true },
            where: { [t.field]: { not: null, not: '' } },
          });
          for (const row of rows) {
            const val = row[t.field];
            if (!val) continue;
            if (!warehouseValues[val]) warehouseValues[val] = { name: val, inMaster: validWarehouseNames.has(val), tables: [], totalCount: 0 };
            warehouseValues[val].tables.push({ table: t.label, model: t.model, field: t.field, count: row._count[t.field] });
            warehouseValues[val].totalCount += row._count[t.field];
          }
        } catch { /* table may not exist */ }
      }
      result.warehouse = Object.values(warehouseValues).sort((a, b) => {
        if (a.inMaster !== b.inMaster) return a.inMaster ? 1 : -1; // non-master first
        return b.totalCount - a.totalCount;
      });
    }

    // Scan supplier fields
    if (type === 'all' || type === 'supplier') {
      const supplierValues = {};
      for (const t of SUPPLIER_TABLES) {
        try {
          const rows = await prisma[t.model].groupBy({
            by: [t.field],
            _count: { [t.field]: true },
            where: { [t.field]: { not: null, not: '' } },
          });
          for (const row of rows) {
            const val = row[t.field];
            if (!val) continue;
            if (!supplierValues[val]) supplierValues[val] = { name: val, inMaster: validSupplierNames.has(val), tables: [], totalCount: 0 };
            supplierValues[val].tables.push({ table: t.label, model: t.model, field: t.field, count: row._count[t.field] });
            supplierValues[val].totalCount += row._count[t.field];
          }
        } catch { /* table may not exist */ }
      }
      result.supplier = Object.values(supplierValues).sort((a, b) => {
        if (a.inMaster !== b.inMaster) return a.inMaster ? 1 : -1;
        return b.totalCount - a.totalCount;
      });
    }

    result.masterWarehouses = [...validWarehouseNames].sort();
    result.masterSuppliers = masterSuppliers.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: batch rename — replace oldName with newName across all tables
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { type, oldName, newName } = await request.json();

    if (!type || !oldName || !newName) {
      return createErrorResponse('VALIDATION_FAILED', '請提供 type、oldName、newName', 400);
    }
    if (oldName === newName) {
      return createErrorResponse('VALIDATION_FAILED', '新舊名稱相同', 400);
    }

    const tables = type === 'warehouse' ? WAREHOUSE_TABLES : type === 'supplier' ? SUPPLIER_TABLES : [];
    if (tables.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未知的類型', 400);
    }

    let totalUpdated = 0;
    const details = [];

    for (const t of tables) {
      try {
        const result = await prisma[t.model].updateMany({
          where: { [t.field]: oldName },
          data: { [t.field]: newName },
        });
        if (result.count > 0) {
          details.push({ table: t.label, count: result.count });
          totalUpdated += result.count;
        }
      } catch { /* table may not exist or field mismatch */ }
    }

    return NextResponse.json({
      message: `已將「${oldName}」更名為「${newName}」，共更新 ${totalUpdated} 筆`,
      totalUpdated,
      details,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
