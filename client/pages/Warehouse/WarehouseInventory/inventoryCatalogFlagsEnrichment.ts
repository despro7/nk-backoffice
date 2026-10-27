import type { InventorySession } from './WarehouseInventoryTypes';

export type InventoryCatalogFlags = {
  isOutdated: boolean;
  doNotPublish: boolean;
};

const CHUNK_SIZE = 400;

async function fetchInventoryCatalogFlagsChunk(
  skus: string[],
): Promise<Record<string, InventoryCatalogFlags>> {
  if (skus.length === 0) return {};
  const res = await fetch('/api/warehouse/inventory/catalog-flags', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus }),
  });
  if (!res.ok) return {};
  const data = (await res.json()) as { flags?: Record<string, InventoryCatalogFlags> };
  return data.flags ?? {};
}

export async function fetchInventoryCatalogFlagsBySkus(
  skus: string[],
): Promise<Map<string, InventoryCatalogFlags>> {
  const unique = [...new Set(skus.map((sku) => String(sku).trim()).filter(Boolean))];
  const map = new Map<string, InventoryCatalogFlags>();
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const flags = await fetchInventoryCatalogFlagsChunk(chunk);
    for (const [sku, value] of Object.entries(flags)) {
      map.set(sku, value);
    }
  }
  return map;
}

export function collectSkusFromInventorySessions(sessions: InventorySession[]): string[] {
  const skus = new Set<string>();
  for (const session of sessions) {
    for (const item of session.items ?? []) {
      const sku = String((item as { sku?: string }).sku ?? '').trim();
      if (sku) skus.add(sku);
    }
  }
  return [...skus];
}

export function enrichInventoryItemWithCatalogFlags<T extends { sku: string; isOutdated?: boolean; doNotPublish?: boolean }>(
  item: T,
  flagsBySku: Map<string, InventoryCatalogFlags>,
): T {
  const sku = String(item.sku ?? '').trim();
  const flags = flagsBySku.get(sku);
  if (!flags) return item;
  return {
    ...item,
    isOutdated: Boolean(item.isOutdated || flags.isOutdated),
    doNotPublish: Boolean(item.doNotPublish || flags.doNotPublish),
  };
}

export async function enrichInventorySessionsWithCatalogFlags(
  sessions: InventorySession[],
): Promise<InventorySession[]> {
  if (sessions.length === 0) return sessions;
  const flagsBySku = await fetchInventoryCatalogFlagsBySkus(collectSkusFromInventorySessions(sessions));
  if (flagsBySku.size === 0) return sessions;

  return sessions.map((session) => ({
    ...session,
    items: (session.items ?? []).map((item) =>
      enrichInventoryItemWithCatalogFlags(item as { sku: string; isOutdated?: boolean; doNotPublish?: boolean }, flagsBySku),
    ),
  }));
}
