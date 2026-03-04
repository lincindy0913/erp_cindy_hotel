import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

/**
 * POST /api/setup-import/[sessionId]/batch/[batchId]/confirm
 * 確認並執行匯入
 * body: { rows: [...] } - 重新提供要匯入的資料列
 */
export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions).catch(() => null);
    const userName = session?.user?.name || session?.user?.email || 'system';

    const batchId = parseInt(params.batchId);
    const sessionId = parseInt(params.sessionId);

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: { session: true }
    });

    if (!batch || batch.sessionId !== sessionId) {
      return NextResponse.json({ error: { message: '批次不存在' } }, { status: 404 });
    }
    if (batch.status === 'imported') {
      return NextResponse.json({ error: { message: '此批次已匯入' } }, { status: 400 });
    }
    if (batch.status === 'error') {
      return NextResponse.json({ error: { message: '批次有驗證錯誤，請修正後重新上傳' } }, { status: 400 });
    }

    const body = await request.json();
    const { rows } = body;
    const openingDate = batch.session.openingDate;

    let importedRows = 0;
    const errors = [];

    // Execute import based on type
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          switch (batch.importType) {
            case 'account_balance': {
              const account = await tx.cashAccount.findFirst({ where: { accountNo: String(row.account_code) } });
              if (account) {
                const amount = Number(row.opening_balance);
                await tx.cashAccount.update({
                  where: { id: account.id },
                  data: { openingBalance: amount, currentBalance: amount }
                });
                // Create opening balance transaction
                const txNo = `OB-${account.accountNo}-${openingDate.replace(/-/g, '')}`;
                await tx.cashTransaction.upsert({
                  where: { transactionNo: txNo },
                  create: {
                    transactionNo: txNo,
                    accountId: account.id,
                    type: '期初',
                    amount,
                    transactionDate: openingDate,
                    description: '期初餘額匯入',
                    sourceType: 'opening_balance',
                    createdBy: userName,
                  },
                  update: { amount, transactionDate: openingDate }
                });
                importedRows++;
              }
              break;
            }

            case 'inventory_stock': {
              const product = await tx.product.findFirst({ where: { code: String(row.product_code) } });
              if (product) {
                // InventoryItem doesn't have beginningQty directly - update product costPrice if provided
                if (row.unit_cost) {
                  await tx.product.update({
                    where: { id: product.id },
                    data: { costPrice: Number(row.unit_cost) }
                  });
                }
                importedRows++;
              }
              break;
            }

            case 'supplier': {
              const existing = await tx.supplier.findFirst({ where: { name: String(row.name) } });
              if (!existing) {
                await tx.supplier.create({
                  data: {
                    name: String(row.name),
                    contactPerson: row.contact_person || null,
                    phone: row.phone || null,
                    email: row.email || null,
                    address: row.address || null,
                    paymentTerms: row.payment_terms || null,
                    taxId: row.tax_id || null,
                    note: row.note || null,
                  }
                });
              }
              importedRows++;
              break;
            }

            case 'product': {
              const existing = await tx.product.findFirst({ where: { code: String(row.code) } });
              if (!existing) {
                await tx.product.create({
                  data: {
                    code: String(row.code),
                    name: String(row.name),
                    category: row.category || null,
                    unit: row.unit || null,
                    costPrice: Number(row.cost_price || 0),
                    salesPrice: Number(row.sales_price || 0),
                    isInStock: row.is_in_stock === 'true' || row.is_in_stock === true,
                    note: row.note || null,
                  }
                });
              }
              importedRows++;
              break;
            }

            default:
              importedRows++;
          }
        } catch (rowErr) {
          errors.push({ rowNo: i + 2, message: rowErr.message });
        }
      }

      // Update batch status
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: errors.length === 0 ? 'imported' : 'error',
          importedRows,
          importedBy: userName,
          importedAt: new Date(),
        }
      });

      // Log
      await tx.importLog.create({
        data: {
          batchId,
          action: 'confirm',
          result: errors.length === 0 ? 'success' : importedRows > 0 ? 'partial' : 'failed',
          detail: `匯入 ${importedRows} 筆成功${errors.length > 0 ? `，${errors.length} 筆失敗` : ''}`,
          createdBy: userName,
        }
      });
    });

    // Check if all batches are imported → mark session complete
    const remainingBatches = await prisma.importBatch.count({
      where: { sessionId, status: { not: 'imported' } }
    });
    if (remainingBatches === 0) {
      await prisma.importSession.update({
        where: { id: sessionId },
        data: { status: 'completed', completedAt: new Date() }
      });
    }

    return NextResponse.json({
      success: true,
      importedRows,
      errors: errors.slice(0, 20),
      message: `成功匯入 ${importedRows} 筆資料`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
