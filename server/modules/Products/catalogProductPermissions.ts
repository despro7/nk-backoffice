import type { Request, Response } from 'express';
import { PERMISSIONS, hasPermission } from '../../../shared/constants/permissions.js';
import type {
  CatalogCreateGoodInput,
  CatalogGoodDetailDto,
  CatalogUpdateGoodInput,
} from '../../../shared/types/catalog.js';
import {
  hasSpecFieldsChanged,
  hasSpecFieldsOnCreate,
  hasStorefrontFieldsChanged,
  hasStorefrontFieldsOnCreate,
} from '../../../shared/utils/catalogProductFieldAccess.js';
import { sendInsufficientRole } from '../../middleware/requirePermission.js';

export function assertCatalogProductFieldPermissions(
  res: Response,
  permissions: Iterable<string>,
  input: CatalogCreateGoodInput | CatalogUpdateGoodInput,
  existing?: CatalogGoodDetailDto | null,
): boolean {
  if (existing) {
    if (
      hasStorefrontFieldsChanged(input, existing) &&
      !hasPermission(permissions, PERMISSIONS.ACTION_STOREFRONT_EDIT)
    ) {
      sendInsufficientRole(res, 'Немає права редагувати контент сайту');
      return false;
    }
    if (
      hasSpecFieldsChanged(input, existing) &&
      !hasPermission(permissions, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC)
    ) {
      sendInsufficientRole(res, 'Немає права редагувати специфікацію товару');
      return false;
    }
    return true;
  }

  if (
    hasStorefrontFieldsOnCreate(input as CatalogCreateGoodInput) &&
    !hasPermission(permissions, PERMISSIONS.ACTION_STOREFRONT_EDIT)
  ) {
    sendInsufficientRole(res, 'Немає права редагувати контент сайту');
    return false;
  }
  if (
    hasSpecFieldsOnCreate(input as CatalogCreateGoodInput) &&
    !hasPermission(permissions, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC)
  ) {
    sendInsufficientRole(res, 'Немає права редагувати специфікацію товару');
    return false;
  }
  return true;
}

export async function assertCatalogProductFieldPermissionsForUpdate(
  _req: Request,
  res: Response,
  permissions: Iterable<string>,
  goodId: string,
  input: CatalogUpdateGoodInput,
  loadDetail: (id: string) => Promise<CatalogGoodDetailDto | null>,
): Promise<boolean> {
  const existing = await loadDetail(goodId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Товар не знайдено' });
    return false;
  }
  return assertCatalogProductFieldPermissions(res, permissions, input, existing);
}
