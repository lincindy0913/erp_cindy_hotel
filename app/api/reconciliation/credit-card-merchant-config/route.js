import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 取得所有信用卡特約商店設定
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const configs = await prisma.creditCardMerchantConfig.findMany({
      include: { warehouse: { select: { id: true, name: true } } },
      orderBy: { warehouseId: 'asc' },
    });
    return NextResponse.json(configs);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增/更新信用卡特約商店設定
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { warehouseId, bankName, merchantId, merchantName, accountNo, accountName, cashAccountId, domesticFeeRate, foreignFeeRate, selfFeeRate } = data;

    if (!warehouseId || !bankName || !merchantId) {
      return NextResponse.json({ error: '館別、銀行名稱、特店代號為必填' }, { status: 400 });
    }

    const result = await prisma.creditCardMerchantConfig.upsert({
      where: { warehouseId_merchantId: { warehouseId: parseInt(warehouseId), merchantId: merchantId.trim() } },
      update: {
        bankName: bankName.trim(),
        merchantName: merchantName?.trim() || '',
        accountNo: accountNo?.trim() || null,
        accountName: accountName?.trim() || null,
        cashAccountId: cashAccountId ? parseInt(cashAccountId) : null,
        domesticFeeRate: domesticFeeRate ?? 1.70,
        foreignFeeRate: foreignFeeRate ?? 2.30,
        selfFeeRate: selfFeeRate ?? 1.70,
      },
      create: {
        warehouseId: parseInt(warehouseId),
        bankName: bankName.trim(),
        merchantId: merchantId.trim(),
        merchantName: merchantName?.trim() || '',
        accountNo: accountNo?.trim() || null,
        accountName: accountName?.trim() || null,
        cashAccountId: cashAccountId ? parseInt(cashAccountId) : null,
        domesticFeeRate: domesticFeeRate ?? 1.70,
        foreignFeeRate: foreignFeeRate ?? 2.30,
        selfFeeRate: selfFeeRate ?? 1.70,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除特約商店設定
export async function DELETE(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

    await prisma.creditCardMerchantConfig.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
