import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

const VALID_TYPES = [
  'account_balance', 'inventory_stock', 'loan', 'accounts_payable',
  'rental_property', 'rental_tenant', 'rental_contract', 'supplier', 'product'
];

/**
 * POST /api/setup-import/[sessionId]/batch
 * 上傳並驗證匯入批次資料
 * body: { importType, fileName, rows: [...] }
 */
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userName = session?.user?.name || session?.user?.email || 'system';

    const sessionId = parseInt(params.sessionId);
    const importSession = await prisma.importSession.findUnique({ where: { id: sessionId } });
    if (!importSession) {
      return NextResponse.json({ error: { message: '匯入作業不存在' } }, { status: 404 });
    }
    if (importSession.status === 'archived') {
      return NextResponse.json({ error: { message: '匯入作業已封存，無法繼續匯入' } }, { status: 403 });
    }

    const body = await request.json();
    const { importType, fileName, rows } = body;

    if (!VALID_TYPES.includes(importType)) {
      return NextResponse.json({ error: { message: `無效的匯入類型: ${importType}` } }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: { message: '無匯入資料' } }, { status: 400 });
    }

    // Validate rows according to type
    const { validRows, errorRows, errorDetails } = await validateRows(importType, rows, importSession.openingDate);

    // Create or update batch record
    const existingBatch = await prisma.importBatch.findFirst({
      where: { sessionId, importType, status: { not: 'imported' } }
    });

    let batch;
    if (existingBatch) {
      batch = await prisma.importBatch.update({
        where: { id: existingBatch.id },
        data: {
          status: errorRows > 0 ? 'error' : 'validated',
          fileName: fileName || existingBatch.fileName,
          totalRows: rows.length,
          validRows,
          errorRows,
          importedRows: 0,
          errorDetails: errorDetails.length > 0 ? errorDetails : null,
          updatedAt: new Date(),
        }
      });
    } else {
      batch = await prisma.importBatch.create({
        data: {
          sessionId,
          importType,
          status: errorRows > 0 ? 'error' : 'validated',
          fileName: fileName || null,
          totalRows: rows.length,
          validRows,
          errorRows,
          errorDetails: errorDetails.length > 0 ? errorDetails : null,
        }
      });
    }

    // Log the action
    await prisma.importLog.create({
      data: {
        batchId: batch.id,
        action: 'validate',
        result: errorRows === 0 ? 'success' : errorRows < rows.length ? 'partial' : 'failed',
        detail: `驗證 ${rows.length} 筆，${validRows} 筆通過，${errorRows} 筆錯誤`,
        createdBy: userName,
      }
    });

    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      totalRows: rows.length,
      validRows,
      errorRows,
      errorDetails: errorDetails.slice(0, 50), // Return first 50 errors
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Validate rows based on import type
 */
async function validateRows(importType, rows, openingDate) {
  const errorDetails = [];
  let validCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // 1-indexed, +1 for header
    const rowErrors = [];

    switch (importType) {
      case 'account_balance':
        if (!row.account_code) rowErrors.push({ field: 'account_code', message: '帳戶代碼為必填' });
        if (row.opening_balance === undefined || row.opening_balance === '') rowErrors.push({ field: 'opening_balance', message: '期初餘額為必填' });
        else if (isNaN(Number(row.opening_balance))) rowErrors.push({ field: 'opening_balance', message: '期初餘額必須為數值' });
        if (row.account_code) {
          const account = await prisma.cashAccount.findFirst({ where: { accountNo: String(row.account_code) } }).catch(() => null);
          if (!account) rowErrors.push({ field: 'account_code', message: `帳戶代碼 ${row.account_code} 不存在` });
        }
        break;

      case 'inventory_stock':
        if (!row.product_code) rowErrors.push({ field: 'product_code', message: '產品代碼為必填' });
        if (!row.warehouse) rowErrors.push({ field: 'warehouse', message: '館別為必填' });
        if (row.beginning_qty === undefined) rowErrors.push({ field: 'beginning_qty', message: '期初存量為必填' });
        else if (isNaN(Number(row.beginning_qty)) || Number(row.beginning_qty) < 0) rowErrors.push({ field: 'beginning_qty', message: '期初存量必須為非負整數' });
        break;

      case 'loan':
        if (!row.loan_name) rowErrors.push({ field: 'loan_name', message: '貸款名稱為必填' });
        if (!row.bank_name) rowErrors.push({ field: 'bank_name', message: '貸款銀行為必填' });
        if (!row.warehouse) rowErrors.push({ field: 'warehouse', message: '館別為必填' });
        if (!row.original_amount || isNaN(Number(row.original_amount))) rowErrors.push({ field: 'original_amount', message: '原始貸款金額為必填且須為數值' });
        if (!row.current_balance || isNaN(Number(row.current_balance))) rowErrors.push({ field: 'current_balance', message: '剩餘本金為必填且須為數值' });
        break;

      case 'accounts_payable':
        if (!row.supplier_name) rowErrors.push({ field: 'supplier_name', message: '廠商名稱為必填' });
        if (!row.invoice_no) rowErrors.push({ field: 'invoice_no', message: '發票號碼為必填' });
        if (!row.amount || isNaN(Number(row.amount))) rowErrors.push({ field: 'amount', message: '金額為必填且須為數值' });
        break;

      case 'supplier':
        if (!row.name) rowErrors.push({ field: 'name', message: '廠商名稱為必填' });
        break;

      case 'product':
        if (!row.code) rowErrors.push({ field: 'code', message: '產品代碼為必填' });
        if (!row.name) rowErrors.push({ field: 'name', message: '產品名稱為必填' });
        break;

      case 'rental_property':
        if (!row.property_name) rowErrors.push({ field: 'property_name', message: '物業名稱為必填' });
        if (!row.address) rowErrors.push({ field: 'address', message: '地址為必填' });
        break;

      case 'rental_tenant':
        if (!row.name) rowErrors.push({ field: 'name', message: '租客姓名為必填' });
        break;

      case 'rental_contract':
        if (!row.property_name) rowErrors.push({ field: 'property_name', message: '物業名稱為必填' });
        if (!row.tenant_name) rowErrors.push({ field: 'tenant_name', message: '租客姓名為必填' });
        if (!row.start_date) rowErrors.push({ field: 'start_date', message: '租約開始日期為必填' });
        if (!row.monthly_rent || isNaN(Number(row.monthly_rent))) rowErrors.push({ field: 'monthly_rent', message: '月租金為必填且須為數值' });
        break;
    }

    if (rowErrors.length > 0) {
      errorDetails.push({ rowNo, errors: rowErrors });
    } else {
      validCount++;
    }
  }

  return { validRows: validCount, errorRows: rows.length - validCount, errorDetails };
}
