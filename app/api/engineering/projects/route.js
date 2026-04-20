import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page')) || 0;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);

    const where = {};
    if (status) where.status = status;

    const include = {
      warehouseRef: true,
      departmentRef: true,
      _count: { select: { contracts: true, materials: true } },
    };
    const orderBy = [{ status: 'asc' }, { code: 'asc' }];

    const fmt = (p) => ({
      ...p,
      budget: p.budget != null ? Number(p.budget) : null,
      clientContractAmount: p.clientContractAmount != null ? Number(p.clientContractAmount) : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    });

    if (page > 0) {
      const skip = (page - 1) * limit;
      const [projects, totalCount] = await Promise.all([
        prisma.engineeringProject.findMany({ where, include, orderBy, skip, take: limit }),
        prisma.engineeringProject.count({ where }),
      ]);
      return NextResponse.json({
        data: projects.map(fmt),
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      });
    }

    const projects = await prisma.engineeringProject.findMany({ where, include, orderBy });
    return NextResponse.json(projects.map(fmt));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.code?.trim() || !data.name?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫工程代碼與名稱', 400);
    }
    const code = String(data.code).trim();
    const existing = await prisma.engineeringProject.findUnique({ where: { code } });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '工程代碼已存在', 409);
    }
    const warehouseId = data.warehouseId ? parseInt(data.warehouseId) : null;
    const departmentId = data.departmentId ? parseInt(data.departmentId) : null;
    let warehouseName = data.warehouse?.trim() || null;
    if (warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true } });
      if (wh) warehouseName = wh.name;
    }
    const project = await prisma.engineeringProject.create({
      data: {
        code,
        name: String(data.name).trim(),
        clientName: data.clientName?.trim() || null,
        clientContractAmount: data.clientContractAmount != null ? parseFloat(data.clientContractAmount) : null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        budget: data.budget != null ? parseFloat(data.budget) : null,
        status: data.status || '進行中',
        warehouse: warehouseName,
        warehouseId: warehouseId || undefined,
        departmentId: departmentId || undefined,
        location: data.location?.trim() || null,
        buildingNo: data.buildingNo?.trim() || null,
        permitNo: data.permitNo?.trim() || null,
        note: data.note?.trim() || null,
      },
    });
    return NextResponse.json({
      ...project,
      budget: project.budget != null ? Number(project.budget) : null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
