import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireSession } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// 共用：查詢所有倉庫與部門，回傳標準格式
async function fetchAll() {
  const warehouses = await prisma.warehouse.findMany({
    include: { departments: true, children: true },
    orderBy: { id: 'asc' }
  });

  const byName = {};
  const list = warehouses.map(wh => ({
    id: wh.id,
    name: wh.name,
    type: wh.type || 'storage',
    parentId: wh.parentId || null,
    departments: wh.departments.map(d => ({ id: d.id, name: d.name })),
    children: wh.children.map(c => ({ id: c.id, name: c.name })),
  }));
  for (const wh of warehouses) {
    byName[wh.name] = wh.departments.map(d => (typeof d === 'object' && d.name != null ? d.name : d));
  }
  return { list, byName };
}

// GET: 取得所有館別與部門（登入即可）
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const data = await fetchAll();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}

// POST: 新增館別、倉庫或部門
export async function POST(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (data.action === 'addWarehouse') {
      // 新增館別（building）— 頂層，parentId = null
      if (!data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '名稱不可為空', 400);
      }
      const name = data.name.trim();
      const type = data.type === 'building' ? 'building' : 'storage';

      // 對 building 類型，檢查頂層是否重複
      if (type === 'building') {
        const existing = await prisma.warehouse.findFirst({
          where: { name, parentId: null, type: 'building' }
        });
        if (existing) {
          return createErrorResponse('WAREHOUSE_NAME_DUPLICATE', '此館別已存在', 409);
        }
      }

      await prisma.warehouse.create({ data: { name, type, parentId: null } });

    } else if (data.action === 'addStorageLocation') {
      // 新增倉庫位置（storage），掛在某個 building 底下
      if (!data.buildingId || !data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別並填寫倉庫名稱', 400);
      }
      const building = await prisma.warehouse.findUnique({ where: { id: data.buildingId } });
      if (!building || building.type !== 'building') {
        return createErrorResponse('NOT_FOUND', '此館別不存在', 404);
      }
      const name = data.name.trim();
      const existing = await prisma.warehouse.findFirst({
        where: { name, parentId: building.id }
      });
      if (existing) {
        return createErrorResponse('CONFLICT_UNIQUE', '此倉庫位置已存在', 409);
      }
      await prisma.warehouse.create({ data: { name, type: 'storage', parentId: building.id } });

    } else if (data.action === 'addDepartment') {
      if (!data.warehouse || !data.name || !data.name.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別並填寫部門名稱', 400);
      }
      const wh = await prisma.warehouse.findFirst({
        where: { name: data.warehouse, type: 'building', parentId: null }
      });
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

    const result = await fetchAll();
    return NextResponse.json(result);
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}

// DELETE: 刪除館別、倉庫位置或部門
export async function DELETE(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (data.action === 'deleteWarehouse') {
      // 刪除館別或倉庫（by id or name）
      let wh;
      if (data.id) {
        wh = await prisma.warehouse.findUnique({ where: { id: data.id } });
      } else if (data.name) {
        wh = await prisma.warehouse.findFirst({ where: { name: data.name } });
      }
      if (!wh) {
        return createErrorResponse('NOT_FOUND', '此項目不存在', 404);
      }
      await prisma.warehouse.delete({ where: { id: wh.id } });

    } else if (data.action === 'deleteStorageLocation') {
      if (!data.id) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', 'ID 不可為空', 400);
      }
      const loc = await prisma.warehouse.findUnique({ where: { id: data.id } });
      if (!loc) {
        return createErrorResponse('NOT_FOUND', '此倉庫位置不存在', 404);
      }
      await prisma.warehouse.delete({ where: { id: data.id } });

    } else if (data.action === 'deleteDepartment') {
      if (!data.warehouse || !data.name) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別與部門名稱不可為空', 400);
      }
      const wh = await prisma.warehouse.findFirst({
        where: { name: data.warehouse, type: 'building', parentId: null }
      });
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

    const result = await fetchAll();
    return NextResponse.json(result);
  } catch (error) {
    const msg = error?.code && String(error.code).startsWith('P') ? `資料庫錯誤（${error.message || error.code}），請確認已執行 npx prisma db push` : null;
    if (msg) return createErrorResponse('INTERNAL_ERROR', msg, 500);
    return handleApiError(error);
  }
}
