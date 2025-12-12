const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('🔍 Діагностика поля dilovodId...');

  const products = await prisma.product.findMany({
    where: { dilovodId: { not: null } },
    select: { sku: true, dilovodId: true, name: true }
  });

  console.log(`📊 Знайдено ${products.length} продуктів з dilovodId`);

  let nonNumericIssues = 0;
  products.forEach(p => {
    if (!/^\d+$/.test(p.dilovodId)) {
      console.log(`⚠️  SKU: ${p.sku}, dilovodId: ${p.dilovodId} (не є числом)`);
      nonNumericIssues++;
    }
  });

  console.log(`\n📈 Статистика:`);
  console.log(`   Нечислові dilovodId: ${nonNumericIssues}`);
  console.log(`   Всього продуктів: ${products.length}`);

  await prisma.$disconnect();
}

diagnose().catch(console.error);