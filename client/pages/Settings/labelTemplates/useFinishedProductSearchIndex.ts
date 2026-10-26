import { useEffect, useState } from 'react';
import { isWarehouseProductArchived } from '@shared/types/warehouseProductSearch';

export type FinishedProductSearchHit = {
  id: string;
  name: string;
  sku: string | null;
};

let cachedIndex: FinishedProductSearchHit[] | null = null;
let loadPromise: Promise<FinishedProductSearchHit[]> | null = null;

async function fetchIndex(): Promise<FinishedProductSearchHit[]> {
  if (cachedIndex) return cachedIndex;
  if (loadPromise) return loadPromise;
  loadPromise = fetch('/api/catalog/warehouse-search-index', { credentials: 'include' })
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok || !json?.success || !Array.isArray(json.data)) return [];
      return json.data
        .filter(
          (row: {
            delMark?: boolean;
            isOutdated?: boolean;
            parentName?: string | null;
          }) =>
            !isWarehouseProductArchived({
              delMark: Boolean(row.delMark),
              isOutdated: Boolean(row.isOutdated),
              parentName: row.parentName ?? null,
            }),
        )
        .map((row: { catalogGoodId: string; name: string; sku: string }) => ({
          id: String(row.catalogGoodId),
          name: String(row.name ?? ''),
          sku: row.sku ? String(row.sku) : null,
        }));
    })
    .then((rows) => {
      cachedIndex = rows;
      return rows;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

export function useFinishedProductSearchIndex(): {
  index: FinishedProductSearchHit[];
  loading: boolean;
} {
  const [index, setIndex] = useState<FinishedProductSearchHit[]>(cachedIndex ?? []);
  const [loading, setLoading] = useState(!cachedIndex);

  useEffect(() => {
    void fetchIndex()
      .then(setIndex)
      .finally(() => setLoading(false));
  }, []);

  return { index, loading };
}

export function filterFinishedProductIndex(
  index: FinishedProductSearchHit[],
  query: string,
  limit = 40,
): FinishedProductSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = index.filter((row) => {
    if (row.sku?.toLowerCase().includes(q)) return true;
    if (row.name.toLowerCase().includes(q)) return true;
    return false;
  });
  return hits.slice(0, limit);
}
