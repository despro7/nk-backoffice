/**
 * Maps BO catalog group names to WooCommerce product categories.
 */

import type { WooPullConflict } from '../../../shared/types/storefront.js';
import { getDilovodConfigFromDB } from '../../services/dilovod/DilovodUtils.js';
import type { WooCommerceApiClient } from './WooCommerceApiClient.js';

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function lookupCategoryIdInMap(map: Record<string, number>, name: string): number | null {
  if (map[name] != null) return map[name];
  const lower = normalizeName(name);
  for (const [key, value] of Object.entries(map)) {
    if (normalizeName(key) === lower) return value;
  }
  return null;
}

export function resolveWcPrimaryCategoryName(
  product: { categories?: Array<{ name?: string | null }> },
): string | null {
  const first = product.categories?.[0]?.name?.trim();
  return first || null;
}

export function categoryFieldConflict(
  localGroupName: string | null | undefined,
  remoteCategoryName: string | null | undefined,
): WooPullConflict | null {
  const local = localGroupName?.trim() || null;
  const remote = remoteCategoryName?.trim() || null;
  if (!local) return null;
  if (!remote) {
    return { field: 'category', localValue: local, remoteValue: null };
  }
  if (normalizeName(local) === normalizeName(remote)) return null;
  return { field: 'category', localValue: local, remoteValue: remote };
}

export class WooCommerceCategoryService {
  private cache = new Map<string, number>();

  clearCache(): void {
    this.cache.clear();
  }

  async resolveCategoryId(
    client: WooCommerceApiClient,
    groupName: string | null | undefined,
  ): Promise<number | null> {
    const name = groupName?.trim();
    if (!name) return null;

    const cacheKey = normalizeName(name);
    const cached = this.cache.get(cacheKey);
    if (cached != null) return cached;

    const config = await getDilovodConfigFromDB();
    const mappedId = lookupCategoryIdInMap(config.categoriesMap || {}, name);
    if (mappedId != null) {
      this.cache.set(cacheKey, mappedId);
      return mappedId;
    }

    const existing = await client.findProductCategoryByName(name);
    if (existing) {
      this.cache.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await client.createProductCategory({ name });
    this.cache.set(cacheKey, created.id);
    return created.id;
  }
}

export const wooCommerceCategoryService = new WooCommerceCategoryService();
