import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Auto-generate tenantCode: TC-YYYYMM-XXX
async function generateTenantCode() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `TC-${ym}-`;

  const existing = await prisma.tenantMaster.findMany({
    where: { tenantCode: { startsWith: prefix } },
    select: { tenantCode: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.tenantCode.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const where = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { tenantCode: { contains: search, mode: 'insensitive' } }
      ];
    }

    const tenants = await prisma.tenantMaster.findMany({
      where,
      include: {
        contracts: {
          select: { id: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const result = tenants.map(t => ({
      ...t,
      activeContractCount: t.contracts.filter(c => c.status === 'active').length,
      totalContractCount: t.contracts.length
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET /api/rentals/tenants error:', error);
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { tenantType, fullName, companyName, phone } = body;

    if (!tenantType || !phone) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '租客類型與電話為必填', 400);
    }
    if (tenantType === 'individual' && !fullName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '個人租客需填寫姓名', 400);
    }
    if (tenantType === 'company' && !companyName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '公司租客需填寫公司名稱', 400);
    }

    const tenantCode = await generateTenantCode();

    const tenant = await prisma.tenantMaster.create({
      data: {
        tenantCode,
        tenantType,
        fullName: body.fullName || null,
        idNumber: body.idNumber || null,
        birthDate: body.birthDate || null,
        companyName: body.companyName || null,
        taxId: body.taxId || null,
        representativeName: body.representativeName || null,
        phone,
        phone2: body.phone2 || null,
        email: body.email || null,
        address: body.address || null,
        emergencyContact: body.emergencyContact || null,
        emergencyPhone: body.emergencyPhone || null,
        bankCode: body.bankCode || null,
        bankBranch: body.bankBranch || null,
        bankAccountName: body.bankAccountName || null,
        bankAccountNumber: body.bankAccountNumber || null,
        note: body.note || null
      }
    });

    return NextResponse.json(tenant, { status: 201 });
  } catch (error) {
    console.error('POST /api/rentals/tenants error:', error);
    return handleApiError(error);
  }
}
