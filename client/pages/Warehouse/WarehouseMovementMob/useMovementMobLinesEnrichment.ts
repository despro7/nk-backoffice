import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type {
  MovementMobLineEnrichmentMeta,
  MovementMobProductLineViewModel,
} from './WarehouseMovementMobTypes';
import {
  batchNumberNeedsResolution,
  enrichMovementMobLines,
  effectiveBatchId,
  movementMobEnrichmentLineKey,
  resolveBatchDisplayName,
  type MovementMobSkuStockTotals,
} from './WarehouseMovementMobUtils';
import { fetchBatchNumbersBulk } from './movementMobApi';
import type { MovementMobBatchRow } from './WarehouseMovementMobUtils';

interface CatalogBatchLine {
  sku: string;
  batchId?: string;
  batchNumber?: string;
  barcode?: string;
}

interface CatalogBatchEnrichment {
  names: Record<string, string>;
  lineMeta: Record<string, MovementMobLineEnrichmentMeta>;
}

async function fetchCatalogBatchEnrichment(
  apiCall: (url: string, options?: RequestInit) => Promise<Response>,
  batchIds: string[],
  lines: CatalogBatchLine[],
): Promise<CatalogBatchEnrichment> {
  const response = await apiCall('/api/warehouse/resolve-batch-names', {
    method: 'POST',
    body: JSON.stringify({
      batchIds,
      lines: lines.map((line) => ({
        sku: line.sku,
        batchId: line.batchId ?? '',
        batchNumber: line.batchNumber ?? '',
        barcode: line.barcode ?? '',
      })),
    }),
  });
  if (!response.ok) {
    return { names: {}, lineMeta: {} };
  }
  const data = (await response.json().catch(() => null)) as {
    names?: Record<string, string>;
    lineMeta?: Record<string, MovementMobLineEnrichmentMeta>;
  } | null;
  return {
    names: data?.names ?? {},
    lineMeta: data?.lineMeta ?? {},
  };
}

async function fetchStockTotalsBySku(
  apiCall: (url: string, options?: RequestInit) => Promise<Response>,
  skus: string[],
): Promise<Record<string, MovementMobSkuStockTotals>> {
  if (skus.length === 0) return {};
  const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
  url.searchParams.set('skus', skus.join(','));
  const response = await apiCall(url.pathname + url.search);
  if (!response.ok) return {};

  const data = (await response.json().catch(() => null)) as {
    stocks?: Record<string, { mainStock?: number; smallStock?: number }>;
  } | null;

  const totals: Record<string, MovementMobSkuStockTotals> = {};
  for (const sku of skus) {
    const stock = data?.stocks?.[sku];
    if (!stock) continue;
    totals[sku] = {
      totalGp: Number(stock.mainStock) || 0,
      totalMs: Number(stock.smallStock) || 0,
    };
  }
  return totals;
}

function applyCatalogNames(
  lines: MovementMobProductLineViewModel[],
  catalogNames: Record<string, string>,
  lineMeta: Record<string, MovementMobLineEnrichmentMeta>,
  metaKeyByLineKey: Record<string, string>,
): MovementMobProductLineViewModel[] {
  if (Object.keys(catalogNames).length === 0 && Object.keys(lineMeta).length === 0) {
    return lines;
  }
  return lines.map((line) => {
    const metaKey = metaKeyByLineKey[line.key] ?? movementMobEnrichmentLineKey(line);
    const meta = lineMeta[metaKey];
    const batchLinked = meta?.batchLinked === true;
    if (!batchLinked) {
      return {
        ...line,
        batchLinked: false,
        batchNumber: '',
        catalogGoodId: meta?.catalogGoodId ?? line.catalogGoodId ?? null,
      };
    }

    const lookupId = effectiveBatchId(line.batchId, line.batchNumber);
    const label = (line.batchNumber || '').trim();
    const catalogName =
      catalogNames[metaKey]
      || catalogNames[lookupId]
      || catalogNames[`${line.sku}::${lookupId}`]
      || (label ? catalogNames[`${line.sku}::${label}`] : undefined);

    if (!catalogName || !batchNumberNeedsResolution(line.batchNumber, lookupId)) {
      return {
        ...line,
        batchLinked: true,
        catalogGoodId: meta?.catalogGoodId ?? line.catalogGoodId ?? null,
      };
    }
    return {
      ...line,
      batchLinked: true,
      batchNumber: catalogName,
      catalogGoodId: meta?.catalogGoodId ?? line.catalogGoodId ?? null,
    };
  });
}

/** Ключі React Query для enrichment рядків документа переміщення (mob). */
export const movementMobEnrichmentQueryKeys = {
  stock: (sortedSkusKey: string) => ['warehouse-movement-mob-stock', sortedSkusKey] as const,
  batches: (sortedSkusKey: string) => ['warehouse-movement-mob-batches', sortedSkusKey] as const,
  catalog: (lineKeys: string, sortedSkusKey: string) =>
    ['warehouse-movement-mob-catalog', lineKeys, sortedSkusKey] as const,
};

/** Після зміни привʼязки ШК→партія в каталозі — оновити meta рядків (batchLinked, назва). */
export function invalidateMovementMobLineEnrichment(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['warehouse-movement-mob-catalog'] });
}

export function useMovementMobLinesEnrichment(
  lines: MovementMobProductLineViewModel[],
) {
  const { apiCall } = useApi();
  const skus = useMemo(
    () => [...new Set(lines.map((line) => line.sku).filter(Boolean))],
    [lines],
  );
  const sortedSkusKey = useMemo(
    () => [...skus].sort().join(','),
    [skus],
  );
  const lineKeys = useMemo(
    () => lines.map((line) => movementMobEnrichmentLineKey(line)).join('|'),
    [lines],
  );
  const metaKeyByLineKey = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.key, movementMobEnrichmentLineKey(line)])),
    [lines],
  );

  const stockQuery = useQuery({
    queryKey: movementMobEnrichmentQueryKeys.stock(sortedSkusKey),
    enabled: skus.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchStockTotalsBySku(apiCall, skus),
  });

  const batchesQuery = useQuery({
    queryKey: movementMobEnrichmentQueryKeys.batches(sortedSkusKey),
    enabled: skus.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchBatchNumbersBulk(apiCall, skus, {
      includeSmallStorage: true,
      skipExpiration: true,
    }),
  });

  const catalogQuery = useQuery({
    queryKey: movementMobEnrichmentQueryKeys.catalog(lineKeys, sortedSkusKey),
    enabled: skus.length > 0 && batchesQuery.isSuccess,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const batchesBySku = batchesQuery.data ?? {};
      const unresolvedIds = [...new Set(
        lines.flatMap((line) => {
          const lookupId = effectiveBatchId(line.batchId, line.batchNumber);
          const resolved = resolveBatchDisplayName(line.batchId, line.batchNumber, batchesBySku[line.sku] ?? []);
          if (!batchNumberNeedsResolution(resolved, lookupId)) return [];
          return lookupId ? [lookupId] : [];
        }),
      )];
      return fetchCatalogBatchEnrichment(
        apiCall,
        unresolvedIds,
        lines.map((line) => ({
          sku: line.sku,
          batchId: line.batchId,
          batchNumber: line.batchNumber,
          barcode: line.barcode,
        })),
      );
    },
  });

  const enrichedLines = useMemo(() => {
    const stockTotalsBySku = stockQuery.data ?? {};
    const batchesBySku = (batchesQuery.data ?? {}) as Record<string, MovementMobBatchRow[]>;
    const hasBatchData = Boolean(batchesQuery.data);
    const lineMeta = catalogQuery.data?.lineMeta;
    const base = enrichMovementMobLines(
      lines,
      batchesBySku,
      stockTotalsBySku,
      hasBatchData ? (lineMeta ?? {}) : undefined,
    );
    if (!hasBatchData || !catalogQuery.data) return base;
    return applyCatalogNames(
      base,
      catalogQuery.data.names,
      catalogQuery.data.lineMeta,
      metaKeyByLineKey,
    );
  }, [lines, stockQuery.data, batchesQuery.data, catalogQuery.data, metaKeyByLineKey]);

  const stockLoading = stockQuery.isLoading && !stockQuery.data;
  const stockRefreshing = stockQuery.isFetching && Boolean(stockQuery.data);
  const batchLoading = batchesQuery.isLoading && !batchesQuery.data;
  const batchRefreshing = batchesQuery.isFetching && Boolean(batchesQuery.data);
  const catalogLoading = catalogQuery.isLoading && !catalogQuery.data && batchesQuery.isSuccess;

  return {
    lines: enrichedLines,
    stockLoading,
    stockRefreshing,
    batchLoading: batchLoading || catalogLoading,
    batchRefreshing: batchRefreshing || (catalogQuery.isFetching && Boolean(catalogQuery.data)),
    loading: stockLoading || batchLoading || catalogLoading,
    refreshing: stockRefreshing || batchRefreshing,
  };
}
