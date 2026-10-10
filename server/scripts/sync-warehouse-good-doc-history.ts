/**
 * Ручний повний sync шапок документів з Dilovod у локальну БД.
 *
 * Usage:
 *   npx tsx server/scripts/sync-warehouse-good-doc-history.ts --kind=surplus --months=3
 *   npx tsx server/scripts/sync-warehouse-good-doc-history.ts --kind=writeOff --months=3
 */
import { PrismaClient } from '@prisma/client';
import { surplusHistorySyncService, writeOffHistorySyncService } from '../modules/Warehouse/WarehouseGoodDocumentHistorySync.js';
import {
  formatDilovodHistoryFromDateMonthsAgo,
  type GoodDocHistoryKind,
} from '../../shared/types/warehouseGoodDocument.js';

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { kind: GoodDocHistoryKind; months: number } {
  const kindArg = argv.find((a) => a.startsWith('--kind='));
  const monthsArg = argv.find((a) => a.startsWith('--months='));
  const kindRaw = kindArg?.split('=')[1] ?? 'surplus';
  if (kindRaw !== 'surplus' && kindRaw !== 'writeOff') {
    throw new Error(`Invalid --kind=${kindRaw} (use surplus or writeOff)`);
  }
  const months = monthsArg ? Number(monthsArg.split('=')[1]) : 3;
  if (!Number.isFinite(months) || months <= 0 || months > 24) {
    throw new Error('Invalid --months (1–24)');
  }
  return { kind: kindRaw, months };
}

async function main(): Promise<void> {
  const { kind, months } = parseArgs(process.argv.slice(2));
  const fromDate = formatDilovodHistoryFromDateMonthsAgo(months);
  const service = kind === 'surplus' ? surplusHistorySyncService : writeOffHistorySyncService;

  console.log(`[sync-warehouse-good-doc-history] kind=${kind} fromDate=${fromDate} forceFullList=true`);
  const result = await service.sync({ fromDate, forceFullList: true });
  console.log('[sync-warehouse-good-doc-history] done:', result);

  const count = kind === 'surplus'
    ? await prisma.warehouseSurplusHistory.count({ where: { status: 'created' } })
    : await prisma.warehouseWriteOffHistory.count({ where: { status: 'created' } });
  console.log(`[sync-warehouse-good-doc-history] active records in DB: ${count}`);
}

main()
  .catch((err) => {
    console.error('[sync-warehouse-good-doc-history] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
