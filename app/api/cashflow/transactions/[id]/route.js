import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Helper: recalculate account balance
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true }
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;

    if (t.type === '收入') {
      balance += amt;
    } else if (t.type === '支出') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉入') {
      balance += amt;
    }
  }

  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '交易不存在' }, { status: 404 });
    }

    // 移轉交易不允許單獨編輯
    if (existing.type === '移轉' || existing.type === '移轉入') {
      return NextResponse.json({ error: '移轉交易無法單獨編輯，請刪除後重新建立' }, { status: 400 });
    }

    const updateData = {};
    if (data.transactionDate !== undefined) updateData.transactionDate = data.transactionDate;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId ? parseInt(data.categoryId) : null;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId ? parseInt(data.supplierId) : null;
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.fee !== undefined) updateData.fee = parseFloat(data.fee);
    if (data.hasFee !== undefined) updateData.hasFee = data.hasFee;
    if (data.accountingSubject !== undefined) updateData.accountingSubject = data.accountingSubject || null;
    if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.paymentNo !== undefined) updateData.paymentNo = data.paymentNo || null;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.cashTransaction.update({
        where: { id },
        data: updateData
      });

      await recalcBalance(tx, updated.accountId);

      return updated;
    });

    return NextResponse.json({
      ...result,
      amount: Number(result.amount),
      fee: Number(result.fee),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString()
    });
  } catch (error) {
    console.error('更新資金交易錯誤:', error);
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.cashTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '交易不存在' }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const accountIds = new Set([existing.accountId]);

      // If transfer, delete both linked transactions
      if ((existing.type === '移轉' || existing.type === '移轉入') && existing.linkedTransactionId) {
        const linked = await tx.cashTransaction.findUnique({
          where: { id: existing.linkedTransactionId }
        });
        if (linked) {
          accountIds.add(linked.accountId);
          await tx.cashTransaction.delete({ where: { id: linked.id } });
        }
      }

      await tx.cashTransaction.delete({ where: { id } });

      // Recalculate all affected accounts
      for (const accId of accountIds) {
        await recalcBalance(tx, accId);
      }

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('刪除資金交易錯誤:', error);
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 });
  }
}
