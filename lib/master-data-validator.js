import prisma from '@/lib/prisma';

// Cache master data for 60 seconds to avoid repeated DB queries
let warehouseCache = { names: null, ts: 0 };
let supplierCache = { names: null, ts: 0 };
const CACHE_TTL = 60_000;

async function getValidWarehouseNames() {
  if (warehouseCache.names && Date.now() - warehouseCache.ts < CACHE_TTL) {
    return warehouseCache.names;
  }
  const warehouses = await prisma.warehouse.findMany({
    where: { type: 'building', parentId: null },
    select: { name: true },
  });
  const names = new Set(warehouses.map(w => w.name));
  warehouseCache = { names, ts: Date.now() };
  return names;
}

async function getValidSupplierNames() {
  if (supplierCache.names && Date.now() - supplierCache.ts < CACHE_TTL) {
    return supplierCache.names;
  }
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    select: { name: true },
  });
  const names = new Set(suppliers.map(s => s.name));
  supplierCache = { names, ts: Date.now() };
  return names;
}

/**
 * Validate warehouse name against master data.
 * Returns null if valid or empty, returns error message if invalid.
 */
export async function validateWarehouse(warehouse) {
  if (!warehouse || !warehouse.trim()) return null; // empty is OK (optional)
  const valid = await getValidWarehouseNames();
  if (valid.has(warehouse.trim())) return null;
  return `館別「${warehouse}」不在主檔中，請先至設定頁面新增`;
}

/**
 * Validate supplier name against master data.
 * Returns null if valid or empty, returns error message if invalid.
 */
export async function validateSupplier(supplierName) {
  if (!supplierName || !supplierName.trim()) return null;
  const valid = await getValidSupplierNames();
  if (valid.has(supplierName.trim())) return null;
  return `供應商「${supplierName}」不在主檔中，請先至供應商頁面新增`;
}

/**
 * Clear caches (call after master data changes).
 */
export function clearMasterDataCache() {
  warehouseCache = { names: null, ts: 0 };
  supplierCache = { names: null, ts: 0 };
}
