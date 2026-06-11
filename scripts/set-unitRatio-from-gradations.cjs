#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GRADATIONS = [
  { min: 525, value: 1.5 },
  { min: 420, value: 1.25 },
  { min: 280, value: 1.0 },
  { min: 185, value: 0.75 },
  { min: 90,  value: 0.5 },
  { min: 0,   value: 0.25 }
];

function deriveUnitRatioFromWeight(weight) {
  if (weight === null || weight === undefined) return 1;
  if (typeof weight !== 'number') {
    const parsed = parseFloat(String(weight));
    if (Number.isNaN(parsed)) return 1;
    weight = parsed;
  }
  let grams = weight;
  if (grams > 0 && grams <= 10) grams = grams * 1000; // looks like kg
  for (const g of GRADATIONS) if (grams >= g.min) return g.value;
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  console.log(`set-unitRatio-from-gradations: starting (${apply ? 'apply' : 'dry-run'})`);

  const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, weight: true, unitRatio: true } });
  console.log(`Products fetched: ${products.length}`);

  const toUpdate = [];
  for (const p of products) {
    const derived = deriveUnitRatioFromWeight(p.weight);
    const current = typeof p.unitRatio === 'number' ? Number(p.unitRatio) : null;
    if (current === null || Math.abs(current - derived) > 1e-9) {
      toUpdate.push({ id: p.id, sku: p.sku, name: p.name, weight: p.weight, current, derived });
    }
  }

  console.log(`Will update ${toUpdate.length} products (use --apply to persist).`);
  if (toUpdate.length > 0) console.table(toUpdate.slice(0, 30));

  if (apply && toUpdate.length > 0) {
    let i = 0;
    for (const u of toUpdate) {
      i++;
      try {
        await prisma.product.update({ where: { id: u.id }, data: { unitRatio: u.derived } });
        if (i % 100 === 0) console.log(`Applied ${i}/${toUpdate.length}`);
      } catch (err) {
        console.error(`Failed to update product ${u.sku} (id=${u.id}):`, err);
      }
    }
    console.log(`Applied updates to ${toUpdate.length} products.`);
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error('Script failed:', err);
  prisma.$disconnect().finally(() => process.exit(1));
});
