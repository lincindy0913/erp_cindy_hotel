import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: 取得所有館別與部門
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: { departments: true },
      orderBy: { id: 'asc' }
    });

    // 轉換為前端期望的格式: { '麗格': ['總務部', '行銷部'], ... }
    const result = {};
    for (const wh of warehouses) {
      result[wh.name] = wh.departments.map(d => d.name);
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增館別或部門
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (data.action === 'addWarehouse') {
      if (!data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別名稱不可為空', 400);
      }
      const name = data.name.trim();
      const existing = await prisma.warehouse.findUnique({ where: { name } });
      if (existing) {
        return createErrorResponse('WAREHOUSE_NAME_DUPLICATE', '此館別已存在', 409);
      }
      await prisma.warehouse.create({ data: { name } });
    } else if (data.action === 'addDepartment') {
      if (!data.warehouse || !data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別與部門名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.warehouse } });
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此館別不存在', 404);
      }
      const deptName = data.name.trim();
      const existingDept = await prisma.department.findUnique({
        where: { warehouseId_name: { warehouseId: wh.id, name: deptName } }
      });
      if (existingDept) {
        return createErrorResponse('CONFLICT_UNIQUE', '此部門已存在', 409);
      }
      await prisma.department.create({ data: { name: deptName, warehouseId: wh.id } });
    } else {
      return createErrorResponse('VALIDATION_FAILED', '未知操作', 400);
    }

    // 回傳最新的完整資料
    const warehouses = await prisma.warehouse.findMany({
      include: { departments: true },
      orderBy: { id: 'asc' }
    });
    const result = {};
    for (const wh of warehouses) {
      result[wh.name] = wh.departments.map(d => d.name);
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除館別或部門
export async function DELETE(request) {
  try {
    const data = await request.json();

    if (data.action === 'deleteWarehouse') {
      if (!data.name) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.name } });
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此館別不存在', 404);
      }
      await prisma.warehouse.delete({ where: { id: wh.id } });
    } else if (data.action === 'deleteDepartment') {
      if (!data.warehouse || !data.name) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別與部門名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.warehouse } });
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此館別不存在', 404);
      }
      const dept = await prisma.department.findUnique({
        where: { warehouseId_name: { warehouseId: wh.id, name: data.name } }
      });
      if (dept) {
        await prisma.department.delete({ where: { id: dept.id } });
      }
    } else {
      return createErrorResponse('VALIDATION_FAILED', '未知操作', 400);
    }

    const warehouses = await prisma.warehouse.findMany({
      include: { departments: true },
      orderBy: { id: 'asc' }
    });
    const result = {};
    for (const wh of warehouses) {
      result[wh.name] = wh.departments.map(d => d.name);
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
