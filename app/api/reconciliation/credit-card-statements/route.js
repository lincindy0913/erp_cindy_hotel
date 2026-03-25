import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 查詢信用卡對帳單
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouseId');
    const month = searchParams.get('month'); // YYYY-MM
    const status = searchParams.get('status');

    const where = {};
    if (warehouseId) where.warehouseId = parseInt(warehouseId);
    if (status && status !== 'all') where.status = status;
    if (month) {
      // Filter by billing date starting with YYYY/MM or YYYY-MM
      const [y, m] = month.split('-');
      where.billingDate = { startsWith: `${y}/${m.padStart(2, '0')}` };
    }

    const statements = await prisma.creditCardStatement.findMany({
      where,
      include: {
        batchLines: { orderBy: [{ terminalId: 'asc' }, { batchNo: 'asc' }, { cardType: 'asc' }] },
        feeDetails: { orderBy: [{ origin: 'asc' }, { cardType: 'asc' }] },
      },
      orderBy: [{ billingDate: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json(statements.map(s => ({
      ...s,
      totalAmount: Number(s.totalAmount || 0),
      adjustment: Number(s.adjustment || 0),
      totalFee: Number(s.totalFee || 0),
      serviceFee: Number(s.serviceFee || 0),
      otherFee: Number(s.otherFee || 0),
      netAmount: Number(s.netAmount || 0),
      pmsAmount: s.pmsAmount != null ? Number(s.pmsAmount) : null,
      difference: s.difference != null ? Number(s.difference) : null,
      batchLines: s.batchLines.map(l => ({ ...l, amount: Number(l.amount) })),
      feeDetails: s.feeDetails.map(d => ({ ...d, amount: Number(d.amount), fee: Number(d.fee), feeRate: d.feeRate ? Number(d.feeRate) : null })),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增信用卡對帳單 (手動或 PDF 解析)
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    // action: 'upload_parsed' (from PDF parsing on client) or manual creation
    if (data.action === 'upload_parsed') {
      return await handleParsedUpload(data);
    }

    // Manual creation
    const { warehouseId, warehouse, bankName, merchantId, merchantName, billingDate, paymentDate,
      accountNo, totalCount, totalAmount, adjustment, totalFee, serviceFee, otherFee, netAmount,
      batchLines, feeDetails, note } = data;

    if (!warehouseId || !billingDate || totalAmount == null) {
      return NextResponse.json({ error: '館別、請款日、請款金額為必填' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const stmt = await tx.creditCardStatement.create({
        data: {
          warehouseId: parseInt(warehouseId),
          warehouse: warehouse || '',
          bankName: bankName || '',
          merchantId: merchantId || null,
          merchantName: merchantName || null,
          billingDate,
          paymentDate: paymentDate || null,
          accountNo: accountNo || null,
          totalCount: parseInt(totalCount) || 0,
          totalAmount: parseFloat(totalAmount) || 0,
          adjustment: parseFloat(adjustment) || 0,
          totalFee: parseFloat(totalFee) || 0,
          serviceFee: parseFloat(serviceFee) || 0,
          otherFee: parseFloat(otherFee) || 0,
          netAmount: parseFloat(netAmount) || 0,
          status: 'pending',
          note: note || null,
        },
      });

      if (Array.isArray(batchLines) && batchLines.length > 0) {
        await tx.creditCardBatchLine.createMany({
          data: batchLines.map(l => ({
            statementId: stmt.id,
            billingDate: l.billingDate || billingDate,
            settlementDate: l.settlementDate || null,
            terminalId: l.terminalId || null,
            batchNo: l.batchNo || null,
            cardType: l.cardType || '',
            count: parseInt(l.count) || 0,
            amount: parseFloat(l.amount) || 0,
          })),
        });
      }

      if (Array.isArray(feeDetails) && feeDetails.length > 0) {
        await tx.creditCardFeeDetail.createMany({
          data: feeDetails.map(d => ({
            statementId: stmt.id,
            origin: d.origin || '',
            cardType: d.cardType || '',
            count: parseInt(d.count) || 0,
            amount: parseFloat(d.amount) || 0,
            fee: parseFloat(d.fee) || 0,
            feeRate: d.feeRate ? parseFloat(d.feeRate) : null,
          })),
        });
      }

      return stmt;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// Handle parsed PDF data (array of statements)
async function handleParsedUpload(data) {
  const { statements } = data;
  if (!Array.isArray(statements) || statements.length === 0) {
    return NextResponse.json({ error: '無有效的對帳單資料' }, { status: 400 });
  }

  const results = [];
  for (const s of statements) {
    const result = await prisma.$transaction(async (tx) => {
      // Check duplicate
      const existing = await tx.creditCardStatement.findFirst({
        where: {
          warehouseId: parseInt(s.warehouseId),
          billingDate: s.billingDate,
          merchantId: s.merchantId || undefined,
        },
      });
      if (existing) return { ...existing, skipped: true };

      const stmt = await tx.creditCardStatement.create({
        data: {
          warehouseId: parseInt(s.warehouseId),
          warehouse: s.warehouse || '',
          bankName: s.bankName || '',
          merchantId: s.merchantId || null,
          merchantName: s.merchantName || null,
          billingDate: s.billingDate,
          paymentDate: s.paymentDate || null,
          accountNo: s.accountNo || null,
          totalCount: parseInt(s.totalCount) || 0,
          totalAmount: parseFloat(s.totalAmount) || 0,
          adjustment: parseFloat(s.adjustment) || 0,
          totalFee: parseFloat(s.totalFee) || 0,
          serviceFee: parseFloat(s.serviceFee) || 0,
          otherFee: parseFloat(s.otherFee) || 0,
          netAmount: parseFloat(s.netAmount) || 0,
          status: 'pending',
          note: s.note || null,
        },
      });

      if (Array.isArray(s.batchLines)) {
        await tx.creditCardBatchLine.createMany({
          data: s.batchLines.map(l => ({
            statementId: stmt.id,
            billingDate: l.billingDate || s.billingDate,
            settlementDate: l.settlementDate || null,
            terminalId: l.terminalId || null,
            batchNo: l.batchNo || null,
            cardType: l.cardType || '',
            count: parseInt(l.count) || 0,
            amount: parseFloat(l.amount) || 0,
          })),
        });
      }

      if (Array.isArray(s.feeDetails)) {
        await tx.creditCardFeeDetail.createMany({
          data: s.feeDetails.map(d => ({
            statementId: stmt.id,
            origin: d.origin || '',
            cardType: d.cardType || '',
            count: parseInt(d.count) || 0,
            amount: parseFloat(d.amount) || 0,
            fee: parseFloat(d.fee) || 0,
            feeRate: d.feeRate ? parseFloat(d.feeRate) : null,
          })),
        });
      }

      return stmt;
    });

    results.push(result);
  }

  const created = results.filter(r => !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;

  return NextResponse.json({ created, skipped, results }, { status: 201 });
}

// DELETE: 刪除對帳單
export async function DELETE(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    const stmt = await prisma.creditCardStatement.findUnique({ where: { id: parseInt(id) } });
    if (!stmt) return NextResponse.json({ error: '找不到對帳單' }, { status: 404 });
    if (stmt.status === 'confirmed') {
      return NextResponse.json({ error: '已確認的對帳單不可刪除' }, { status: 400 });
    }

    await prisma.creditCardStatement.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: 更新狀態 (確認/比對PMS)
export async function PUT(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { id, action } = data;

    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    if (action === 'match_pms') {
      // 比對 PMS 信用卡收入
      const stmt = await prisma.creditCardStatement.findUnique({ where: { id: parseInt(id) } });
      if (!stmt) return NextResponse.json({ error: '找不到對帳單' }, { status: 404 });

      // Find PMS credit card income for this warehouse on billing date
      const pmsRecords = await prisma.pmsIncomeRecord.findMany({
        where: {
          warehouse: stmt.warehouse,
          businessDate: stmt.billingDate.replace(/\//g, '-'),
          pmsColumnName: { contains: '信用卡' },
        },
      });

      const pmsAmount = pmsRecords.reduce((sum, r) => sum + Number(r.amount), 0);
      const difference = pmsAmount - Number(stmt.totalAmount);

      const updated = await prisma.creditCardStatement.update({
        where: { id: parseInt(id) },
        data: {
          pmsAmount,
          difference,
          status: Math.abs(difference) < 1 ? 'matched' : 'pending',
        },
      });

      return NextResponse.json({
        ...updated,
        totalAmount: Number(updated.totalAmount),
        pmsAmount: Number(updated.pmsAmount),
        difference: Number(updated.difference),
        pmsRecords: pmsRecords.map(r => ({ ...r, amount: Number(r.amount) })),
      });
    }

    if (action === 'confirm') {
      const updated = await prisma.creditCardStatement.update({
        where: { id: parseInt(id) },
        data: {
          status: 'confirmed',
          confirmedBy: auth.session?.user?.name || 'system',
          confirmedAt: new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    if (action === 'unconfirm') {
      const updated = await prisma.creditCardStatement.update({
        where: { id: parseInt(id) },
        data: { status: 'pending', confirmedBy: null, confirmedAt: null },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: '未知的 action' }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
