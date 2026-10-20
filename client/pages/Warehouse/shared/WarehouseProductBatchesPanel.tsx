/**
 * Shared wrapper around release batches UI for single-SKU movement lines.
 * Release-specific correction modes stay in ReleaseComponentBatchesPanel.
 */
import { useEffect, useState } from 'react';
import ReleaseComponentBatchesPanel from '../WarehouseReleaseSets/components/ReleaseComponentBatchesPanel';
import type { ReleaseComponentAllocation, ReleaseComponentBatch } from '@shared/types/warehouseRelease';

interface Props {
  sku: string;
  name: string;
  batches: ReleaseComponentBatch[];
  onChange: (batches: ReleaseComponentBatch[]) => void;
  selectedDateTime?: Date | null;
  storageId?: string | null;
  storageName?: string | null;
  className?: string;
  onRemove?: () => void;
  portionsPerBox?: number | null;
  stockAtStorage?: number | null;
  onPortionsPerBoxResolved?: (value: number) => void;
  overlayZClassName?: string;
  batchPickerShouldBlockScroll?: boolean;
}

export default function WarehouseProductBatchesPanel({
  sku,
  name,
  batches,
  onChange,
  selectedDateTime,
  storageId,
  storageName,
  className,
  onRemove,
  portionsPerBox,
  stockAtStorage,
  onPortionsPerBoxResolved,
  overlayZClassName,
  batchPickerShouldBlockScroll,
}: Props) {
  const [resolvedPortionsPerBox, setResolvedPortionsPerBox] = useState(
    portionsPerBox != null && portionsPerBox > 0 ? portionsPerBox : 1,
  );
  const [catalogStockGp, setCatalogStockGp] = useState<number | null>(null);
  const [catalogStockMs, setCatalogStockMs] = useState<number | null>(null);

  useEffect(() => {
    if (portionsPerBox != null && portionsPerBox > 1) {
      setResolvedPortionsPerBox(portionsPerBox);
    }
  }, [portionsPerBox]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = `/api/products/batch?skus=${encodeURIComponent(sku)}&fields=portionsPerBox`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return;
        const json = await response.json().catch(() => null) as {
          products?: Array<{ sku?: string; portionsPerBox?: number }>;
        } | null;
        const product = json?.products?.find((row) => String(row.sku) === sku) ?? json?.products?.[0];
        const next = Number(product?.portionsPerBox ?? NaN);
        if (cancelled || !Number.isFinite(next) || next <= 0) return;
        setResolvedPortionsPerBox(next);
        onPortionsPerBoxResolved?.(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- лише при зміні SKU
  }, [sku]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
        url.searchParams.set('skus', sku);
        if (selectedDateTime) {
          url.searchParams.set('asOfDate', selectedDateTime.toISOString());
        }
        const response = await fetch(url.pathname + url.search, { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as {
          stocks?: Record<string, { mainStock?: number; smallStock?: number }>;
        } | null;
        const row = data?.stocks?.[sku];
        if (cancelled || !row) return;
        setCatalogStockGp(Number(row.mainStock) || 0);
        setCatalogStockMs(Number(row.smallStock) || 0);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sku, selectedDateTime]);

  const components = [
    {
      sku,
      name,
      requiredQuantity: 0,
      portionsPerBox: resolvedPortionsPerBox,
      catalogStockAtStorage: stockAtStorage ?? null,
      catalogStockGp,
      catalogStockMs,
    },
  ];

  const componentBatches: ReleaseComponentAllocation[] = [{ sku, batches }];

  return (
    <div className={className}>
      <ReleaseComponentBatchesPanel
        components={components}
        componentBatches={componentBatches}
        onChange={(next) => {
          const row = next.find((entry) => entry.sku === sku);
          onChange(row?.batches ?? []);
        }}
        selectedDateTime={selectedDateTime}
        storageId={storageId}
        storageName={storageName}
        showSectionHeading={false}
        freeQuantityMode
        wrapInCard={false}
        operationKey="goodUnKit"
        onRemoveComponent={onRemove ? () => onRemove() : undefined}
        overlayZClassName={overlayZClassName}
        batchPickerShouldBlockScroll={batchPickerShouldBlockScroll}
      />
    </div>
  );
}
