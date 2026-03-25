import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createAlert, ALERT_CATEGORIES } from '@/lib/alert';

export const dynamic = 'force-dynamic';

// POST - 處理資料匯入（products / suppliers / accounting_subjects）
// 接受 JSON: { importType, data: [], options: { skipDuplicates, dryRun } }
export async function POST(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.IMPORT_EXECUTE);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { importType, data, options = {} } = body;

    // 驗證必填欄位
    if (!importType) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位: importType', 400);
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少匯入資料或資料為空陣列', 400);
    }

    const MAX_IMPORT_BATCH = 5000;
    if (data.length > MAX_IMPORT_BATCH) {
      return createErrorResponse('VALIDATION_FAILED', `單次匯入上限 ${MAX_IMPORT_BATCH} 筆，目前 ${data.length} 筆`, 400);
    }

    const validImportTypes = ['products', 'suppliers', 'accounting_subjects'];
    if (!validImportTypes.includes(importType)) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `無效的匯入類型: ${importType}，有效值為: ${validImportTypes.join(', ')}`,
        400
      );
    }

    const { skipDuplicates = false, dryRun = false } = options;

    // 根據 importType 分派驗證和匯入邏輯
    let result;
    switch (importType) {
      case 'products':
        result = await handleProductImport(data, { skipDuplicates, dryRun });
        break;
      case 'suppliers':
        result = await handleSupplierImport(data, { skipDuplicates, dryRun });
        break;
      case 'accounting_subjects':
        result = await handleAccountingSubjectImport(data, { skipDuplicates, dryRun });
        break;
    }

    if (result.hasErrors && !skipDuplicates && !dryRun) {
      return createErrorResponse(
        'IMPORT_DATA_VALIDATION_FAILED',
        `資料驗證失敗：${result.errors.length} 筆錯誤`,
        400,
        {
          importType,
          totalRows: data.length,
          validRows: result.validCount,
          errorRows: result.errors.length,
          errors: result.errors,
        }
      );
    }

    const statusCode = dryRun ? 200 : 201;

    return NextResponse.json(
      {
        success: true,
        importType,
        dryRun,
        skipDuplicates,
        totalRows: data.length,
        validRows: result.validCount,
        errorRows: result.errors.length,
        importedRows: result.importedCount || 0,
        skippedDuplicates: result.skippedCount || 0,
        errors: result.errors,
        message: dryRun
          ? `驗證完成：${result.validCount} 筆通過，${result.errors.length} 筆錯誤`
          : `匯入完成：成功 ${result.importedCount} 筆${result.skippedCount > 0 ? `，跳過重複 ${result.skippedCount} 筆` : ''}`,
      },
      { status: statusCode }
    );
  } catch (error) {
    createAlert(
      ALERT_CATEGORIES.IMPORT_FAILURE,
      '資料匯入失敗',
      error.message || 'Unknown import error',
      { route: '/api/import' }
    ).catch(() => {});
    return handleApiError(error, '/api/import');
  }
}

// ===== 產品匯入 =====
async function handleProductImport(data, { skipDuplicates, dryRun }) {
  const errors = [];
  const validItems = [];
  let skippedCount = 0;

  // 取得現有產品代碼
  const existingProducts = await prisma.product.findMany({
    select: { code: true },
  });
  const existingCodes = new Set(existingProducts.map(p => p.code));

  // 批次內唯一性檢查
  const seenCodes = new Set();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    const rowErrors = [];

    // 必填欄位驗證
    if (!row.code || String(row.code).trim() === '') {
      rowErrors.push({ field: 'code', message: '產品代碼為必填' });
    }
    if (!row.name || String(row.name).trim() === '') {
      rowErrors.push({ field: 'name', message: '產品名稱為必填' });
    }

    // 產品代碼長度限制
    if (row.code && String(row.code).length > 50) {
      rowErrors.push({ field: 'code', message: '產品代碼不可超過 50 字元' });
    }

    // 產品名稱長度限制
    if (row.name && String(row.name).length > 255) {
      rowErrors.push({ field: 'name', message: '產品名稱不可超過 255 字元' });
    }

    // productType 驗證
    if (row.productType) {
      const validTypes = ['goods', 'service', 'consumable'];
      if (!validTypes.includes(row.productType)) {
        rowErrors.push({ field: 'productType', message: `產品類型需為 ${validTypes.join('/')}` });
      }
    }

    // 價格驗證
    if (row.costPrice !== undefined && row.costPrice !== null && row.costPrice !== '') {
      const cost = parseFloat(row.costPrice);
      if (isNaN(cost) || cost < 0) {
        rowErrors.push({ field: 'costPrice', message: '成本價需為非負數' });
      }
    }

    if (row.salesPrice !== undefined && row.salesPrice !== null && row.salesPrice !== '') {
      const sales = parseFloat(row.salesPrice);
      if (isNaN(sales) || sales < 0) {
        rowErrors.push({ field: 'salesPrice', message: '售價需為非負數' });
      }
    }

    // 批次內重複檢查
    const code = row.code ? String(row.code).trim() : '';
    if (code && seenCodes.has(code)) {
      rowErrors.push({ field: 'code', message: `產品代碼 "${code}" 在此批次中重複` });
    }
    seenCodes.add(code);

    // 系統內重複檢查
    if (code && existingCodes.has(code)) {
      if (skipDuplicates) {
        skippedCount++;
        continue;
      } else {
        rowErrors.push({ field: 'code', message: `產品代碼 "${code}" 已存在於系統中` });
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNum, data: row, errors: rowErrors });
    } else {
      validItems.push({
        code: code,
        name: String(row.name).trim(),
        productType: row.productType || 'goods',
        category: row.category || null,
        unit: row.unit || null,
        costPrice: row.costPrice !== undefined && row.costPrice !== '' ? parseFloat(row.costPrice) : 0,
        salesPrice: row.salesPrice !== undefined && row.salesPrice !== '' ? parseFloat(row.salesPrice) : 0,
        isInStock: row.isInStock === true || row.isInStock === 'true',
        warehouseLocation: row.warehouseLocation || null,
        accountingSubject: row.accountingSubject || null,
        note: row.note || null,
        isActive: row.isActive !== false,
      });
    }
  }

  let importedCount = 0;

  // dryRun 模式：僅驗證不寫入
  if (!dryRun && validItems.length > 0) {
    // 使用 transaction 確保原子性
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.product.create({ data: item });
        importedCount++;
      }
    });
  }

  return {
    validCount: validItems.length,
    importedCount: dryRun ? 0 : importedCount,
    skippedCount,
    errors,
    hasErrors: errors.length > 0,
  };
}

// ===== 廠商匯入 =====
async function handleSupplierImport(data, { skipDuplicates, dryRun }) {
  const errors = [];
  const validItems = [];
  let skippedCount = 0;

  // 取得現有廠商（以 name 和 supplierCode 作為重複判斷基準）
  const existingSuppliers = await prisma.supplier.findMany({
    select: { name: true, supplierCode: true },
  });
  const existingNames = new Set(existingSuppliers.map(s => s.name));
  const existingSupplierCodes = new Set(
    existingSuppliers.filter(s => s.supplierCode).map(s => s.supplierCode)
  );

  // 批次內唯一性檢查
  const seenNames = new Set();
  const seenCodes = new Set();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    const rowErrors = [];

    // 必填欄位驗證
    if (!row.name || String(row.name).trim() === '') {
      rowErrors.push({ field: 'name', message: '廠商名稱為必填' });
    }

    // 名稱長度限制
    if (row.name && String(row.name).length > 255) {
      rowErrors.push({ field: 'name', message: '廠商名稱不可超過 255 字元' });
    }

    // supplierCode 長度限制
    if (row.supplierCode && String(row.supplierCode).length > 50) {
      rowErrors.push({ field: 'supplierCode', message: '廠商代碼不可超過 50 字元' });
    }

    // 電話格式（簡單驗證，非空即可）
    if (row.phone && String(row.phone).length > 50) {
      rowErrors.push({ field: 'phone', message: '電話號碼不可超過 50 字元' });
    }

    // Email 格式簡易驗證
    if (row.email && row.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.email)) {
        rowErrors.push({ field: 'email', message: 'Email 格式不正確' });
      }
    }

    const name = row.name ? String(row.name).trim() : '';
    const supplierCode = row.supplierCode ? String(row.supplierCode).trim() : '';

    // 批次內名稱重複檢查
    if (name && seenNames.has(name)) {
      rowErrors.push({ field: 'name', message: `廠商名稱 "${name}" 在此批次中重複` });
    }
    seenNames.add(name);

    // 批次內代碼重複檢查
    if (supplierCode && seenCodes.has(supplierCode)) {
      rowErrors.push({ field: 'supplierCode', message: `廠商代碼 "${supplierCode}" 在此批次中重複` });
    }
    if (supplierCode) seenCodes.add(supplierCode);

    // 系統內重複檢查（以 name 為主）
    if (name && existingNames.has(name)) {
      if (skipDuplicates) {
        skippedCount++;
        continue;
      } else {
        rowErrors.push({ field: 'name', message: `廠商名稱 "${name}" 已存在於系統中` });
      }
    }

    // 系統內 supplierCode 重複檢查
    if (supplierCode && existingSupplierCodes.has(supplierCode)) {
      if (skipDuplicates) {
        skippedCount++;
        continue;
      } else {
        rowErrors.push({ field: 'supplierCode', message: `廠商代碼 "${supplierCode}" 已存在於系統中` });
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNum, data: row, errors: rowErrors });
    } else {
      validItems.push({
        supplierCode: supplierCode || null,
        name: name,
        taxId: row.taxId || null,
        contact: row.contact || null,
        personInCharge: row.personInCharge || null,
        phone: row.phone || null,
        address: row.address || null,
        email: row.email || null,
        paymentTerms: row.paymentTerms || '月結',
        bankName: row.bankName || null,
        bankAccount: row.bankAccount || null,
        contractDate: row.contractDate || null,
        contractEndDate: row.contractEndDate || null,
        remarks: row.remarks || null,
        isActive: row.isActive !== false,
      });
    }
  }

  let importedCount = 0;

  if (!dryRun && validItems.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.supplier.create({ data: item });
        importedCount++;
      }
    });
  }

  return {
    validCount: validItems.length,
    importedCount: dryRun ? 0 : importedCount,
    skippedCount,
    errors,
    hasErrors: errors.length > 0,
  };
}

// ===== 會計科目匯入 =====
async function handleAccountingSubjectImport(data, { skipDuplicates, dryRun }) {
  const errors = [];
  const validItems = [];
  let skippedCount = 0;

  // 取得現有會計科目代碼
  const existingSubjects = await prisma.accountingSubject.findMany({
    select: { code: true },
  });
  const existingCodes = new Set(existingSubjects.map(s => s.code));

  // 批次內唯一性檢查
  const seenCodes = new Set();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 1;
    const rowErrors = [];

    // 必填欄位驗證
    if (!row.code || String(row.code).trim() === '') {
      rowErrors.push({ field: 'code', message: '科目代碼為必填' });
    }
    if (!row.name || String(row.name).trim() === '') {
      rowErrors.push({ field: 'name', message: '科目名稱為必填' });
    }
    if (!row.category || String(row.category).trim() === '') {
      rowErrors.push({ field: 'category', message: '科目類別為必填' });
    }
    if (!row.subcategory || String(row.subcategory).trim() === '') {
      rowErrors.push({ field: 'subcategory', message: '科目子類別為必填' });
    }

    // 長度限制
    if (row.code && String(row.code).length > 20) {
      rowErrors.push({ field: 'code', message: '科目代碼不可超過 20 字元' });
    }
    if (row.name && String(row.name).length > 100) {
      rowErrors.push({ field: 'name', message: '科目名稱不可超過 100 字元' });
    }
    if (row.category && String(row.category).length > 50) {
      rowErrors.push({ field: 'category', message: '科目類別不可超過 50 字元' });
    }
    if (row.subcategory && String(row.subcategory).length > 100) {
      rowErrors.push({ field: 'subcategory', message: '科目子類別不可超過 100 字元' });
    }

    const code = row.code ? String(row.code).trim() : '';

    // 批次內重複檢查
    if (code && seenCodes.has(code)) {
      rowErrors.push({ field: 'code', message: `科目代碼 "${code}" 在此批次中重複` });
    }
    seenCodes.add(code);

    // 系統內重複檢查
    if (code && existingCodes.has(code)) {
      if (skipDuplicates) {
        skippedCount++;
        continue;
      } else {
        rowErrors.push({ field: 'code', message: `科目代碼 "${code}" 已存在於系統中` });
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNum, data: row, errors: rowErrors });
    } else {
      validItems.push({
        code: code,
        name: String(row.name).trim(),
        category: String(row.category).trim(),
        subcategory: String(row.subcategory).trim(),
      });
    }
  }

  let importedCount = 0;

  if (!dryRun && validItems.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of validItems) {
        await tx.accountingSubject.create({ data: item });
        importedCount++;
      }
    });
  }

  return {
    validCount: validItems.length,
    importedCount: dryRun ? 0 : importedCount,
    skippedCount,
    errors,
    hasErrors: errors.length > 0,
  };
}
