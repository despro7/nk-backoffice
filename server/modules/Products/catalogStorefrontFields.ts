import type { Prisma } from '@prisma/client';
import type {
  CatalogCreateGoodInput,
  CatalogGoodDto,
  CatalogUpdateGoodInput,
} from '../../../shared/types/catalog.js';
import type { ProductNutritionJson, StorefrontDescriptionDoc } from '../../../shared/types/storefront.js';
import {
  parseProductIngredientsJson,
  parseProductNutritionJson,
  parseStorefrontDescriptionDoc,
  stringifyProductIngredientsJson,
  stringifyProductNutritionJson,
  stringifyStorefrontDescriptionDoc,
} from '../../../shared/utils/storefrontDescription.js';

export type CatalogStorefrontDbFields = {
  doNotPublish: boolean;
  storefrontPresetId: string | null;
  productIngredientsJson: string | null;
  productNutritionJson: string | null;
  storefrontDescriptionDoc: string | null;
  grossWeight: number | null;
  mainProductWeight: number | null;
  wooProductId: number | null;
  wooLastSyncedAt: Date | null;
};

export function mapStorefrontFieldsToDto(
  row: Partial<CatalogStorefrontDbFields>,
): Pick<
  CatalogGoodDto,
  | 'doNotPublish'
  | 'storefrontPresetId'
  | 'productIngredientsJson'
  | 'productNutritionJson'
  | 'storefrontDescriptionDoc'
  | 'grossWeight'
  | 'mainProductWeight'
  | 'wooProductId'
  | 'wooLastSyncedAt'
> {
  const nutrition = parseProductNutritionJson(row.productNutritionJson ?? null);
  const ingredients = parseProductIngredientsJson(row.productIngredientsJson ?? null);
  const descriptionDoc = parseStorefrontDescriptionDoc(row.storefrontDescriptionDoc ?? null);
  return {
    doNotPublish: row.doNotPublish ?? false,
    storefrontPresetId: row.storefrontPresetId ?? null,
    productIngredientsJson: ingredients.length ? ingredients : null,
    productNutritionJson: nutrition,
    storefrontDescriptionDoc: descriptionDoc,
    grossWeight: row.grossWeight ?? null,
    mainProductWeight: row.mainProductWeight ?? null,
    wooProductId: row.wooProductId ?? null,
    wooLastSyncedAt: row.wooLastSyncedAt?.toISOString() ?? null,
  };
}

export function buildStorefrontPatchFromInput(
  input: CatalogCreateGoodInput | CatalogUpdateGoodInput,
): Prisma.CatalogGoodUpdateInput {
  const data: Prisma.CatalogGoodUpdateInput = {};

  if (input.doNotPublish !== undefined) data.doNotPublish = Boolean(input.doNotPublish);
  if (input.storefrontPresetId !== undefined) {
    data.storefrontPresetId = input.storefrontPresetId?.trim() || null;
  }
  if (input.productIngredientsJson !== undefined) {
    data.productIngredientsJson = stringifyProductIngredientsJson(input.productIngredientsJson);
  }
  if (input.productNutritionJson !== undefined) {
    data.productNutritionJson = stringifyProductNutritionJson(
      input.productNutritionJson as ProductNutritionJson | null,
    );
  }
  if (input.storefrontDescriptionDoc !== undefined) {
    data.storefrontDescriptionDoc =
      input.storefrontDescriptionDoc
        ? stringifyStorefrontDescriptionDoc(input.storefrontDescriptionDoc as StorefrontDescriptionDoc)
        : null;
  }
  if (input.grossWeight !== undefined) {
    data.grossWeight =
      input.grossWeight != null && Number.isFinite(input.grossWeight) ? input.grossWeight : null;
  }
  if (input.mainProductWeight !== undefined) {
    data.mainProductWeight =
      input.mainProductWeight != null && Number.isFinite(input.mainProductWeight)
        ? input.mainProductWeight
        : null;
  }

  return data;
}

export function hasStorefrontInput(input: CatalogCreateGoodInput | CatalogUpdateGoodInput): boolean {
  return (
    input.doNotPublish !== undefined ||
    input.storefrontPresetId !== undefined ||
    input.productIngredientsJson !== undefined ||
    input.productNutritionJson !== undefined ||
    input.storefrontDescriptionDoc !== undefined ||
    input.grossWeight !== undefined ||
    input.mainProductWeight !== undefined
  );
}
