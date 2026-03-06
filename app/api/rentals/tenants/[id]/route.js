import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const tenantId = parseInt(id);

    const tenant = await prisma.tenantMaster.findUnique({
      where: { id: tenantId },
      include: {
        contracts: {
          include: {
            property: { select: { id: true, name: true, buildingName: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
        rentalIncomes: {
          select: { id: true, status: true, expectedAmount: true, actualAmount: true }
        }
      }
    });

    if (!tenant) {
      return createErrorResponse('NOT_FOUND', '找不到租客', 404);
    }

    // Compute rental history stats
    const overdueCount = tenant.rentalIncomes.filter(i => i.status === 'overdue').length;
    const totalRentPaid = tenant.rentalIncomes
      .filter(i => i.status === 'completed' || i.status === 'partial')
      .reduce((sum, i) => sum + Number(i.actualAmount || 0), 0);

    return NextResponse.json({
      ...tenant,
      overdueCount,
      totalRentPaid
    });
  } catch (error) {
    console.error('GET /api/rentals/tenants/[id] error:', error);
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const tenantId = parseInt(id);
    const body = await request.json();

    // Check blacklist action
    if (body.isBlacklisted === true) {
      if (!body.blacklistReason) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '列入黑名單需填寫原因', 400);
      }
    }

    const tenant = await prisma.tenantMaster.update({
      where: { id: tenantId },
      data: {
        tenantType: body.tenantType,
        fullName: body.fullName,
        idNumber: body.idNumber,
        birthDate: body.birthDate,
        companyName: body.companyName,
        taxId: body.taxId,
        representativeName: body.representativeName,
        phone: body.phone,
        phone2: body.phone2,
        email: body.email,
        address: body.address,
        emergencyContact: body.emergencyContact,
        emergencyPhone: body.emergencyPhone,
        bankCode: body.bankCode,
        bankBranch: body.bankBranch,
        bankAccountName: body.bankAccountName,
        bankAccountNumber: body.bankAccountNumber,
        isBlacklisted: body.isBlacklisted,
        blacklistReason: body.blacklistReason,
        creditNote: body.creditNote,
        note: body.note
      }
    });

    return NextResponse.json(tenant);
  } catch (error) {
    console.error('PUT /api/rentals/tenants/[id] error:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const tenantId = parseInt(id);

    // Check for existing contracts
    const contractCount = await prisma.rentalContract.count({
      where: { tenantId }
    });

    if (contractCount > 0) {
      return createErrorResponse('ACCOUNT_HAS_DEPENDENCIES', '此租客尚有合約，無法刪除', 400);
    }

    await prisma.tenantMaster.delete({ where: { id: tenantId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/tenants/[id] error:', error);
    return handleApiError(error);
  }
}
