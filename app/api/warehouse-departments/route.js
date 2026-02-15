import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: 取得所有館別與部門
export async function GET() {
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
    console.error('取得館別部門錯誤:', error);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST: 新增館別或部門
export async function POST(request) {
  try {
    const data = await request.json();

    if (data.action === 'addWarehouse') {
      if (!data.name || !data.name.trim()) {
        return NextResponse.json({ error: '館別名稱不可為空' }, { status: 400 });
      }
      const name = data.name.trim();
      const existing = await prisma.warehouse.findUnique({ where: { name } });
      if (existing) {
        return NextResponse.json({ error: '此館別已存在' }, { status: 400 });
      }
      await prisma.warehouse.create({ data: { name } });
    } else if (data.action === 'addDepartment') {
      if (!data.warehouse || !data.name || !data.name.trim()) {
        return NextResponse.json({ error: '館別與部門名稱不可為空' }, { status: 400 });
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.warehouse } });
      if (!wh) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      const deptName = data.name.trim();
      const existingDept = await prisma.department.findUnique({
        where: { warehouseId_name: { warehouseId: wh.id, name: deptName } }
      });
      if (existingDept) {
        return NextResponse.json({ error: '此部門已存在' }, { status: 400 });
      }
      await prisma.department.create({ data: { name: deptName, warehouseId: wh.id } });
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 });
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
    console.error('新增館別/部門錯誤:', error);
    return NextResponse.json({ error: '操作失敗' }, { status: 500 });
  }
}

// DELETE: 刪除館別或部門
export async function DELETE(request) {
  try {
    const data = await request.json();

    if (data.action === 'deleteWarehouse') {
      if (!data.name) {
        return NextResponse.json({ error: '館別名稱不可為空' }, { status: 400 });
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.name } });
      if (!wh) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      await prisma.warehouse.delete({ where: { id: wh.id } });
    } else if (data.action === 'deleteDepartment') {
      if (!data.warehouse || !data.name) {
        return NextResponse.json({ error: '館別與部門名稱不可為空' }, { status: 400 });
      }
      const wh = await prisma.warehouse.findUnique({ where: { name: data.warehouse } });
      if (!wh) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      const dept = await prisma.department.findUnique({
        where: { warehouseId_name: { warehouseId: wh.id, name: data.name } }
      });
      if (dept) {
        await prisma.department.delete({ where: { id: dept.id } });
      }
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 });
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
    console.error('刪除館別/部門錯誤:', error);
    return NextResponse.json({ error: '操作失敗' }, { status: 500 });
  }
}
