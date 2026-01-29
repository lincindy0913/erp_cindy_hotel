const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Check if admin exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@hotel.com' }
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await prisma.user.create({
      data: {
        email: 'admin@hotel.com',
        password: hashedPassword,
        name: '系統管理員',
        role: 'admin',
        permissions: [
          'dashboard',
          'products',
          'suppliers',
          'purchasing',
          'sales',
          'finance',
          'inventory',
          'analytics',
          'expenses',
          'payment-voucher'
        ]
      }
    });

    console.log('Default admin account created:');
    console.log('  Email: admin@hotel.com');
    console.log('  Password: admin123');
    console.log('');
    console.log('Please change the password after first login!');
  } else {
    console.log('Admin account already exists, skipping seed.');
  }

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
