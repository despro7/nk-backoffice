/**
 * Внутрішній EAN-13 для наліпки коробки (привʼязка good + партія).
 * Не синхронізується в Dilovod; використовується для скану в моб. переміщеннях (barcodeKind=box).
 * Окрема серія 225… (порції — 220… з Dilovod), щоб коди коробок і порцій не перетиналися.
 * Уже видані коди коробок не перевидаються.
 */

import { prisma } from '../../lib/utils.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';
import {
  allocateNextEan13,
  EAN13_BOX_SEED_BODY,
  EAN13_BOX_SERIES_PREFIX,
  isBoxEan13,
} from './barcodeUtils.js';

export async function ensureCatalogBoxBarcode(input: {
  goodId: string;
  batchId: string;
  batchNumber: string;
}): Promise<string> {
  const batchId = input.batchId.trim();
  if (!isUsableDilovodBatchId(batchId)) {
    throw new Error('Для ШК коробки потрібна валідна партія (batchId)');
  }

  const existing = await prisma.catalogGoodBarcode.findFirst({
    where: {
      goodId: input.goodId,
      goodPart: batchId,
      barcodeKind: 'box',
      activity: true,
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { code: true },
  });
  if (existing?.code) return existing.code;

  const boxCodes = await prisma.catalogGoodBarcode.findMany({
    where: { code: { startsWith: EAN13_BOX_SERIES_PREFIX } },
    select: { code: true },
  });
  // Зайнятість — по всій catalog_good_barcodes (будь-який kind / партія).
  const code = await allocateNextEan13(
    boxCodes.map((row) => row.code),
    async (candidate) => {
      const hit = await prisma.catalogGoodBarcode.findFirst({
        where: { code: candidate },
        select: { id: true },
      });
      return Boolean(hit);
    },
    { seedBody: EAN13_BOX_SEED_BODY, inSeries: isBoxEan13 },
  );

  await prisma.catalogGoodBarcode.create({
    data: {
      goodId: input.goodId,
      code,
      goodPart: batchId,
      goodPartName: input.batchNumber.trim() || null,
      barcodeKind: 'box',
      activity: true,
    },
  });

  return code;
}
