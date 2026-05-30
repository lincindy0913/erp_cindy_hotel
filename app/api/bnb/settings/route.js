import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const BNB_CONFIG_KEYS = ['bnb_card_fee_rate'];

// GET /api/bnb/settings — BNB 相關系統設定（只需 BNB_VIEW 權限）
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.BNB_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: BNB_CONFIG_KEYS } },
      select: { key: true, value: true },
    });
    const result = Object.fromEntries(configs.map(c => [c.key, c.value]));
    // fallback defaults
    if (!result.bnb_card_fee_rate) result.bnb_card_fee_rate = '0.0165';
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
