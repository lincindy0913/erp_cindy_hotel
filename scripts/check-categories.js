const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const cats = await p.cashCategory.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  console.log('=== Cash Categories ===');
  for (const c of cats) {
    console.log(`[${c.type}] ${c.name} | code: ${c.systemCode || '-'} | active: ${c.isActive}`);
  }
  console.log(`Total: ${cats.length}`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
