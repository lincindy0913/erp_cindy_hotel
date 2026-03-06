import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: List records with filters (month, warehouse, status, templateId)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const warehouse = searchParams.get('warehouse');
    const status = searchParams.get('status');
    const templateId = searchParams.get('templateId');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 50;

    const where = {};
    if (month) where.expenseMonth = month;
    if (warehouse) where.warehouse = warehouse;
    if (status) where.status = status;
    if (templateId) where.templateId = parseInt(templateId);

    const [records, total] = await Promise.all([
      prisma.commonExpenseRecord.findMany({
        where,
        include: {
          template: {
            select: { id: true, name: true, categoryId: true, category: true }
          },
          entryLines: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.commonExpenseRecord.count({ where })
    ]);

    const result = records.map(r => ({
      ...r,
      totalDebit: Number(r.totalDebit),
      totalCredit: Number(r.totalCredit),
      entryLines: r.entryLines.map(line => ({
        ...line,
        amount: Number(line.amount)
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null
    }));

    return NextResponse.json({
      records: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create record from template execution
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.templateId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用範本', 400);
    }
    if (!data.warehouse?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }
    if (!data.expenseMonth?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用月份', 400);
    }
    if (!data.entryLines || data.entryLines.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆分錄', 400);
    }
    if (!data.createdBy?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少建立者資訊', 400);
    }

    // Validate debit = credit balance
    const debitTotal = data.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const creditTotal = data.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    if (Math.abs(debitTotal - creditTotal) > 0.01) {
      return createErrorResponse('VALIDATION_FAILED', `借貸不平衡：借方 ${debitTotal.toFixed(2)} ≠ 貸方 ${creditTotal.toFixed(2)}`, 400);
    }

    if (debitTotal <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '金額必須大於 0', 400);
    }

    // Check for duplicate: same template + warehouse + month (only non-voided)
    const duplicate = await prisma.commonExpenseRecord.findFirst({
      where: {
        templateId: parseInt(data.templateId),
        warehouse: data.warehouse.trim(),
        expenseMonth: data.expenseMonth.trim(),
        status: { not: '已作廢' }
      }
    });

    if (duplicate && !data.allowDuplicate) {
      return createErrorResponse('CONFLICT_UNIQUE', `此範本在 ${data.warehouse} ${data.expenseMonth} 已有記錄 (${duplicate.recordNo})，確定要再新增嗎？`, 409, { duplicate: true });
    }

    // Generate recordNo: EXP-YYYYMMDD-XXXX
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = `EXP-${dateStr}-`;

    const lastRecord = await prisma.commonExpenseRecord.findFirst({
      where: {
        recordNo: { startsWith: todayStart }
      },
      orderBy: { recordNo: 'desc' }
    });

    let seq = 1;
    if (lastRecord) {
      const lastSeq = parseInt(lastRecord.recordNo.split('-').pop());
      seq = lastSeq + 1;
    }
    const recordNo = `${todayStart}${String(seq).padStart(4, '0')}`;

    const record = await prisma.commonExpenseRecord.create({
      data: {
        recordNo,
        templateId: parseInt(data.templateId),
        warehouse: data.warehouse.trim(),
        expenseMonth: data.expenseMonth.trim(),
        supplierId: data.supplierId ? parseInt(data.supplierId) : null,
        supplierName: data.supplierName?.trim() || null,
        paymentMethod: data.paymentMethod?.trim() || null,
        totalDebit: debitTotal,
        totalCredit: creditTotal,
        status: '待確認',
        note: data.note?.trim() || null,
        createdBy: data.createdBy.trim(),
        entryLines: {
          create: data.entryLines.map((line, idx) => ({
            entryType: line.entryType,
            accountingCode: line.accountingCode,
            accountingName: line.accountingName,
            summary: line.summary || '',
            amount: parseFloat(line.amount),
            sortOrder: line.sortOrder ?? idx
          }))
        }
      },
      include: {
        template: {
          select: { id: true, name: true }
        },
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    const result = {
      ...record,
      totalDebit: Number(record.totalDebit),
      totalCredit: Number(record.totalCredit),
      entryLines: record.entryLines.map(line => ({
        ...line,
        amount: Number(line.amount)
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
