import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Auto-generate contractNo: RC-YYYYMMDD-XXX
async function generateContractNo() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
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

    const where = {};
    if (status) where.status = status;
    if (propertyId) where.propertyId = parseInt(propertyId);
    if (tenantId) where.tenantId = parseInt(tenantId);

    const contracts = await prisma.rentalContract.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, buildingName: true } },
        tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const result = contracts.map(c => ({
      ...c,
      propertyName: c.property.name,
      tenantName: c.tenant.tenantType === 'company' ? c.tenant.companyName : c.tenant.fullName
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/rentals/contracts error:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const body = await request.json();
    const { propertyId, tenantId, startDate, endDate, monthlyRent, paymentDueDay, rentAccountId } = body;

    if (!propertyId || !tenantId || !startDate || !endDate || !monthlyRent || !paymentDueDay || !rentAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    // Validate no overlapping active contract for same property
    const overlapping = await prisma.rentalContract.findFirst({
      where: {
        propertyId: parseInt(propertyId),
        status: 'active',
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      }
    });

    if (overlapping) {
      return createErrorResponse('CONFLICT_UNIQUE', '此物業在該期間已有有效合約', 409);
    }

    const contractNo = await generateContractNo();

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
        status: body.status || 'pending',
        autoRenew: body.autoRenew || false,
        renewNotifyDays: body.renewNotifyDays || 60,
        specialTerms: body.specialTerms || null,
        note: body.note || null
      },
      include: {
        property: { select: { id: true, name: true } },
        tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true } }
      }
    });

    // Update property status to rented if contract is active
    if (contract.status === 'active') {
      await prisma.rentalProperty.update({
        where: { id: parseInt(propertyId) },
        data: { status: 'rented' }
      });
    }

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/contracts error:', error);
    return handleApiError(error);
  }
}
