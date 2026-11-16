/**
 * Віртуальний тест рахунків. Лише читання БД.
 *
 * Для кожного періоду зі старої таблиці обліку (historySeed) рахує порції так, як це зробить
 * генератор рахунків, і порівнює з порціями, на які тоді виставлявся рахунок.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.server.json server/scripts/invoices-virtual-test.ts
 *   npx tsx --tsconfig tsconfig.server.json server/scripts/invoices-virtual-test.ts --last=6
 *   npx tsx --tsconfig tsconfig.server.json server/scripts/invoices-virtual-test.ts --statuses=1,2,3,4,5,9
 */
import { prisma } from '../lib/utils.js';
import { HISTORY_ROWS } from '../modules/Invoices/historySeed.js';
import { getPortionsForRange } from '../modules/Invoices/PortionsService.js';
import { DEFAULT_INVOICE_SETTINGS } from '../modules/Invoices/invoiceStores.js';
import { portionsAmount } from '../../shared/utils/invoiceCalc.js';

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

const VARIANTS: Array<{ label: string; statuses: string[] }> = [
  { label: '1-5 (як у звіті продажів)', statuses: ['1', '2', '3', '4', '5'] },
  { label: '1-5 і 9', statuses: ['1', '2', '3', '4', '5', '9'] },
  { label: '5 (лише продаж)', statuses: ['5'] },
];

async function main() {
  const last = Number(arg('last') ?? 8);
  const custom = arg('statuses')?.split(',').map((s) => s.trim()).filter(Boolean);
  const variants = custom ? [{ label: `custom ${custom.join(',')}`, statuses: custom }] : VARIANTS;
  const rows = HISTORY_ROWS.slice(-last);
  const dayStartRaw = arg('dayStart');
  const dayStartHour = dayStartRaw != null ? Number(dayStartRaw) : undefined;

  console.log(`Період              | таблиця  | ${variants.map((v) => v.label).join(' | ')}  (dayStartHour=${dayStartHour ?? 'з налаштувань'})`);
  const exact = new Map<string, number>();
  for (const row of rows) {
    const cells: string[] = [];
    for (const variant of variants) {
      const res = await getPortionsForRange(row.start, row.end, variant.statuses, { force: true, dayStartHour });
      const diff = res.total - row.portions;
      if (diff === 0) exact.set(variant.label, (exact.get(variant.label) ?? 0) + 1);
      const amount = portionsAmount(res.total, row.tariff, true);
      cells.push(`${res.total} (${diff >= 0 ? '+' : ''}${diff}, ${amount} грн)`);
    }
    console.log(`${row.start}..${row.end} | ${row.portions} | ${cells.join(' | ')}`);
  }
  console.log('\nТочних збігів:');
  for (const variant of variants) console.log(`  ${variant.label}: ${exact.get(variant.label) ?? 0} з ${rows.length}`);
  console.log(`\nПоточний набір статусів у налаштуваннях за замовчуванням: ${DEFAULT_INVOICE_SETTINGS.countedStatuses.join(',')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
