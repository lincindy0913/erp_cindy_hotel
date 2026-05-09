import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// 預設會計科目，含損益表分層
const DEFAULT_CATEGORIES = [
  // ── 收入科目 ──────────────────────────────────────────
  { name: '住宿收入－現金',      type: '收入', level1: '收入', plGroup: '住宿收入', plOrder: 10, systemCode: 'pms_cash_income',    isSystemDefault: true },
  { name: '住宿收入－信用卡',    type: '收入', level1: '收入', plGroup: '住宿收入', plOrder: 11, systemCode: 'pms_cc_income',      isSystemDefault: true },
  { name: '住宿收入－匯款轉帳',  type: '收入', level1: '收入', plGroup: '住宿收入', plOrder: 12, systemCode: 'pms_wire_income',    isSystemDefault: true },
  { name: '住宿收入－訂金轉認列', type: '收入', level1: '收入', plGroup: '住宿收入', plOrder: 13, systemCode: 'pms_deposit_income', isSystemDefault: true },
  { name: 'PMS月結收入',         type: '收入', level1: '收入', plGroup: '住宿收入', plOrder: 14, systemCode: 'pms_income_settlement', isSystemDefault: true },
  { name: '其他收入',            type: '收入', level1: '收入', plGroup: '其他收入', plOrder: 50, systemCode: 'other_income',       isSystemDefault: false },
  { name: '利息收入',            type: '收入', level1: '業外', plGroup: '業外收支', plOrder: 80, systemCode: 'interest_income',    isSystemDefault: false },

  // ── 費用科目（收款成本）────────────────────────────────
  { name: '信用卡手續費',        type: '支出', level1: '費用', plGroup: '收款成本', plOrder: 20, systemCode: 'pms_cc_fee',         isSystemDefault: true },
  { name: 'PMS月結手續費',       type: '支出', level1: '費用', plGroup: '收款成本', plOrder: 21, systemCode: 'pms_income_fee',     isSystemDefault: true },
  { name: '旅行社佣金',          type: '支出', level1: '費用', plGroup: '收款成本', plOrder: 22, systemCode: 'agency_commission',   isSystemDefault: false },

  // ── 費用科目（人事費用）────────────────────────────────
  { name: '薪資費用',            type: '支出', level1: '費用', plGroup: '人事費用', plOrder: 30, systemCode: 'salary',             isSystemDefault: false },
  { name: '勞健保費',            type: '支出', level1: '費用', plGroup: '人事費用', plOrder: 31, systemCode: 'insurance',          isSystemDefault: false },

  // ── 費用科目（行政費用）────────────────────────────────
  { name: '水電瓦斯費',          type: '支出', level1: '費用', plGroup: '行政費用', plOrder: 40, systemCode: 'utilities',          isSystemDefault: false },
  { name: '維修保養費',          type: '支出', level1: '費用', plGroup: '行政費用', plOrder: 41, systemCode: 'maintenance',        isSystemDefault: false },
  { name: '行銷廣告費',          type: '支出', level1: '費用', plGroup: '行政費用', plOrder: 42, systemCode: 'marketing',          isSystemDefault: false },
  { name: '辦公費用',            type: '支出', level1: '費用', plGroup: '行政費用', plOrder: 43, systemCode: 'office_expense',     isSystemDefault: false },
  { name: '銀行手續費',          type: '支出', level1: '費用', plGroup: '行政費用', plOrder: 44, systemCode: 'bank_fee',           isSystemDefault: false },

  // ── 費用科目（業外）────────────────────────────────────
  { name: '利息支出',            type: '支出', level1: '業外', plGroup: '業外收支', plOrder: 81, systemCode: 'interest_expense',   isSystemDefault: false },

  // ── 其他支出────────────────────────────────────────────
  { name: '其他費用',            type: '支出', level1: '費用', plGroup: '其他費用', plOrder: 60, systemCode: 'other_expense',      isSystemDefault: false },
];

// POST: 初始化/補齊預設科目（冪等：已存在 systemCode 者跳過）
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  if (!auth.ok) return auth.response;

  try {
    let created = 0;
    let skipped = 0;
    let updated = 0;

    const { forceUpdate } = await request.json().catch(() => ({}));

    for (const cat of DEFAULT_CATEGORIES) {
      const existing = cat.systemCode
        ? await prisma.cashCategory.findFirst({ where: { systemCode: cat.systemCode } })
        : null;

      if (!existing) {
        await prisma.cashCategory.create({
          data: {
            name: cat.name,
            type: cat.type,
            level1: cat.level1,
            plGroup: cat.plGroup,
            plOrder: cat.plOrder,
            systemCode: cat.systemCode,
            isSystemDefault: cat.isSystemDefault ?? false,
            isActive: true,
          },
        });
        created++;
      } else if (forceUpdate) {
        await prisma.cashCategory.update({
          where: { id: existing.id },
          data: {
            level1: cat.level1,
            plGroup: cat.plGroup,
            plOrder: cat.plOrder,
            isSystemDefault: cat.isSystemDefault ?? existing.isSystemDefault,
          },
        });
        updated++;
      } else {
        // 若現有科目缺少 level1/plGroup，補上
        if (!existing.level1 || !existing.plGroup) {
          await prisma.cashCategory.update({
            where: { id: existing.id },
            data: { level1: cat.level1, plGroup: cat.plGroup, plOrder: cat.plOrder },
          });
          updated++;
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({ success: true, created, updated, skipped });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET: 預覽預設科目清單
export async function GET() {
  return NextResponse.json(DEFAULT_CATEGORIES);
}
