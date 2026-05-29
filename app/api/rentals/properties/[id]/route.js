import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const property = await prisma.rentalProperty.findUnique({
      where: { id: parseInt(id) },
      include: {
        contracts: {
          include: {
            tenant: { select: { fullName: true, companyName: true, tenantType: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        rentCollectAccount: { select: { id: true, name: true } },
        depositAccount: { select: { id: true, name: true } },
        propertyTaxes: { orderBy: { taxYear: 'desc' } },
        maintenances: { orderBy: { maintenanceDate: 'desc' } },
        asset: { select: { id: true, name: true, assetType: true } },
      }
    });

    if (!property) {
      return createErrorResponse('NOT_FOUND', '找不到物業', 404);
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error('GET /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const propertyId = parseInt(id);
    const body = await request.json();
    const data = {};

    // ── Inline-edit 欄位（原 PATCH）──────────────────────────
    if (body.category  !== undefined) data.category  = body.category  || null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder !== '' && body.sortOrder !== null ? parseInt(body.sortOrder) : null;
    if (body.status    !== undefined) data.status    = body.status;

    // ── 完整編輯欄位（原 PUT）────────────────────────────────
    if (body.buildingName             !== undefined) data.buildingName             = body.buildingName;
    if (body.unitNo                   !== undefined) data.unitNo                   = body.unitNo;
    if (body.ownerName                !== undefined) data.ownerName                = body.ownerName                || null;
    if (body.houseTaxRegistrationNo   !== undefined) data.houseTaxRegistrationNo   = body.houseTaxRegistrationNo   || null;
    if (body.rentCollectAccountId     !== undefined) data.rentCollectAccountId     = body.rentCollectAccountId     ? parseInt(body.rentCollectAccountId) : null;
    if (body.depositAccountId         !== undefined) data.depositAccountId         = body.depositAccountId         ? parseInt(body.depositAccountId)     : null;
    if (body.note                     !== undefined) data.note                     = body.note;
    if (body.publicInterestLandlord   !== undefined) data.publicInterestLandlord   = body.publicInterestLandlord   === true;
    if (body.publicInterestApplicant  !== undefined) data.publicInterestApplicant  = body.publicInterestApplicant  || null;
    if (body.publicInterestNote       !== undefined) data.publicInterestNote       = body.publicInterestNote       || null;
    if (body.publicInterestStartDate  !== undefined) data.publicInterestStartDate  = body.publicInterestStartDate  || null;
    if (body.publicInterestEndDate    !== undefined) data.publicInterestEndDate    = body.publicInterestEndDate    || null;
    if (body.publicInterestRent       !== undefined) data.publicInterestRent       = body.publicInterestRent       ? parseFloat(body.publicInterestRent) : null;
    if (body.collectUtilityFee        !== undefined) data.collectUtilityFee        = body.collectUtilityFee        === true;

    // name/address：已連結資產主檔時由資產端同步，此處略過
    if (body.name !== undefined || body.address !== undefined) {
      const linkedAsset = await prisma.asset.findUnique({
        where: { rentalPropertyId: propertyId },
        select: { id: true },
      });
      if (!linkedAsset) {
        if (body.name    !== undefined) data.name    = body.name;
        if (body.address !== undefined) data.address = body.address;
      }
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

    // 先讀舊值（只取要追蹤的欄位）
    const before = await prisma.rentalProperty.findUnique({
      where: { id: propertyId },
      select: { name: true, status: true },
    });

    const property = await prisma.rentalProperty.update({
      where: { id: propertyId },
      data,
    });

    const statusChanged = data.status !== undefined && data.status !== before?.status;
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_PROPERTY_UPDATE,
      targetModule: 'rentals',
      targetRecordId: propertyId,
      targetRecordNo: before?.name,
      beforeState: statusChanged ? { status: before.status } : undefined,
      afterState:  statusChanged ? { status: data.status }   : undefined,
      note: statusChanged
        ? `物業「${before?.name}」狀態：${before.status} → ${data.status}`
        : `更新物業「${before?.name}」資料`,
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error('PATCH /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const propertyId = parseInt(id);
    const force = new URL(request.url).searchParams.get('force') === 'true';

    const existing = await prisma.rentalProperty.findUnique({ where: { id: propertyId } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到物業', 404);
    }

    const [contractCount, incomeCount, taxCount, maintenanceCount] = await Promise.all([
      prisma.rentalContract.count({ where: { propertyId } }),
      prisma.rentalIncome.count({ where: { propertyId } }),
      prisma.propertyTax.count({ where: { propertyId } }),
      prisma.rentalMaintenance.count({ where: { propertyId } }),
    ]);

    const total = contractCount + incomeCount + taxCount + maintenanceCount;

    if (total > 0 && !force) {
      return NextResponse.json({
        error: '此物業有關聯資料，無法直接刪除',
        code: 'ACCOUNT_HAS_DEPENDENCIES',
        counts: { contractCount, incomeCount, taxCount, maintenanceCount },
      }, { status: 400 });
    }

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_PROPERTY_DELETE,
      targetModule: 'rentals',
      targetRecordId: propertyId,
      targetRecordNo: existing.name,
      beforeState: { name: existing.name, status: existing.status },
      note: `刪除物業「${existing.name}」${total > 0 ? `（強制，含 ${total} 筆關聯資料）` : ''}`,
    });

    await prisma.$transaction(async (tx) => {
      if (total > 0) {
        // 1. Break contract self-reference (previousContractId FK) before deletion
        await tx.rentalContract.updateMany({
          where: { propertyId },
          data: { previousContractId: null },
        });
        // 2. Delete income payments (FK → RentalIncome, onDelete: Cascade in schema but be explicit)
        const incomeIds = (await tx.rentalIncome.findMany({ where: { propertyId }, select: { id: true } })).map(r => r.id);
        if (incomeIds.length > 0) {
          await tx.rentalIncomePayment.deleteMany({ where: { rentalIncomeId: { in: incomeIds } } });
        }
        // 3. Clear income, taxes, maintenance, utility, cache
        await tx.rentalIncome.deleteMany({ where: { propertyId } });
        await tx.propertyTax.deleteMany({ where: { propertyId } });
        await tx.rentalMaintenance.deleteMany({ where: { propertyId } });
        await tx.rentalUtilityIncome.deleteMany({ where: { propertyId } });
        await tx.rentalMonthlyCache.deleteMany({ where: { propertyId } });
        // 4. Contracts (after income and self-reference cleared)
        await tx.rentalContract.deleteMany({ where: { propertyId } });
      }
      // RentalAnnualRentFiling has onDelete:Cascade on property → auto-deleted
      await tx.rentalProperty.delete({ where: { id: propertyId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
