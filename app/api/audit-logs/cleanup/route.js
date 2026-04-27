import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS, ROLE_CODES } from '@/lib/permissions';
import { auditFromSession } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// 保留政策（天數）
const RETENTION = {
  operation: null, // 由 retentionDays 參數決定
  attempt:   null, // 由 retentionDays 參數決定
  finance:   730,  // 財務日誌最少保留 2 年
  admin:     365,  // 管理日誌最少保留 1 年
};

// POST: 預覽或執行清理
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  if (!auth.ok) return auth.response;

  // 只有 admin 可以執行清理
  const role = auth.session?.user?.role;
  if (role !== ROLE_CODES.ADMIN) {
    return createErrorResponse('FORBIDDEN', '只有系統管理員可以執行日誌清理', 403);
  }

  try {
    const body = await request.json();
    const preview = body.preview === true;
    const retentionDays = Math.max(30, Math.min(3650, parseInt(body.retentionDays) || 90));

    const now = new Date();

    const cutoffs = {
      operation: new Date(now.getTime() - retentionDays * 86400000),
      attempt:   new Date(now.getTime() - retentionDays * 86400000),
      finance:   new Date(now.getTime() - RETENTION.finance * 86400000),
      admin:     new Date(now.getTime() - RETENTION.admin * 86400000),
    };

    if (preview) {
      // 只計算筆數，不刪除
      const [opCount, attCount, finCount, admCount] = await Promise.all([
        prisma.auditLog.count({ where: { level: 'operation', createdAt: { lt: cutoffs.operation } } }),
        prisma.auditLog.count({ where: { level: 'attempt',   createdAt: { lt: cutoffs.attempt   } } }),
        prisma.auditLog.count({ where: { level: 'finance',   createdAt: { lt: cutoffs.finance   } } }),
        prisma.auditLog.count({ where: { level: 'admin',     createdAt: { lt: cutoffs.admin     } } }),
      ]);

      return NextResponse.json({
        preview: true,
        counts: {
          operation: opCount,
          attempt:   attCount,
          finance:   finCount,
          admin:     admCount,
          total:     opCount + attCount + finCount + admCount,
        },
        cutoffs: {
          operation: cutoffs.operation.toISOString().split('T')[0],
          attempt:   cutoffs.attempt.toISOString().split('T')[0],
          finance:   cutoffs.finance.toISOString().split('T')[0],
          admin:     cutoffs.admin.toISOString().split('T')[0],
        },
        retentionDays,
      });
    }

    // 實際刪除（逐層執行，避免單筆超大 delete）
    const [opDel, attDel, finDel, admDel] = await Promise.all([
      prisma.auditLog.deleteMany({ where: { level: 'operation', createdAt: { lt: cutoffs.operation } } }),
      prisma.auditLog.deleteMany({ where: { level: 'attempt',   createdAt: { lt: cutoffs.attempt   } } }),
      prisma.auditLog.deleteMany({ where: { level: 'finance',   createdAt: { lt: cutoffs.finance   } } }),
      prisma.auditLog.deleteMany({ where: { level: 'admin',     createdAt: { lt: cutoffs.admin     } } }),
    ]);

    const total = opDel.count + attDel.count + finDel.count + admDel.count;

    // 記錄這次清理動作本身
    await auditFromSession(prisma, auth.session, {
      action: 'audit_log.cleanup',
      level: 'admin',
      targetModule: 'audit-logs',
      afterState: {
        retentionDays,
        deleted: { operation: opDel.count, attempt: attDel.count, finance: finDel.count, admin: admDel.count, total },
      },
      note: `清理 ${retentionDays} 天前的操作/嘗試日誌，共刪除 ${total} 筆`,
    });

    return NextResponse.json({
      preview: false,
      deleted: { operation: opDel.count, attempt: attDel.count, finance: finDel.count, admin: admDel.count, total },
      retentionDays,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
