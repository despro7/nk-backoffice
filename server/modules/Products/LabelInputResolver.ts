/**
 * Базові inputs наліпки з картки товару + партії.
 */

import { prisma } from '../../lib/utils.js';
import {
  buildLabelInputs,
  mergeLabelOverrides,
  type LabelInputSource,
} from '../../../shared/utils/labelInputs.js';
import { formatLabelExpiryDate } from '../../../shared/utils/productLabel.js';
import {
  parseProductIngredientsJson,
  parseProductNutritionJson,
  resolveIngredientsText,
} from '../../../shared/utils/storefrontDescription.js';
import { isMissingDilovodDate } from '../../../shared/utils/dilovodBatchId.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import { extractBatchExpirationFromGoodPartHeader } from '../../services/dilovod/DilovodUtils.js';
import { logServer } from '../../lib/utils.js';
import { loadLabelSvgInputs } from './pdfme/labelPdfmeRuntime.js';
import type { LabelInputMap } from '../../../shared/constants/labelInputKeys.js';
import type { ProductLabelKind } from '../../../shared/types/productLabel.js';
import { ensureCatalogBoxBarcode } from './CatalogBoxBarcodeService.js';
import { resolveStorefrontBlockOverridePlain } from '../../../shared/utils/labelStorefrontOverrides.js';

const dilovodApiClient = new DilovodApiClient();

async function resolveExpiration(batchId: string, hint?: string | null): Promise<string> {
  const trimmed = hint?.trim();
  if (trimmed && !isMissingDilovodDate(trimmed)) return formatLabelExpiryDate(trimmed);
  try {
    const obj = await dilovodApiClient.getObject(batchId);
    const header =
      obj.header && typeof obj.header === 'object'
        ? (obj.header as Record<string, unknown>)
        : undefined;
    const expiration = extractBatchExpirationFromGoodPartHeader(header);
    if (expiration && !isMissingDilovodDate(expiration)) return formatLabelExpiryDate(expiration);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logServer(`[LabelInput] expiration resolve failed for ${batchId}: ${msg}`);
  }
  return '';
}

export async function resolveLabelBaseInputs(input: {
  goodId: string;
  batchId: string;
  batchNumber: string;
  expiration?: string | null;
  labelKind?: ProductLabelKind;
}): Promise<LabelInputMap> {
  const good = await prisma.catalogGood.findUnique({
    where: { id: input.goodId },
    select: {
      id: true,
      name: true,
      printName: true,
      weight: true,
      mainProductWeight: true,
      packageRatio: true,
      productIngredientsJson: true,
      productNutritionJson: true,
      storefrontDescriptionDoc: true,
      isGroup: true,
      components: { orderBy: { rowNum: 'asc' } },
      barcodes: true,
    },
  });
  if (!good || good.isGroup) throw new Error('Товар не знайдено');

  const componentIds = good.components.map((c) => c.componentGoodId);
  const componentGoods =
    componentIds.length > 0
      ? await prisma.catalogGood.findMany({
          where: { id: { in: componentIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(componentGoods.map((g) => [g.id, g.name]));
  const bom = good.components.map((c) => ({
    componentName: nameById.get(c.componentGoodId) || c.componentGoodId,
    qty: c.qty,
  }));
  const ingredientsJson = parseProductIngredientsJson(good.productIngredientsJson);
  const { text: ingredientsFromCard } = resolveIngredientsText(ingredientsJson, bom);
  const ingredientsFromDescription = resolveStorefrontBlockOverridePlain(
    good.storefrontDescriptionDoc,
    'ingredients',
  );
  const ingredientsText = ingredientsFromDescription ?? ingredientsFromCard;
  const storageFromDescription = resolveStorefrontBlockOverridePlain(
    good.storefrontDescriptionDoc,
    'storage',
  );
  const nutrition = parseProductNutritionJson(good.productNutritionJson);
  const batchBarcode = good.barcodes.find(
    (b) => b.activity && b.goodPart === input.batchId && b.barcodeKind !== 'box',
  );
  const defaultBarcode = good.barcodes.find(
    (b) => b.activity && (!b.goodPart || b.goodPart === '') && b.barcodeKind !== 'box',
  );
  let barcode = batchBarcode?.code || defaultBarcode?.code || '';
  if (input.labelKind === 'box') {
    barcode = await ensureCatalogBoxBarcode({
      goodId: input.goodId,
      batchId: input.batchId,
      batchNumber: input.batchNumber,
    });
  }
  const expiresAt = await resolveExpiration(input.batchId, input.expiration);
  const source: LabelInputSource = {
    name: good.name,
    printName: good.printName,
    ingredientsText,
    nutrition,
    weightKg: good.weight,
    mainProductWeightKg: good.mainProductWeight,
    barcode,
    batchNumber: input.batchNumber,
    expiresAt,
    portionsPerBox: good.packageRatio,
    storageText: storageFromDescription,
  };
  const svg = await loadLabelSvgInputs();
  return { ...buildLabelInputs(source), ...svg };
}

export function applyLabelOverrides(
  base: LabelInputMap,
  overrides: Partial<LabelInputMap> | null | undefined,
): LabelInputMap {
  return mergeLabelOverrides(base, overrides);
}
