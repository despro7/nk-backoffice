/**
 * Внутрішній EAN-13 для наліпки коробки (привʼязка good + партія).
 * Не синхронізується в Dilovod; використовується для скану в моб. переміщеннях (barcodeKind=box).
 */

import { prisma } from '../../lib/utils.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';
import { allocateNextEan13 } from './barcodeUtils.js';

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

  const allCodes = await prisma.catalogGoodBarcode.findMany({ select: { code: true } });
  const code = await allocateNextEan13(
    allCodes.map((row) => row.code),
    async (candidate) => {
      const hit = await prisma.catalogGoodBarcode.findFirst({
        where: { code: candidate },
        select: { id: true },
      });
      return Boolean(hit);
    },
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
