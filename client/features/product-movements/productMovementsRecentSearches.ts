import type { ProductMovementsFilterState, ProductMovementsMetaResponse } from './types';
import {
  buildProductMovementsReportSubtitle,
  formatProductDisplayLabel,
} from './productMovementsUtils';

const STORAGE_KEY = 'product-movements-recent-searches-v1';
const CHANGE_EVENT = 'product-movements-recent-searches-changed';
const MAX_ITEMS = 10;

function notifyRecentSearchesChanged(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface ProductMovementsRecentSearch {
  id: string;
  savedAt: number;
  filters: ProductMovementsFilterState;
  label: string;
  hint: string;
}

function buildSearchId(filters: ProductMovementsFilterState): string {
  return [
    filters.sku ?? '',
    filters.dilovodGoodId ?? '',
    filters.startDate,
    filters.endDate,
    filters.goodPartId ?? '',
    filters.storageId ?? '',
    filters.firmId ?? '',
  ].join('|');
}

function buildLabel(filters: ProductMovementsFilterState): string {
  const label = formatProductDisplayLabel(filters.productName, filters.sku);
  return label || 'Товар';
}

export function formatRecentSearchHint(hint: string): string {
  return hint.replace(/\u2014/g, '\u2013');
}

function buildHint(
  filters: ProductMovementsFilterState,
  meta?: ProductMovementsMetaResponse | null,
): string {
  return buildProductMovementsReportSubtitle(filters, meta);
}

function normalizeRecentSearch(
  item: ProductMovementsRecentSearch,
  meta?: ProductMovementsMetaResponse | null,
): ProductMovementsRecentSearch {
  return {
    ...item,
    label: buildLabel(item.filters),
    hint: buildHint(item.filters, meta),
  };
}

export function loadProductMovementsRecentSearches(
  meta?: ProductMovementsMetaResponse | null,
): ProductMovementsRecentSearch[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProductMovementsRecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.filters?.sku || item?.filters?.dilovodGoodId)
      .map((item) => normalizeRecentSearch(item, meta))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function removeProductMovementsRecentSearch(id: string): void {
  const next = loadProductMovementsRecentSearches().filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyRecentSearchesChanged();
  } catch {
    // quota / private mode
  }
}

export function saveProductMovementsRecentSearch(
  filters: ProductMovementsFilterState,
  meta?: ProductMovementsMetaResponse | null,
): void {
  if (!filters.sku && !filters.dilovodGoodId) return;

  const entry: ProductMovementsRecentSearch = {
    id: buildSearchId(filters),
    savedAt: Date.now(),
    filters,
    label: buildLabel(filters),
    hint: buildHint(filters, meta),
  };

  const existing = loadProductMovementsRecentSearches().filter((item) => item.id !== entry.id);
  const next = [entry, ...existing].slice(0, MAX_ITEMS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notifyRecentSearchesChanged();
  } catch {
    // quota / private mode
  }
}

export function subscribeProductMovementsRecentSearches(onStoreChange: () => void): () => void {
  const handler = (event: Event) => {
    if (event.type === CHANGE_EVENT) {
      onStoreChange();
      return;
    }
    const storageEvent = event as StorageEvent;
    if (storageEvent.key === STORAGE_KEY) {
      onStoreChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
