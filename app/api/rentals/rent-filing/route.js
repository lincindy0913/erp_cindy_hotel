/**
 * GET  /api/rentals/rent-filing?year=2025  — 年度租金申報總表
 * POST /api/rentals/rent-filing             — 新增一筆申報列
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

async function sumActualRentalIncome(propertyId, incomeYear, contractId) {
  const where = { propertyId, incomeYear };
  if (contractId != null) where.contractId = contractId;
  const agg = await prisma.rentalIncome.aggregate({
    where,
    _sum: { actualAmount: true },
  });
  return Number(agg._sum.actualAmount || 0);
}

async function contractsOverlappingYear(propertyId, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return prisma.rentalContract.count({
    where: {
      propertyId,
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year'), 10);
    if (!year || year < 1990 || year > 2100) {
      return createErrorResponse('INVALID_YEAR', '請指定有效年份', 400);
    }

    const filings = await prisma.rentalAnnualRentFiling.findMany({
      where: { filingYear: year },
      include: {
        property: true,
        contract: {
          include: {
            tenant: { select: { fullName: true, companyName: true, tenantType: true } },
          },
        },
      },
      orderBy: [{ propertyId: 'asc' }, { slotIndex: 'asc' }],
    });

    const rows = [];
    for (const f of filings) {
      const multiContracts = await contractsOverlappingYear(f.propertyId, year);
      let actualAnnual = 0;
      let incomeSplitHint = null;

      if (f.contractId != null) {
        actualAnnual = await sumActualRentalIncome(f.propertyId, year, f.contractId);
      } else if (f.slotIndex === 0) {
        actualAnnual = await sumActualRentalIncome(f.propertyId, year, null);
        if (multiContracts > 1) {
          incomeSplitHint =
            '該年度此物業有多份租約交疊，若要分開對照實收請指定「綁定租約」或新增第二列並分別綁約。';
        }
      } else {
        incomeSplitHint = '同物業第二條申報請指定「綁定租約」以正確加總該公司實收。';
      }

      const tenant = f.contract?.tenant;
      const contractLessee =
        tenant && (tenant.tenantType === 'company' ? tenant.companyName : tenant.fullName);

      rows.push({
        id: f.id,
        propertyId: f.propertyId,
        contractId: f.contractId,
        slotIndex: f.slotIndex,
        filingYear: f.filingYear,
        isPublicInterest: f.isPublicInterest,
        lesseeDisplayName: f.lesseeDisplayName,
        declaredMonthlyRent: f.declaredMonthlyRent != null ? Number(f.declaredMonthlyRent) : null,
        monthsInScope: f.monthsInScope,
        declaredAnnualIncome:
          f.declaredAnnualIncome != null ? Number(f.declaredAnnualIncome) : null,
        estimatedHouseTax: f.estimatedHouseTax != null ? Number(f.estimatedHouseTax) : null,
        status: f.status,
        note: f.note,
        confirmedAt: f.confirmedAt,
        propertyName: f.property.name,
        address: f.property.address,
        buildingName: f.property.buildingName,
        unitNo: f.property.unitNo,
        ownerName: f.property.ownerName,
        houseTaxRegistrationNo: f.property.houseTaxRegistrationNo,
        propertyPublicInterestHint: f.property.publicInterestLandlord === true,
        actualAnnualIncome: actualAnnual,
        incomeSplitHint,
        contractLesseeName: contractLessee || null,
      });
    }

    const totals = rows.reduce(
      (a, r) => {
        a.declaredAnnual += Number(r.declaredAnnualIncome || 0);
        a.actualAnnual += Number(r.actualAnnualIncome || 0);
        a.estimatedHouseTax += Number(r.estimatedHouseTax || 0);
        return a;
      },
      { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 }
    );

    return NextResponse.json({ year, rows, totals });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const propertyId = parseInt(body.propertyId, 10);
    const filingYear = parseInt(body.filingYear, 10);
    const slotIndex = body.slotIndex != null ? parseInt(body.slotIndex, 10) : 0;

    if (!propertyId || !filingYear) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '物業與申報年度為必填', 400);
    }

    const property = await prisma.rentalProperty.findUnique({ where: { id: propertyId } });
    if (!property) return createErrorResponse('NOT_FOUND', '物業不存在', 404);

    const contractId = body.contractId ? parseInt(body.contractId, 10) : null;
    if (contractId) {
      const c = await prisma.rentalContract.findFirst({
        where: { id: contractId, propertyId },
      });
      if (!c) return createErrorResponse('INVALID_CONTRACT', '租約不屬於該物業', 400);
    }

    const duplicate = await prisma.rentalAnnualRentFiling.findUnique({
      where: {
        propertyId_filingYear_slotIndex: { propertyId, filingYear, slotIndex },
      },
    });
    if (duplicate) {
      return createErrorResponse('DUPLICATE', '該物業同年同列序已存在', 409);
    }

    const filing = await prisma.rentalAnnualRentFiling.create({
      data: {
        propertyId,
        filingYear,
        slotIndex,
        contractId,
        isPublicInterest:
          body.isPublicInterest === true || body.isPublicInterest === false
            ? body.isPublicInterest
            : property.publicInterestLandlord === true,
        lesseeDisplayName: body.lesseeDisplayName || null,
        declaredMonthlyRent:
          body.declaredMonthlyRent != null && body.declaredMonthlyRent !== ''
            ? parseFloat(body.declaredMonthlyRent)
            : null,
        monthsInScope:
          body.monthsInScope != null && body.monthsInScope !== ''
            ? parseInt(body.monthsInScope, 10)
            : null,
        declaredAnnualIncome:
          body.declaredAnnualIncome != null && body.declaredAnnualIncome !== ''
            ? parseFloat(body.declaredAnnualIncome)
            : null,
        estimatedHouseTax:
          body.estimatedHouseTax != null && body.estimatedHouseTax !== ''
            ? parseFloat(body.estimatedHouseTax)
            : null,
        status: body.status || 'draft',
        note: body.note || null,
      },
    });

    return NextResponse.json(filing, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
