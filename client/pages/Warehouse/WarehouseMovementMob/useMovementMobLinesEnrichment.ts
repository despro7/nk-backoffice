import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { fetchBatchNumbersBySku } from './movementMobApi';

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

/** Послідовні запити до Dilovod — уникаємо multithreadApiSession при паралельних викликах. */
async function fetchBatchesBySkuSequential(
  apiCall: (url: string, options?: RequestInit) => Promise<Response>,
  skus: string[],
): Promise<Record<string, Awaited<ReturnType<typeof fetchBatchNumbersBySku>>>> {
  const batchesBySku: Record<string, Awaited<ReturnType<typeof fetchBatchNumbersBySku>>> = {};
  for (const sku of skus) {
    let batches = await fetchBatchNumbersBySku(apiCall, sku, {
      includeSmallStorage: true,
    });
    if (batches.length === 0) {
      batches = await fetchBatchNumbersBySku(apiCall, sku, {
        includeSmallStorage: true,
        force: true,
      });
    }
    batchesBySku[sku] = batches;
  }
  return batchesBySku;
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

export function useMovementMobLinesEnrichment(
  lines: MovementMobProductLineViewModel[],
) {
  const { apiCall } = useApi();
  const skus = useMemo(
    () => [...new Set(lines.map((line) => line.sku).filter(Boolean))],
    [lines],
  );
  const lineKeys = useMemo(
    () => lines.map((line) => movementMobEnrichmentLineKey(line)).join('|'),
    [lines],
  );
  const metaKeyByLineKey = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.key, movementMobEnrichmentLineKey(line)])),
    [lines],
  );

  const query = useQuery({
    queryKey: ['warehouse-movement-mob-line-enrichment', skus, lineKeys],
    enabled: skus.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const [stockTotalsBySku, batchesBySku] = await Promise.all([
        fetchStockTotalsBySku(apiCall, skus),
        fetchBatchesBySkuSequential(apiCall, skus),
      ]);

      const unresolvedIds = [...new Set(
        lines.flatMap((line) => {
          const lookupId = effectiveBatchId(line.batchId, line.batchNumber);
          const resolved = resolveBatchDisplayName(line.batchId, line.batchNumber, batchesBySku[line.sku] ?? []);
          if (!batchNumberNeedsResolution(resolved, lookupId)) return [];
          return lookupId ? [lookupId] : [];
        }),
      )];
      const { names: catalogNames, lineMeta } = await fetchCatalogBatchEnrichment(
        apiCall,
        unresolvedIds,
        lines.map((line) => ({
          sku: line.sku,
          batchId: line.batchId,
          batchNumber: line.batchNumber,
          barcode: line.barcode,
        })),
      );

      return { batchesBySku, catalogNames, lineMeta, stockTotalsBySku };
    },
  });

  const enrichedLines = useMemo(() => {
    const hasEnrichment = Boolean(query.data);
    const stockTotalsBySku = query.data?.stockTotalsBySku ?? {};
    const lineMeta = query.data?.lineMeta;
    const base = enrichMovementMobLines(
      lines,
      query.data?.batchesBySku ?? {},
      stockTotalsBySku,
      hasEnrichment ? (lineMeta ?? {}) : undefined,
    );
    if (!hasEnrichment) return base;
    return applyCatalogNames(base, query.data?.catalogNames ?? {}, lineMeta ?? {}, metaKeyByLineKey);
  }, [lines, query.data, metaKeyByLineKey]);

  const enrichmentLoading = query.isLoading && !query.data;
  const enrichmentRefreshing = query.isFetching && Boolean(query.data);

  return {
    lines: enrichedLines,
    loading: enrichmentLoading,
    refreshing: enrichmentRefreshing,
  };
}
