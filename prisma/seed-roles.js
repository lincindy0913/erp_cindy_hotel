// 角色種子檔 - 建立 6 個系統角色 + 遷移既有使用者
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLE_DEFAULTS = {
  admin: {
    name: '系統管理員',
    description: '擁有所有系統權限，可管理使用者和系統設定',
    permissions: ['*'],
  },
  manager: {
    name: '主管',
    description: '可審核付款、檢視所有報表、不可執行出納作業',
    permissions: [
      'purchasing.view', 'purchasing.create', 'purchasing.edit',
      'sales.view', 'sales.create', 'sales.edit',
      'finance.view', 'finance.create', 'finance.edit',
      'cashier.view',
      'inventory.view',
      'cashflow.view', 'cashflow.create',
      'pms.view', 'pms.import',
      'loan.view', 'loan.create', 'loan.confirm',
      'check.view', 'check.create', 'check.clear',
      'reconciliation.view', 'reconciliation.create',
      'rental.view', 'rental.create', 'rental.edit',
      'monthend.view', 'monthend.execute',
      'expense.view', 'expense.create',
      'analytics.view',
      'export.xlsx', 'export.csv', 'export.pdf',
      'audit.view',
      'attachment.upload', 'attachment.delete',
      'settings.view',
    ],
  },
  finance: {
    name: '財務',
    description: '建立發票/付款單，不可執行出納確認',
    permissions: [
      'purchasing.view',
      'sales.view', 'sales.create', 'sales.edit',
      'finance.view', 'finance.create', 'finance.edit',
      'cashier.view',
      'inventory.view',
      'cashflow.view', 'cashflow.create', 'cashflow.edit',
      'pms.view', 'pms.import',
      'loan.view', 'loan.create', 'loan.confirm',
      'check.view', 'check.create',
      'reconciliation.view', 'reconciliation.create',
      'rental.view', 'rental.create', 'rental.edit',
      'monthend.view', 'monthend.execute',
      'expense.view', 'expense.create',
      'analytics.view',
      'export.xlsx', 'export.csv', 'export.pdf',
      'attachment.upload', 'attachment.delete',
    ],
  },
  cashier: {
    name: '出納',
    description: '執行出納確認、支票兌現，不可建立付款單',
    permissions: [
      'purchasing.view',
      'sales.view',
      'finance.view',
      'cashier.view', 'cashier.execute', 'cashier.reject',
      'inventory.view',
      'cashflow.view', 'cashflow.create', 'cashflow.edit',
      'loan.view',
      'check.view', 'check.clear',
      'reconciliation.view',
      'rental.view',
      'monthend.view',
      'expense.view',
      'analytics.view',
      'export.xlsx', 'export.csv',
      'attachment.upload',
    ],
  },
  purchasing: {
    name: '採購',
    description: '建立進貨單，不可存取付款模組',
    permissions: [
      'purchasing.view', 'purchasing.create', 'purchasing.edit',
      'sales.view',
      'inventory.view',
      'pms.view',
      'expense.view',
      'analytics.view',
      'export.xlsx', 'export.csv',
      'attachment.upload',
    ],
  },
  viewer: {
    name: '檢視者',
    description: '唯讀報表，無法新增/修改/刪除',
    permissions: [
      'purchasing.view', 'sales.view', 'finance.view', 'cashier.view',
      'inventory.view', 'cashflow.view', 'pms.view',
      'loan.view', 'check.view', 'reconciliation.view',
      'rental.view', 'monthend.view', 'expense.view', 'analytics.view',
      'export.csv',
    ],
  },
};

async function main() {
  console.log('開始建立系統角色...');

  // 1. 建立/更新 6 個系統角色
  for (const [code, data] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystem: true,
      },
      create: {
        code,
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystem: true,
      },
    });
    console.log(`  角色 ${code} (${data.name}) - ID: ${role.id}`);
  }

  // 2. 遷移既有使用者：admin→admin角色，user→viewer角色
  const users = await prisma.user.findMany();
  const adminRole = await prisma.role.findUnique({ where: { code: 'admin' } });
  const viewerRole = await prisma.role.findUnique({ where: { code: 'viewer' } });

  for (const user of users) {
    const targetRole = user.role === 'admin' ? adminRole : viewerRole;
    if (targetRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: targetRole.id } },
        update: {},
        create: {
          userId: user.id,
          roleId: targetRole.id,
          assignedBy: 'system-migration',
        },
      });
      console.log(`  使用者 ${user.email} → 角色 ${targetRole.code}`);
    }
  }

  console.log('角色種子完成！');
}

main()
  .catch((e) => {
    console.error('角色種子執行錯誤:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
