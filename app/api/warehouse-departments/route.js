import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export const dynamic = 'force-dynamic';

// GET: 取得所有館別與部門
export async function GET() {
  try {
    const store = getStore();
    if (!store.warehouseDepartments) {
      store.warehouseDepartments = {};
    }
    return NextResponse.json(store.warehouseDepartments);
  } catch (error) {
    console.error('取得館別部門錯誤:', error);
    return NextResponse.json({}, { status: 500 });
  }
}

// POST: 新增館別或部門
// body: { action: 'addWarehouse', name: '新館別' }
// body: { action: 'addDepartment', warehouse: '麗格', name: '新部門' }
export async function POST(request) {
  try {
    const store = getStore();
    if (!store.warehouseDepartments) {
      store.warehouseDepartments = {};
    }

    const data = await request.json();

    if (data.action === 'addWarehouse') {
      if (!data.name || !data.name.trim()) {
        return NextResponse.json({ error: '館別名稱不可為空' }, { status: 400 });
      }
      const name = data.name.trim();
      if (store.warehouseDepartments[name]) {
        return NextResponse.json({ error: '此館別已存在' }, { status: 400 });
      }
      store.warehouseDepartments[name] = [];
      return NextResponse.json(store.warehouseDepartments);
    }

    if (data.action === 'addDepartment') {
      if (!data.warehouse || !data.name || !data.name.trim()) {
        return NextResponse.json({ error: '館別與部門名稱不可為空' }, { status: 400 });
      }
      const warehouse = data.warehouse;
      const deptName = data.name.trim();
      if (!store.warehouseDepartments[warehouse]) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      if (store.warehouseDepartments[warehouse].includes(deptName)) {
        return NextResponse.json({ error: '此部門已存在' }, { status: 400 });
      }
      store.warehouseDepartments[warehouse].push(deptName);
      return NextResponse.json(store.warehouseDepartments);
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('新增館別/部門錯誤:', error);
    return NextResponse.json({ error: '操作失敗' }, { status: 500 });
  }
}

// DELETE: 刪除館別或部門
// body: { action: 'deleteWarehouse', name: '館別' }
// body: { action: 'deleteDepartment', warehouse: '麗格', name: '部門' }
export async function DELETE(request) {
  try {
    const store = getStore();
    if (!store.warehouseDepartments) {
      store.warehouseDepartments = {};
    }

    const data = await request.json();

    if (data.action === 'deleteWarehouse') {
      if (!data.name) {
        return NextResponse.json({ error: '館別名稱不可為空' }, { status: 400 });
      }
      if (!store.warehouseDepartments[data.name]) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      delete store.warehouseDepartments[data.name];
      return NextResponse.json(store.warehouseDepartments);
    }

    if (data.action === 'deleteDepartment') {
      if (!data.warehouse || !data.name) {
        return NextResponse.json({ error: '館別與部門名稱不可為空' }, { status: 400 });
      }
      if (!store.warehouseDepartments[data.warehouse]) {
        return NextResponse.json({ error: '此館別不存在' }, { status: 404 });
      }
      store.warehouseDepartments[data.warehouse] = store.warehouseDepartments[data.warehouse].filter(d => d !== data.name);
      return NextResponse.json(store.warehouseDepartments);
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('刪除館別/部門錯誤:', error);
    return NextResponse.json({ error: '操作失敗' }, { status: 500 });
  }
}
