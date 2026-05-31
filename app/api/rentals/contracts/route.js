import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr, localDateStr } from '@/lib/localDate';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// Auto-generate contractNo: RC-YYYYMMDD-XXX
async function generateContractNo() {
  const now = new Date();
  const dateStr = localDateStr(now).replace(/-/g, '');
  const prefix = `RC-${dateStr}-`;

  const existing = await prisma.rentalContract.findMany({
    where: { contractNo: { startsWith: prefix } },
    select: { contractNo: true }
  });

  let maxSeq = 0;
  for (const c of existing) {
    const seq = parseInt(c.contractNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const propertyId = searchParams.get('propertyId');
    const tenantId = searchParams.get('tenantId');

    // 自動將 endDate 已過期的 active 合約更新為 expired
    const today = todayStr();
    await prisma.rentalContract.updateMany({
      where: { status: 'active', endDate: { lt: today } },
      data: { status: 'expired' },
    });

    const where = {};
    if (status) where.status = status;
    if (propertyId) where.propertyId = parseInt(propertyId);
    if (tenantId) where.tenantId = parseInt(tenantId);

    const LIMIT = 2000;
    const [contracts, total] = await Promise.all([
      prisma.rentalContract.findMany({
        where,
        include: {
          property:  { select: { id: true, name: true, buildingName: true, sortOrder: true, category: true } },
          tenant:    { select: { id: true, fullName: true, companyName: true, tenantType: true, phone: true } },
          reminders: { orderBy: { createdAt: 'desc' }, take: 1,
                       select: { id: true, sentAt: true, sentBy: true, channel: true } },
        },
        orderBy: [{ property: { sortOrder: 'asc' } }, { id: 'asc' }],
        take: LIMIT,
      }),
      prisma.rentalContract.count({ where }),
    ]);

    const result = contracts.map(c => ({
      ...c,
      propertyName:   c.property.name,
      tenantName:     c.tenant.tenantType === 'company' ? c.tenant.companyName : c.tenant.fullName,
      latestReminder: c.reminders?.[0] ?? null,
    }));

    const res = NextResponse.json(result);
    res.headers.set('X-Total-Count', String(total));
    if (total > LIMIT) res.headers.set('X-Truncated', 'true');
    return res;
  } catch (error) {
    console.error('GET /api/rentals/contracts error:', error.message || error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();
    const { propertyId, tenantId, startDate, endDate, monthlyRent, paymentDueDay, rentAccountId, accountingSubjectId } = body;

    if (!propertyId || !tenantId || !startDate || !endDate || !monthlyRent || !paymentDueDay || !rentAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }
    // accountingSubjectId 在 pending 合約時為選填，active 合約時必填
    const effectiveStatus = body.status || 'pending';
    if (!accountingSubjectId && effectiveStatus === 'active') {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '生效合約請選擇會計科目', 400);
    }
    if (startDate >= endDate) {
      return createErrorResponse('VALIDATION_FAILED', '合約結束日期必須晚於開始日期', 400);
    }

    // N15: validate no overlapping active/pending contract (excluding the previousContract for renewals)
    const overlapping = await prisma.rentalContract.findFirst({
      where: {
        propertyId: parseInt(propertyId),
        status: { in: ['active', 'pending'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(body.previousContractId ? { id: { not: parseInt(body.previousContractId) } } : {}),
      },
      select: { id: true, contractNo: true, status: true },
    });

    if (overlapping) {
      return NextResponse.json({
        error: `此物業在該期間已有${overlapping.status === 'active' ? '有效' : '待生效'}合約（${overlapping.contractNo}）`,
        code: 'ACTIVE_CONTRACT_EXISTS',
        conflictContractId: overlapping.id,
        conflictContractNo: overlapping.contractNo,
      }, { status: 409 });
    }

    const contractNo = await generateContractNo();

    const newStatus = body.status || 'pending';

    const contract = await prisma.rentalContract.create({
      data: {
        contractNo,
        propertyId: parseInt(propertyId),
        tenantId: parseInt(tenantId),
        startDate,
        endDate,
        monthlyRent: parseFloat(monthlyRent),
        paymentDueDay: parseInt(paymentDueDay),
        preferredPayMethod: body.preferredPayMethod || null,
        depositAmount: body.depositAmount ? parseFloat(body.depositAmount) : 0,
        depositAccountId: body.depositAccountId ? parseInt(body.depositAccountId) : null,
        rentAccountId: parseInt(rentAccountId),
        accountingSubjectId: parseInt(accountingSubjectId),
        status: newStatus,
        autoRenew: body.autoRenew || false,
        renewNotifyDays: body.renewNotifyDays || 60,
        specialTerms: body.specialTerms || null,
        note: body.note || null,
        previousContractId: body.previousContractId ? parseInt(body.previousContractId) : null,
      },
      include: {
        property: { select: { id: true, name: true } },
        tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true } }
      }
    });

    // 新合約為 active 時，更新物業狀態並將舊合約設為 expired
    if (newStatus === 'active') {
      await prisma.rentalProperty.update({
        where: { id: parseInt(propertyId) },
        data: { status: 'rented' }
      });
      if (body.previousContractId) {
        await prisma.rentalContract.update({
          where: { id: parseInt(body.previousContractId) },
          data: { status: 'expired' }
        });
      }
    }

    const tenantName = contract.tenant?.fullName || contract.tenant?.companyName || `tenant#${tenantId}`;
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_CONTRACT_CREATE,
      targetModule: 'rentals',
      targetRecordId: contract.id,
      targetRecordNo: contract.contractNo,
      afterState: {
        contractNo: contract.contractNo,
        propertyName: contract.property?.name,
        tenantName,
        monthlyRent: parseFloat(monthlyRent),
        startDate,
        endDate,
        status: newStatus,
      },
      note: `新增合約「${contract.contractNo}」— ${contract.property?.name} / ${tenantName}`,
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/contracts error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PATCH(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // ── 手動排序：透過合約 id 取得對應物業，更新 property.sortOrder ──
    if (body.action !== 'reorder' || !Array.isArray(body.orderedIds)) {
      return createErrorResponse('VALIDATION_FAILED', '未知操作', 400);
    }
    const items = await prisma.rentalContract.findMany({
      where: { id: { in: body.orderedIds } },
      select: { id: true, propertyId: true },
    });
    const contractToProperty = Object.fromEntries(items.map(c => [c.id, c.propertyId]));
    const updates = body.orderedIds
      .map((id, index) => {
        const propId = contractToProperty[id];
        return propId
          ? prisma.rentalProperty.update({ where: { id: propId }, data: { sortOrder: index + 1 } })
          : null;
      })
      .filter(Boolean);
    await prisma.$transaction(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
