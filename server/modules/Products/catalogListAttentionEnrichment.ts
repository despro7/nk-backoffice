import { prisma } from '../../lib/utils.js';
import {
  CATALOG_ACC_POLICY_GOOD,
  type CatalogGoodDto,
  type CatalogUnitDto,
} from '../../../shared/types/catalog.js';
import { getCatalogCardAttentionLabels } from '../../../shared/utils/catalogCardAttention.js';
import { isSuspiciousSpecQty } from '../../../shared/utils/catalogBomWeight.js';
import { isKitAccPolicy } from './ProductsTypes.js';

type ListRowWithPrices = {
  id: string;
  prices?: Array<{ priceType: string; price: number }>;
};

function isGoodAccPolicy(accPolicyId: string | null | undefined): boolean {
  return !accPolicyId || accPolicyId === CATALOG_ACC_POLICY_GOOD;
}

export async function computeSpecQtySuspiciousByGoodId(
  goodIds: string[],
  units: CatalogUnitDto[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (goodIds.length === 0) return out;

  const rows = await prisma.catalogGoodComponent.findMany({
    where: { parentGoodId: { in: goodIds } },
    select: {
      parentGoodId: true,
      qty: true,
      unitId: true,
      componentGood: { select: { weight: true } },
    },
  });

  const specQtyByGoodId = new Map<string, number>();
  const goods = await prisma.catalogGood.findMany({
    where: { id: { in: goodIds } },
    select: { id: true, specQty: true },
  });
  for (const g of goods) {
    const n = Number(g.specQty);
    specQtyByGoodId.set(g.id, Number.isFinite(n) && n > 0 ? n : 1);
  }

  const componentsByGood = new Map<string, Array<{ qty: number; unitId: string; componentWeight: number | null }>>();
  for (const row of rows) {
    const list = componentsByGood.get(row.parentGoodId) ?? [];
    list.push({
      qty: row.qty,
      unitId: row.unitId ?? '',
      componentWeight: row.componentGood?.weight ?? null,
    });
    componentsByGood.set(row.parentGoodId, list);
  }

  for (const goodId of goodIds) {
    const specQty = specQtyByGoodId.get(goodId) ?? 1;
    const components = componentsByGood.get(goodId) ?? [];
    if (isSuspiciousSpecQty(components, units, specQty)) {
      out.set(goodId, true);
    }
  }
  return out;
}

export async function enrichCatalogListDtos(
  dtos: CatalogGoodDto[],
  rows: ListRowWithPrices[],
  options: {
    kitPortionById: Map<string, number>;
    units: CatalogUnitDto[];
    specQtySuspiciousById: Map<string, boolean>;
  },
): Promise<CatalogGoodDto[]> {
  const pricesById = new Map(rows.map((row) => [row.id, row.prices ?? []]));

  return dtos.map((dto) => {
    const kitPortionCount = dto.isKit ? options.kitPortionById.get(dto.id) ?? 0 : undefined;
    const specQtySuspicious = options.specQtySuspiciousById.get(dto.id) ?? false;
    const catalogAttentionLabels = getCatalogCardAttentionLabels({
      isGroup: dto.isGroup,
      accPolicyId: dto.accPolicyId,
      isKit: dto.isKit,
      weight: dto.weight,
      packageRatio: dto.packageRatio,
      prices: pricesById.get(dto.id),
      doNotPublish: dto.doNotPublish,
      imageCount: dto.imageCount,
      description: dto.description,
      productIngredientsJson: dto.productIngredientsJson,
      productNutritionJson: dto.productNutritionJson,
      kitPortionCount,
      specQty: dto.specQty,
      specQtySuspicious,
    });

    return {
      ...dto,
      ...(dto.isKit ? { kitPortionCount: kitPortionCount ?? 0 } : {}),
      ...(specQtySuspicious ? { specQtySuspicious: true } : {}),
      ...(catalogAttentionLabels.length > 0 ? { catalogAttentionLabels } : {}),
    };
  });
}

export function collectListAttentionGoodIds(dtos: CatalogGoodDto[]): string[] {
  return dtos
    .filter((dto) => !dto.isGroup && isGoodAccPolicy(dto.accPolicyId) && (dto.specQty ?? 1) > 1)
    .map((dto) => dto.id);
}

export function collectListKitIds(dtos: CatalogGoodDto[]): string[] {
  return dtos.filter((dto) => isKitAccPolicy(dto.accPolicyId)).map((dto) => dto.id);
}
