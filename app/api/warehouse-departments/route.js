import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireSession } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET: 取得所有館別與部門（登入即可）
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: { departments: true },
      orderBy: { id: 'asc' }
    });

    // 回傳：list 含 type（storage=倉庫, building=館別），以及 key-value 格式 { '名稱': [部門...] } 供館別用
    const byName = {};
    const list = warehouses.map(wh => ({
      id: wh.id,
      name: wh.name,
      type: wh.type || 'storage',
      departments: wh.departments.map(d => d.name),
    }));
    for (const wh of warehouses) {
      byName[wh.name] = wh.departments.map(d => d.name);
    }
    return NextResponse.json({ list, byName });
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}

// POST: 新增館別或部門（登入即可存檔）
export async function POST(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (data.action === 'addWarehouse') {
      if (!data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '名稱不可為空', 400);
      }
      const name = data.name.trim();
      const existing = await prisma.warehouse.findUnique({ where: { name } });
      if (existing) {
        return createErrorResponse('WAREHOUSE_NAME_DUPLICATE', '此名稱已存在', 409);
      }
      const type = data.type === 'building' ? 'building' : 'storage';
      try {
        await prisma.warehouse.create({ data: { name, type } });
      } catch (createErr) {
        if (createErr?.code === 'P2010' || createErr?.meta?.column === 'type' || (createErr?.message && String(createErr.message).toLowerCase().includes('type'))) {
          await prisma.warehouse.create({ data: { name } });
        } else {
          throw createErr;
        }
      }
    } else if (data.action === 'addDepartment') {
      if (!data.warehouse || !data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別並填寫部門名稱', 400);
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

    const warehouses = await prisma.warehouse.findMany({
      include: { departments: true },
      orderBy: { id: 'asc' }
    });
    const byName = {};
    const list = warehouses.map(wh => ({
      id: wh.id,
      name: wh.name,
      type: wh.type || 'storage',
      departments: wh.departments.map(d => d.name),
    }));
    for (const wh of warehouses) {
      byName[wh.name] = wh.departments.map(d => d.name);
    }
    return NextResponse.json({ list, byName });
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}

// DELETE: 刪除館別或部門（登入即可）
export async function DELETE(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (data.action === 'deleteWarehouse') {
      if (!data.name) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '倉庫名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.name } });
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此倉庫不存在', 404);
      }
      await prisma.warehouse.delete({ where: { id: wh.id } });
    } else if (data.action === 'deleteDepartment') {
      if (!data.warehouse || !data.name) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別與部門名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.warehouse } });
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此倉庫不存在', 404);
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
    const byName = {};
    const list = warehouses.map(wh => ({
      id: wh.id,
      name: wh.name,
      type: wh.type || 'storage',
      departments: wh.departments.map(d => d.name),
    }));
    for (const wh of warehouses) {
      byName[wh.name] = wh.departments.map(d => d.name);
    }
    return NextResponse.json({ list, byName });
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}
