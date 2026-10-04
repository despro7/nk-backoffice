import React, { useState, useRef, useEffect } from 'react';
import { Input, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ReleaseSetItem, ReleaseSetsOperationKey } from '../useReleaseSets';
import { isRebatchSku } from '@shared/types/warehouseRelease';
import { StepperInput } from '../../shared/StepperInput';

const parseStockBalance = (rawStock: unknown): Record<string, number> => {
  if (!rawStock) return {};

  if (typeof rawStock === 'string') {
    try {
      const parsed = JSON.parse(rawStock) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, Number(value) || 0]),
      );
    } catch {
      return {};
    }
  }

  if (typeof rawStock === 'object') {
    return Object.fromEntries(
      Object.entries(rawStock as Record<string, unknown>).map(([key, value]) => [key, Number(value) || 0]),
    );
  }

  return {};
};

const extractStockForStorage = (rawStock: unknown, storageId?: string | null): number => {
  const stockMap = parseStockBalance(rawStock);
  if (storageId) {
    return Number(stockMap[storageId] ?? 0);
  }

  return Object.values(stockMap).reduce((sum, value) => sum + value, 0);
};

interface Props {
  onSelect: (product: any) => void;
  onItemChange?: (id: string, patch: Partial<ReleaseSetItem>) => void;
  onItemRemove?: (id: string) => void;
  existingItems?: ReleaseSetItem[];
  resetSignal?: number;
  operationKey?: ReleaseSetsOperationKey;
  correctionMode?: boolean;
  selectedStorage?: string | null;
  defaultSmallStorageId?: string | null;
  showAvailableQuantity?: boolean;
}

export default function SetSearchPanel({
  onSelect,
  onItemChange,
  onItemRemove,
  existingItems = [],
  resetSignal,
  operationKey = 'goodKit',
  correctionMode = false,
  selectedStorage = null,
  defaultSmallStorageId = null,
  showAvailableQuantity = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedSet = existingItems[0] ?? null;
  const hasSelectedSet = Boolean(selectedSet);
  const activeStorageId = selectedStorage ?? defaultSmallStorageId ?? null;
  const isCorrectionProductStep = correctionMode && operationKey === 'goodKit';
  const isCorrectionUnkitStep = correctionMode && operationKey === 'goodUnKit';
  const quantityLockedByBatches = isCorrectionProductStep;
  const maxSetQuantity = showAvailableQuantity ? Number(selectedSet?.availableQuantity ?? 0) : 0;
  const canSetMaxQuantity = isCorrectionUnkitStep
    && Number.isFinite(maxSetQuantity)
    && maxSetQuantity > 0
    && Number(selectedSet?.quantity ?? 0) < maxSetQuantity;

  const withStorageQuantity = (product: any) => ({
    ...product,
    availableQuantity: extractStockForStorage(product.stockBalanceByStock, activeStorageId),
  });

  const searchProducts = async (searchQuery: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (isCorrectionUnkitStep) {
      const res = await fetch(
        `/api/warehouse/releases/batch-correction/search-sets?q=${encodeURIComponent(searchQuery)}`,
        {
          signal: abortRef.current.signal,
          credentials: 'include',
        },
      );
      const json = await res.json();
      const list = Array.isArray(json?.products) ? json.products : [];
      return list.map((product: any) => withStorageQuantity({
        ...product,
        set: Array.isArray(product.set) ? product.set : [],
      }));
    }

    const res = await fetch(`/api/products?search=${encodeURIComponent(searchQuery)}&limit=20`, {
      signal: abortRef.current.signal,
      credentials: 'include',
    });
    const json = await res.json();
    const list = json?.products || [];

    if (isCorrectionProductStep) {
      return list
        .filter((product: any) => !product.isGroup)
        .filter((product: any) => !isRebatchSku(product.sku))
        .map((product: any) => withStorageQuantity(product));
    }

    return list
      .map((product: any) => withStorageQuantity({
        ...product,
        set: product.set ? (typeof product.set === 'string' ? (() => { try { return JSON.parse(product.set); } catch { return null; } })() : product.set) : null,
      }))
      .filter((product: any) => Array.isArray(product.set) && product.set.length > 0);
  };

  useEffect(() => {
    if (typeof resetSignal !== 'undefined') {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    if (hasSelectedSet) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    if (!query || query.trim().length < 3) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    const handle = setTimeout(async () => {
      try {
        const products = await searchProducts(query);
        setResults(products);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { clearTimeout(handle); };
  }, [query, hasSelectedSet, correctionMode, operationKey, activeStorageId]);

  const addedSkus = (existingItems || []).map((item: any) => item.setSku || item.sku);
  const addedSet = new Set(addedSkus);
  const isAdded = (sku: string) => addedSet.has(sku);

  const placeholder = isCorrectionProductStep
    ? 'Пошук за назвою, SKU або штрихкодом'
    : isCorrectionUnkitStep
      ? 'Пошук інвентаризаційного набору за назвою або SKU (від 3 символів)'
      : 'Пошук набору за назвою або SKU (від 3 символів)';

  const emptyMessage = isCorrectionProductStep
    ? 'Товари не знайдено. Спробуйте іншу назву, SKU або штрихкод.'
    : isCorrectionUnkitStep
      ? 'Інвентаризаційні набори не знайдено. Спробуйте іншу назву або SKU (_rebatch).'
      : 'Набори не знайдено. Спробуйте іншу назву або SKU.';

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        size="lg"
        className="w-full"
        isClearable={true}
        isDisabled={hasSelectedSet}
        startContent={<DynamicIcon name="search" className="text-gray-400" size={18} />}
        classNames={{ inputWrapper: 'rounded-lg border border-gray-200 bg-white' }}
        onKeyDown={(event) => {
          if (hasSelectedSet) {
            event.preventDefault();
            return;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            void (async () => {
              setLoading(true);
              try {
                const products = await searchProducts(query);
                setResults(products);
              } catch {
                setResults([]);
              } finally {
                setLoading(false);
              }
            })();
          }
        }}
      />

      {hasSelectedSet && selectedSet && (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-medium text-gray-500">{isCorrectionProductStep ? 'Товар' : 'Набір'}</span>
              <div className="flex flex-col items-start">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{selectedSet.name}</span>
                  {showAvailableQuantity && (
                    <span className="text-[11px] font-semibold bg-lime-200 text-emerald-800 px-2 py-1 rounded-full">
                      Залишок {Number(selectedSet.availableQuantity ?? 0)} компл.
                    </span>
                  )}
                </span>
                <span className="text-xs font-normal text-gray-600 bg-amber-200/50 px-1 py-0.5 rounded">
                  SKU: {selectedSet.setSku}
                </span>
              </div>
            </div>

            <div className="flex items-end gap-3 shrink-0">
              {onItemChange && (
                <div className="flex items-end gap-2">
                  {canSetMaxQuantity && (
                    <button
                      type="button"
                      className="mb-1 text-xs font-medium uppercase tracking-wide text-fuchsia-700/80 bg-fuchsia-300/15 px-1.5 py-0.5 rounded hover:bg-fuchsia-300/25"
                      onClick={() => onItemChange(selectedSet.id, { quantity: maxSetQuantity })}
                    >
                      max
                    </button>
                  )}
                  <StepperInput
                    label="Кількість наборів"
                    value={Number(selectedSet.quantity ?? 0)}
                    onChange={(value: number) => onItemChange(selectedSet.id, { quantity: value })}
                    onIncrement={() => onItemChange(selectedSet.id, { quantity: Number(selectedSet.quantity ?? 0) + 1 })}
                    onDecrement={() => onItemChange(selectedSet.id, { quantity: Math.max(1, Number(selectedSet.quantity ?? 0) - 1) })}
                    onBlur={() => {
                      const raw = Number(selectedSet.quantity ?? 0);
                      const max = showAvailableQuantity ? Number(selectedSet.availableQuantity ?? 0) : undefined;
                      let next = Math.max(1, Number.isFinite(raw) ? raw : 1);
                      if (max !== undefined && Number.isFinite(max) && max > 0) {
                        next = Math.min(next, max);
                      }
                      if (next !== raw) {
                        onItemChange(selectedSet.id, { quantity: next });
                      }
                    }}
                    max={showAvailableQuantity ? Number(selectedSet.availableQuantity ?? 0) : undefined}
                    disabled={quantityLockedByBatches}
                    size="sm"
                    className="w-32"
                    labelClassName="text-xs font-medium self-start mb-1"
                  />
                </div>
              )}

              {onItemRemove && (
                <Button
                  color="danger"
                  variant="light"
                  className="min-w-0 p-3"
                  onPress={() => onItemRemove(selectedSet.id)}
                >
                  <DynamicIcon name="trash-2" className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && results.length === 0 && hasSearched && query.trim() !== '' && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          {emptyMessage}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((product: any) => (
            <Button
              key={product.id || product.sku}
              type="button"
              size="lg"
              color="primary"
              variant={isAdded(product.sku) || hasSelectedSet ? 'flat' : 'solid'}
              onPress={() => {
                if (isCorrectionProductStep) {
                  onSelect(product);
                  return;
                }
                const availableQty = Number(product.availableQuantity ?? 0);
                onSelect({
                  sku: product.sku,
                  name: product.name || product.title || product.displayName || product.sku,
                  quantity: isCorrectionUnkitStep && Number.isFinite(availableQty) && availableQty > 0
                    ? availableQty
                    : 1,
                  componentsSnapshot: product.set,
                  availableQuantity: product.availableQuantity,
                  sourceSku: isCorrectionUnkitStep
                    ? String(product.set?.[0]?.id ?? product.set?.[0]?.sku ?? '').trim() || null
                    : undefined,
                  isCorrectionSet: isCorrectionUnkitStep ? true : undefined,
                });
              }}
              isDisabled={isAdded(product.sku) || hasSelectedSet}
              className={`h-auto w-full items-stretch justify-start rounded-lg border border-gray-200 px-4 py-3 text-left ${(isAdded(product.sku) || hasSelectedSet) ? 'bg-gray-100 opacity-40' : 'bg-white'}`}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex-1 text-left">
                  <div className="text-md font-semibold text-gray-900">
                    {product.name || product.title || product.displayName}
                    <span className="ml-1 rounded bg-gray-200/50 px-1 py-0.5 text-sm font-normal text-gray-400">SKU: {product.sku || product.code || product.id}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {isCorrectionProductStep
                      ? 'Товар для коригування партійного обліку'
                      : isCorrectionUnkitStep
                        ? 'Інвентаризаційний набір для розукомплектування'
                        : `Компонентів: ${Array.isArray(product.set) ? product.set.length : 0}`}
                  </div>
                </div>
                {Number(product.availableQuantity ?? 0) > 0 && (
                  <span className="text-xs font-semibold bg-lime-200 text-emerald-800 px-4 py-2 rounded-sm">
                    В наявності {Number(product.availableQuantity ?? 0)} {isCorrectionProductStep ? 'пор.' : 'компл.'}
                  </span>
                )}
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
