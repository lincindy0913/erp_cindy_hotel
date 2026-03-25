import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
  ]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
    const skip = (page - 1) * limit;
    const all = searchParams.get('all') === 'true';
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const conditions = [];
    if (keyword) {
      conditions.push({
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { contact: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword, mode: 'insensitive' } },
          { taxId: { contains: keyword, mode: 'insensitive' } },
          { address: { contains: keyword, mode: 'insensitive' } },
        ]
      });
    }
    if (activeOnly) {
      conditions.push({ isActive: true });
    }
    const where = conditions.length > 0 ? { AND: conditions } : {};

    if (all || activeOnly) {
      const suppliers = await prisma.supplier.findMany({ where, orderBy: { id: 'asc' }, take: 5000 });
      return NextResponse.json(suppliers);
    }

    const [suppliers, totalCount] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy: { id: 'asc' }, skip, take: limit }),
      prisma.supplier.count({ where }),
    ]);

    return NextResponse.json({
      data: suppliers,
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    });
  } catch (error) {
    console.error('查詢廠商錯誤:', error.message || error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_CREATE,
    PERMISSIONS.PURCHASING_EDIT,
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    PERMISSIONS.SETTINGS_VIEW,
  ]);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.name || !String(data.name).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫廠商名稱', 400);
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name: String(data.name).trim(),
        taxId: data.taxId && String(data.taxId).trim() ? String(data.taxId).trim() : null,
        contact: data.contact && String(data.contact).trim() ? String(data.contact).trim() : null,
        personInCharge: data.personInCharge && String(data.personInCharge).trim() ? String(data.personInCharge).trim() : null,
        phone: data.phone && String(data.phone).trim() ? String(data.phone).trim() : null,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null
      }
    });

    return NextResponse.json(newSupplier, { status: 201 });
  } catch (error) {
    console.error('建立廠商錯誤:', error.message || error);
    return handleApiError(error);
  }
}
