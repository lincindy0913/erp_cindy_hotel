import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

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

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const propertyId = parseInt(id);
    const body = await request.json();

    const linkedAsset = await prisma.asset.findUnique({
      where: { rentalPropertyId: propertyId },
      select: { id: true },
    });

    /** 已連結資產主檔時，名稱／地址由資產端同步，此處僅更新營運欄位 */
    const data = {
      buildingName: body.buildingName,
      unitNo: body.unitNo,
      ownerName: body.ownerName != null ? body.ownerName || null : undefined,
      houseTaxRegistrationNo: body.houseTaxRegistrationNo != null ? body.houseTaxRegistrationNo || null : undefined,
      rentCollectAccountId: body.rentCollectAccountId ? parseInt(body.rentCollectAccountId) : null,
      depositAccountId: body.depositAccountId ? parseInt(body.depositAccountId) : null,
      status: body.status,
      note: body.note,
      publicInterestLandlord: body.publicInterestLandlord === true,
      publicInterestApplicant: body.publicInterestApplicant || null,
      publicInterestNote: body.publicInterestNote || null,
      publicInterestStartDate: body.publicInterestStartDate || null,
      publicInterestEndDate: body.publicInterestEndDate || null,
      publicInterestRent: body.publicInterestRent ? parseFloat(body.publicInterestRent) : null,
      collectUtilityFee: body.collectUtilityFee === true,
      category: body.category !== undefined ? (body.category || null) : undefined,
      sortOrder: body.sortOrder !== undefined ? (body.sortOrder !== '' && body.sortOrder !== null ? parseInt(body.sortOrder) : null) : undefined,
    };
    if (!linkedAsset) {
      data.name = body.name;
      data.address = body.address;
    }

    const property = await prisma.rentalProperty.update({
      where: { id: propertyId },
      data,
    });

    // 分類變更時同步到所有合約
    if (body.category !== undefined) {
      await prisma.rentalContract.updateMany({
        where: { propertyId, status: { not: 'cancelled' } },
        data: { category: body.category || null },
      });
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error('PUT /api/rentals/properties/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const data = {};
    if (body.category  !== undefined) data.category  = body.category  || null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder !== '' && body.sortOrder !== null ? parseInt(body.sortOrder) : null;
    if (body.status    !== undefined) data.status    = body.status;
    if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
    await prisma.rentalProperty.update({ where: { id: parseInt(id) }, data, select: { id: true } });
    // 分類變更時同步到所有合約
    if (body.category !== undefined) {
      await prisma.rentalContract.updateMany({
        where: { propertyId: parseInt(id), status: { not: 'cancelled' } },
        data: { category: body.category || null },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
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
