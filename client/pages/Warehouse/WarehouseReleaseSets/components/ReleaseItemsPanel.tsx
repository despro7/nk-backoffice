import { useMemo, useEffect, useState } from 'react';
import { Card } from '@heroui/react';
import { HistoryItemsTable, type HistoryItemsTableColumn } from '../../shared/HistoryItemsTable';
import type { ReleaseSetsOperationKey } from '../useReleaseSets';
import ReleaseComponentBatchesPanel from './ReleaseComponentBatchesPanel';
import type { ReleaseComponentAllocation, ReleasePreviewComponent } from '@shared/types/warehouseRelease';

function getBomPerSetQuantity(items: any[], sku: string): number | undefined {
  for (const item of items) {
    const components = Array.isArray(item.componentsSnapshot) ? item.componentsSnapshot : [];
    for (const component of components) {
      const componentSku = String(component.id ?? component.sku ?? component.code ?? '').trim();
      if (componentSku !== sku) continue;
      const quantity = Number(component.quantity ?? component.qty ?? NaN);
      if (Number.isFinite(quantity) && quantity > 0) return quantity;
    }
  }
  return undefined;
}

interface Props {
  items: any[];
  selectedStorage?: string | null;
  selectedStorageName?: string | null;
  smallStorageId?: string | null;
  returns?: any;
  summaryLabel?: string;
  emptyMessage?: string;
  operationKey?: ReleaseSetsOperationKey;
  componentBatches?: ReleaseComponentAllocation[];
  onComponentBatchesChange?: (next: ReleaseComponentAllocation[]) => void;
  previewComponents?: ReleasePreviewComponent[];
  lastKitPrefillInfo?: { releaseId: number | null; dilovodDocId: string | null } | null;
  correctionMode?: boolean;
  correctionStep?: number | null;
  onFillAllBatches?: () => void;
}

export default function ReleaseItemsPanel({
  items,
  selectedStorage,
  selectedStorageName,
  smallStorageId,
  returns,
  summaryLabel = 'до списання з',
  emptyMessage = 'Немає компонентів для списання',
  operationKey = 'goodKit',
  componentBatches = [],
  onComponentBatchesChange,
  previewComponents = [],
  lastKitPrefillInfo = null,
  correctionMode = false,
  correctionStep = null,
  onFillAllBatches,
}: Props) {
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const [portionsPerBoxMap, setPortionsPerBoxMap] = useState<Record<string, number>>({});
  const [aggregatedServer, setAggregatedServer] = useState<Record<string, { name?: string; sku: string; total: number; perSet?: number }> | null>(null);
  const [storageQtyMap, setStorageQtyMap] = useState<Record<string, number | null>>({});
  const [aggLoading, setAggLoading] = useState(false);

  const formatLocalDate = (date: Date): string => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const parseLocalDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    const trimmed = value.trim();
    const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
    if (localMatch) {
      const [, year, month, day, hours, minutes, seconds] = localMatch;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds ?? '0'),
      );
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getPayloadDate = (): string | null => {
    const parsed = parseLocalDate(returns?.returnDate);
    return parsed ? formatLocalDate(parsed) : null;
  };

  if (!items || items.length === 0) return null;

  // Fetch missing component names from server when needed
  useEffect(() => {
    // SKUs where we need to fetch names (only missing names)
    const nameNeededSkus = new Set<string>();
    for (const it of items) {
      const comps = Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot : [];
      for (const c of comps) {
        const compSku = String(c.id ?? c.sku ?? c.code ?? (c['id'] ?? c['sku'] ?? '')).trim();
        if (!compSku) continue;
        if (!c.name) nameNeededSkus.add(compSku);
      }
    }

    const skus = Array.from(nameNeededSkus);
    if (skus.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        // Normalize and chunk SKUs to avoid too-long GET URLs.
        const normalized = Array.from(new Set(skus.map(s => String(s).trim())));
        const chunkSize = 50;
        const allProducts: any[] = [];

        const chunks: string[][] = [];
        for (let i = 0; i < normalized.length; i += chunkSize) chunks.push(normalized.slice(i, i + chunkSize));

        await Promise.all(chunks.map(async (chunk) => {
          const res = await fetch(`/api/products/batch?skus=${encodeURIComponent(chunk.join(','))}&fields=name`, { credentials: 'include' });
          if (!res.ok) return;
          const json = await res.json().catch(() => null);
          if (!json) return;
          const list = json?.products || [];
          allProducts.push(...list);
        }));

        const map: Record<string, string> = {};
        for (const p of allProducts) {
          if (p && p.sku && p.name) {
            map[String(p.sku).trim()] = p.name;
          }
        }

        if (!cancelled) {
          setNamesMap((prev) => ({ ...prev, ...map }));
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    const skus = new Set<string>();
    for (const component of previewComponents) {
      if (component.sku) skus.add(component.sku);
    }
    for (const it of items) {
      const comps = Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot : [];
      for (const c of comps) {
        const compSku = String(c.id ?? c.sku ?? c.code ?? '').trim();
        if (compSku) skus.add(compSku);
      }
    }

    const normalized = Array.from(skus).sort();
    if (normalized.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const chunkSize = 50;
        const map: Record<string, number> = {};

        for (let i = 0; i < normalized.length; i += chunkSize) {
          const chunk = normalized.slice(i, i + chunkSize);
          const res = await fetch(
            `/api/products/batch?skus=${encodeURIComponent(chunk.join(','))}&fields=portionsPerBox`,
            { credentials: 'include' },
          );
          if (!res.ok) continue;
          const json = await res.json().catch(() => null);
          const list = Array.isArray(json?.products) ? json.products : [];
          for (const product of list) {
            const sku = String(product?.sku ?? '').trim();
            const portionsPerBox = Number(product?.portionsPerBox ?? NaN);
            if (!sku || !Number.isFinite(portionsPerBox) || portionsPerBox <= 0) continue;
            map[sku] = portionsPerBox;
          }
        }

        if (!cancelled) {
          setPortionsPerBoxMap((prev) => ({ ...prev, ...map }));
        }
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [items, previewComponents]);

  // Compute aggregated totals per component SKU across all selected sets
  const aggregated = useMemo(() => {
    // Prefer server-side aggregated result if available
    if (aggregatedServer) return aggregatedServer;

    const map: Record<string, { name?: string; sku: string; total: number; perSet?: number }> = {};
    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const comps = Array.isArray(it.componentsSnapshot) ? it.componentsSnapshot : [];
      for (const c of comps) {
        const compSku = String(c.id ?? c.sku ?? c.code ?? (c["id"] ?? c["sku"] ?? '')).trim();
        if (!compSku) continue;
        const perSet = Number(c.quantity ?? c.qty ?? 1);
        const add = perSet * qty;
        const nameFallback = c.name || c.title || undefined;
        if (!map[compSku]) map[compSku] = { name: nameFallback, sku: compSku, total: 0, perSet };
        map[compSku].total += add;
      }
    }
    return map;
  }, [items, /* include namesMap to update aggregates when names are fetched */ namesMap, aggregatedServer]);

  const aggregatedRows = useMemo(() => {
    return Object.values(aggregated)
      .map((row) => ({
        ...row,
        storageQty: storageQtyMap[row.sku] ?? null,
      }))
      .sort((a, b) => String(a.name || namesMap[a.sku] || a.sku).localeCompare(String(b.name || namesMap[b.sku] || b.sku), 'uk'));
  }, [aggregated, namesMap, storageQtyMap]);

  const aggregatedSkuSignature = useMemo(() => {
    return Object.keys(aggregated).sort().join('|');
  }, [aggregated]);

  const totalToRelease = useMemo(() => {
    return aggregatedRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  }, [aggregatedRows]);

  useEffect(() => {
    let cancelled = false;
    const skus = Object.keys(aggregated).sort();
    if (skus.length === 0) {
      return;
    }

    const storageId = selectedStorage ?? smallStorageId ?? undefined;
    const timer = setTimeout(async () => {
      try {
        const skusParam = skus.join(',');
        const firmId = returns?.receiveFirmId ?? undefined;
        const parsedAsOfDate = parseLocalDate(returns?.operDate ?? returns?.returnDate);
        const asOfDate = parsedAsOfDate ? parsedAsOfDate.toISOString() : undefined;
        const encodedLen =
          encodeURIComponent(skusParam).length +
          (firmId ? encodeURIComponent(String(firmId)).length : 0) +
          (asOfDate ? encodeURIComponent(asOfDate).length : 0) +
          (storageId ? encodeURIComponent(storageId).length : 0);

        let response: Response;
        if (encodedLen > 2000) {
          response = await fetch('/api/warehouse/stock-snapshot', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus, firmId, asOfDate, storageId }),
          });
        } else {
          const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
          url.searchParams.set('skus', skusParam);
          if (firmId) url.searchParams.set('firmId', String(firmId));
          if (asOfDate) url.searchParams.set('asOfDate', asOfDate);
          if (storageId) url.searchParams.set('storageId', storageId);
          response = await fetch(url.toString(), { credentials: 'include' });
        }

        if (!response.ok) return;

        const json = await response.json().catch(() => null);
        if (!json || !json.success || typeof json.stocks !== 'object' || json.stocks == null) return;

        const freshMap: Record<string, number> = {};
        for (const sku of skus) {
          if (Object.prototype.hasOwnProperty.call(json.stocks, sku)) {
            const stock = json.stocks[sku];
            if (storageId) {
              freshMap[sku] = Number(stock?.selectedStock ?? 0);
            } else {
              freshMap[sku] = Number(stock?.smallStock ?? 0);
            }
          }
        }

        if (!cancelled) setStorageQtyMap(freshMap);
      } catch {
        // Keep the previous values on transient errors to avoid flicker during HMR/re-renders.
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aggregatedSkuSignature, selectedStorage, smallStorageId, returns?.receiveFirmId, returns?.operDate, returns?.returnDate]);

  const stockColumnLabel = selectedStorageName
    ? `Залишки ${selectedStorageName}`
    : 'Залишки складу';

  const batchPanelComponents = useMemo(() => {
    const activeSetQuantity = Number(items[0]?.quantity ?? 1);

    if (previewComponents.length > 0) {
      return previewComponents.map((component) => {
        const perSetQuantity = getBomPerSetQuantity(items, component.sku)
          ?? aggregated[component.sku]?.perSet
          ?? Number(component.quantity ?? 0);
        const localRequired = perSetQuantity * activeSetQuantity;
        const previewRequired = Number(component.quantity ?? 0);
        const requiredQuantity = localRequired > 0 ? localRequired : previewRequired;
        return {
          sku: component.sku,
          name: component.name,
          requiredQuantity,
          perSetQuantity,
          portionsPerBox: portionsPerBoxMap[component.sku] ?? null,
        };
      });
    }

    return Object.values(aggregated).map((row) => ({
      sku: row.sku,
      name: row.name || namesMap[row.sku] || row.sku,
      requiredQuantity: Number(row.total ?? 0),
      perSetQuantity: Number(row.perSet ?? 1),
      portionsPerBox: portionsPerBoxMap[row.sku] ?? null,
    }));
  }, [previewComponents, aggregated, namesMap, portionsPerBoxMap, items]);

  const summaryColumns: HistoryItemsTableColumn[] = [
    {
      key: 'sku',
      label: 'SKU',
      render: (item) => <span className="font-mono">{item.sku}</span>,
      sortValue: (item) => item.sku,
      sortType: 'text',
    },
    {
      key: 'name',
      label: 'Позиція',
      render: (item) => item.name || namesMap[item.sku] || item.sku,
      sortValue: (item) => item.name || namesMap[item.sku] || item.sku,
      sortType: 'text',
    },
    {
      key: 'storageQty',
      label: stockColumnLabel,
      render: (item: any) => {
        const currentQty = item.storageQty;
        const movementQty = Number(item.total ?? 0);
        const afterReleaseQty = currentQty == null
          ? null
          : operationKey === 'goodUnKit'
            ? Number(currentQty) + movementQty
            : Math.max(0, Number(currentQty) - movementQty);
        const shortageQty = operationKey === 'goodKit' && currentQty != null
          ? Math.max(0, movementQty - Number(currentQty))
          : 0;

        return (
          <span className="inline-flex items-center gap-1 font-semibold">
            <span>{currentQty == null ? '—' : currentQty}</span>
            <span className="text-gray-400">-&gt;</span>
            <span className={
              afterReleaseQty != null && currentQty != null
                ? (afterReleaseQty > currentQty ? 'text-green-700' : afterReleaseQty < currentQty ? 'text-red-700' : 'text-gray-700')
                : 'text-gray-700'
            }>
              {afterReleaseQty == null ? '—' : afterReleaseQty}
            </span>
            {shortageQty > 0 && (
              <span className="ml-2 rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">
                Не вистачає {shortageQty} шт.
              </span>
            )}
          </span>
        );
      },
      sortValue: (item: any) => Number(item.storageQty ?? -1),
      sortType: 'number',
      className: 'text-center font-semibold',
      headerClassName: 'text-center',
      align: 'center',
    },
    {
      key: 'batches',
      label: 'Партія',
      render: (item: any) => {
        const allocation = componentBatches.find((entry) => entry.sku === item.sku);
        const batches = allocation?.batches ?? [];
        if (batches.length === 0) return <span className="text-xs text-gray-400">—</span>;
        return (
          <div className="space-y-1 text-xs text-gray-700">
            {batches.map((batch, index) => (
              <div key={`${item.sku}-${batch.batchId}-${index}`}>
                {batch.batchNumber || batch.batchId} ({batch.quantity})
              </div>
            ))}
          </div>
        );
      },
      sortValue: (item: any) => {
        const allocation = componentBatches.find((entry) => entry.sku === item.sku);
        return allocation?.batches?.length ?? 0;
      },
      sortType: 'number',
      className: 'text-left',
      headerClassName: 'text-left',
    },
    {
      key: 'total',
      label: operationKey === 'goodUnKit' ? 'До повернення' : 'До списання',
      render: (item: any) => Number(item.total ?? 0),
      sortValue: (item: any) => Number(item.total ?? 0),
      sortType: 'number',
      className: 'text-center font-semibold text-gray-900',
      headerClassName: 'text-center',
      align: 'center',
    },
  ];

  // Fetch server-side aggregated preview (recursive) when items change
  useEffect(() => {
    let cancelled = false;
    const shouldCall = Array.isArray(items) && items.length > 0;
    if (!shouldCall) {
      setAggregatedServer(null);
      return;
    }

    const timer = setTimeout(async () => {
      setAggLoading(true);
      try {
        const body = { items: items.map((it) => ({ set_sku: it.setSku, quantity: it.quantity })) };
        const resp = await fetch('/api/warehouse/releases/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp.ok) return;
        const json = await resp.json().catch(() => null);
        if (!json || !json.success || !Array.isArray(json.data)) return;
        const map: Record<string, { name?: string; sku: string; total: number; perSet?: number }> = {};
        for (const c of json.data) {
          if (!c || !c.sku) continue;
          const total = Number(c.quantity || 0);
          map[c.sku] = {
            name: c.name || undefined,
            sku: c.sku,
            total,
            perSet: getBomPerSetQuantity(items, c.sku) ?? total,
          };
        }
        if (!cancelled) setAggregatedServer(map);
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setAggLoading(false);
      }
    }, 200);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [items]);

  return (
    <>
    {operationKey === 'goodUnKit' && lastKitPrefillInfo?.releaseId && (
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Партії підставлено з останнього комплектування №{lastKitPrefillInfo.releaseId}
        {lastKitPrefillInfo.dilovodDocId ? ` (Dilovod ${lastKitPrefillInfo.dilovodDocId})` : ''}.
      </div>
    )}

    {onComponentBatchesChange && batchPanelComponents.length > 0 && (
      <ReleaseComponentBatchesPanel
        components={batchPanelComponents}
        componentBatches={componentBatches}
        onChange={onComponentBatchesChange}
        selectedDateTime={parseLocalDate(returns?.operDate ?? returns?.returnDate)}
        firmId={returns?.receiveFirmId}
        storageId={selectedStorage ?? smallStorageId ?? null}
        storageName={selectedStorageName}
        operationKey={operationKey}
        correctionMode={correctionMode}
        correctionStep={correctionStep}
        onFillAllBatches={onFillAllBatches}
      />
    )}

    {/* Aggregated totals across all sets */}
    <h3 className="text-lg font-medium mb-2">
      Сумарно {summaryLabel} {selectedStorageName ?? selectedStorage ?? 'не вказано'} – {totalToRelease} шт.
      {aggLoading && <span className="text-sm font-normal text-gray-500"> • оновлюємо залишки складу...</span>}
    </h3>
    <Card className="rounded-lg border border-gray-200 bg-white p-1 mb-6">
      {aggregatedRows.length === 0 ? (
        <div className="text-sm text-gray-500 p-3">{emptyMessage}</div>
      ) : (
        <HistoryItemsTable
          items={aggregatedRows}
          columns={summaryColumns}
          footerTotals={{ total: totalToRelease }}
        />
      )}
    </Card>
		</>
  );
}
