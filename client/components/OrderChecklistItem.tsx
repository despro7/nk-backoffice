import { cn } from '@/lib/utils';
import { pluralize } from '@/lib/formatUtils';
import { useDebug } from '@/contexts/DebugContext';
import { Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from './modals/ConfirmModal';

// Simple in-memory cache to avoid refetching products while rendering nested sets
const productCache = new Map<string, any>();
const stockCache = new Map<string, number>();
const stockRequestsInFlight = new Map<string, Promise<number | null>>();

type CompositionComponent = {
  name: string;
  quantity?: number;
  unitRatio?: number;
  sku?: string;
};

const normalizeCompositionComponent = (component: any): CompositionComponent => {
  if (typeof component === 'string' || !component) {
    return { name: String(component) };
  }

  return {
    name: component.name || component.productName || component.title || `Товар ${component.sku || component.id || component.productId || component.product_id || ''}`,
    quantity: component.quantity,
    unitRatio: component.unitRatio,
    sku: component.sku || component.id || component.productId || component.product_id
  };
};

const getComponentLookupId = (component: any): string | undefined => component?.sku || component?.id || component?.productId || component?.product_id;

const extractStockTotal = (rawStock: unknown): number => {
  let total = 0;

  if (rawStock) {
    if (typeof rawStock === 'string') {
      try {
        const parsed = JSON.parse(rawStock);
        Object.values(parsed).forEach((value: any) => { total += Number(value) || 0; });
      } catch {
        // ignore malformed stock payloads
      }
    } else if (typeof rawStock === 'object') {
      Object.values(rawStock as Record<string, unknown>).forEach((value: unknown) => { total += Number(value) || 0; });
    }
  }

  return total;
};

const fetchProductBySku = async (sku: string): Promise<any | null> => {
  if (productCache.has(sku)) {
    return productCache.get(sku);
  }

  try {
    const res = await fetch(`/api/products/${sku}`);
    if (!res.ok) return null;
    const product = await res.json();
    productCache.set(sku, product);
    return product;
  } catch {
    return null;
  }
};

const calculateCompositionPortions = async (
  composition: any[],
  visitedSkus: Set<string> = new Set()
): Promise<number> => {
  let total = 0;

  for (const rawComponent of composition) {
    const component = normalizeCompositionComponent(rawComponent);
    const componentQuantity = Number.isFinite(Number(component.quantity)) && Number(component.quantity) > 0
      ? Number(component.quantity)
      : 1;
    const lookupId = getComponentLookupId(rawComponent) || component.sku;

    if (lookupId && !visitedSkus.has(lookupId)) {
      const product = await fetchProductBySku(lookupId);
      const nestedSet = product && Array.isArray(product.set) ? product.set : null;

      if (nestedSet && nestedSet.length > 0) {
        const nestedTotal = await calculateCompositionPortions(nestedSet, new Set([...visitedSkus, lookupId]));
        total += componentQuantity * nestedTotal;
        continue;
      }
    }

    total += componentQuantity;
  }

  return total;
};

interface NestedComponentRendererProps {
  component: CompositionComponent;
  depth?: number;
  isDebugMode: boolean;
}

const NestedComponentRenderer = ({ component, depth = 0, isDebugMode }: NestedComponentRendererProps) => {
  const compName = component.name;
  const compQty = component.quantity ? <><span className="text-[8px] mx-1">✕</span><span className="font-medium">{component.quantity}</span></> : '';
  const sku = component.sku;
  const [expandedNested, setExpandedNested] = useState(false);
  const [nestedList, setNestedList] = useState<any | null>(null);
  const [isSetFlag, setIsSetFlag] = useState<boolean | null>(null);
  const [loadingNestedMeta, setLoadingNestedMeta] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadMeta = async () => {
      if (!sku) return;
      if (productCache.has(sku)) {
        const cached = productCache.get(sku);
        if (mounted) {
          setNestedList(cached);
          setIsSetFlag(Boolean(cached && Array.isArray(cached.set) && cached.set.length > 0));
        }
        return;
      }
      setLoadingNestedMeta(true);
      try {
        const res = await fetch(`/api/products/${sku}`);
        if (!res.ok) {
          if (mounted) setIsSetFlag(false);
          return;
        }
        const prod = await res.json();
        productCache.set(sku, prod);
        if (mounted) {
          setNestedList(prod);
          setIsSetFlag(Boolean(prod && Array.isArray(prod.set) && prod.set.length > 0));
        }
      } catch {
        if (mounted) setIsSetFlag(false);
      } finally {
        if (mounted) setLoadingNestedMeta(false);
      }
    };
    loadMeta();
    return () => { mounted = false; };
  }, [sku]);

  const nestedItems = ((isSetFlag === true) || expandedNested) && nestedList
    ? (Array.isArray(nestedList) ? nestedList : (nestedList.set || nestedList.items || nestedList.children || []))
    : null;

  useEffect(() => {
    if (isSetFlag && !expandedNested) {
      setExpandedNested(true);
    }
    // only when isSetFlag changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetFlag]);

  const stableKey = [sku || compName, component.quantity ?? 1, component.unitRatio ?? 1, depth].join('|');

  return (
    <li className={`py-0.5 ${depth > 0 ? 'text-[12px]' : ''}`} data-key={stableKey}>
      <span className="flex items-center gap-0.5">
        <DynamicIcon name={depth < 1 ? 'chevron-right' : 'corner-down-right'} size={12} />
        {compName}{compQty}{isDebugMode && typeof component.unitRatio === 'number' && <span className="font-semibold ml-2 text-red-600 text-[12px]"> ({Number(component.unitRatio).toFixed(2)})</span>}
        {nestedItems && nestedItems.length > 0 ? <span className="text-[12px] text-slate-500 bg-slate-200/75 px-1 ml-2 rounded border-1 border-slate-200">комплект</span> : null}
      </span>

      {loadingNestedMeta && !nestedItems && (
        <div className="pl-4 mt-1 text-[11px] text-slate-400">Завантаження...</div>
      )}

      {nestedItems && nestedItems.length > 0 && (
        <ul className="pl-4 list-none mt-1">
          {nestedItems.map((si: any, idx: number) => {
            const lookupId = si.sku || si.id || si.productId || si.product_id;
            const cached = lookupId ? productCache.get(lookupId) : null;
            const name = si.name || si.productName || si.title || (cached && (cached.name || cached.productName || cached.title)) || `Товар ${lookupId}`;
            const nestedComponent = { name, quantity: si.quantity || si.count || 1, unitRatio: si.unitRatio || 1, sku: lookupId };
            const nestedKey = [lookupId || name, nestedComponent.quantity ?? 1, nestedComponent.unitRatio ?? 1, depth + 1, idx].join('|');
            return <NestedComponentRenderer component={nestedComponent} depth={depth + 1} isDebugMode={isDebugMode} key={nestedKey} />;
          })}
        </ul>
      )}
    </li>
  );
};

const MonolithicIndicator = ({ sku, quantity = 0, status }: { sku?: string; quantity?: number; status?: string }) => {
  const [remoteStock, setRemoteStock] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!sku) return;

      if (stockCache.has(sku)) {
        if (mounted) setRemoteStock(stockCache.get(sku) ?? null);
        return;
      }

      const existingRequest = stockRequestsInFlight.get(sku);
      if (existingRequest) {
        const cachedStock = await existingRequest;
        if (mounted && typeof cachedStock === 'number') {
          setRemoteStock(cachedStock);
        }
        return;
      }

      try {
        const request = (async () => {
          const res = await fetch(`/api/products/${sku}`);
          if (!res.ok) return null;
          const prod = await res.json();
          return extractStockTotal(prod?.stockBalanceByStock);
        })();

        stockRequestsInFlight.set(sku, request);
        const stock = await request;
        stockRequestsInFlight.delete(sku);

        if (typeof stock === 'number') {
          stockCache.set(sku, stock);
          if (mounted) setRemoteStock(stock);
        }
      } catch (e) {
        stockRequestsInFlight.delete(sku);
        // ignore
      }
    };
    load();
    return () => { mounted = false; };
  }, [sku]);

  if (!sku) return null;
  const effective = Math.max(0, remoteStock ?? 0);
  const shortage = Math.max(0, quantity - effective);
  if (effective > 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold bg-lime-200 text-emerald-800 px-2.5 py-1 rounded-full border-b-1 border-b-lime-600/15 border-t-1 border-t-white shadow-md shadow-lime-700/10">
          В наявності {effective} компл.
        </span>
        {shortage > 0 && (
          <span className="text-[11px] font-semibold bg-red-200 text-red-700 px-2.5 py-1 rounded-full border-b-1 border-b-red-600/15 border-t-1 border-t-white shadow-md shadow-red-700/10">
            Не вистачає {shortage} компл.
          </span>
        )}
      </div>
    );
  }
  if (quantity > 0) {
    return (
      <span className={`text-[11px] font-semibold ${status === 'done' ? 'bg-gray-300/50 text-gray-500' : 'bg-gray-200/75 text-gray-500/80'} px-2 py-1 rounded-full`}>
        Не вистачає {quantity} компл.
      </span>
    );
  }
  return null;
};

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  scannedCount?: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation' | 'confirmed';
  type: 'box' | 'product';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number;
  manualOrder?: number;
  sku?: string;
  barcode?: string;
  composition?: Array<string | { name: string; quantity?: number; unitRatio?: number; sku?: string }>;
  portionsPerItem?: number;
  unitRatio?: number;
  weightRatio?: number;
}

interface OrderChecklistItemProps {
  item: OrderItem;
  isActive: boolean;
  isBoxConfirmed: boolean;
  currentBoxTotalPortions: number;
  currentBoxTotalWeight: {
    currentBoxWeight: number;
    currentScaleWeight: number;
    totalOrderWeight: number;
  };
  onClick: () => void;
  assemblyMode?: 'standard' | 'no_scales';
  productScanMode?: 'single_per_item' | 'by_quantity';
  allowManualSelect?: boolean;
  showMonolithicAvailabilityBadge?: boolean;
  monolithicBadgeLabel?: string;
}

const OrderChecklistItem = ({ item, isBoxConfirmed, currentBoxTotalPortions, currentBoxTotalWeight, onClick, assemblyMode = 'standard', productScanMode = 'single_per_item', allowManualSelect = false, showMonolithicAvailabilityBadge = true, monolithicBadgeLabel }: OrderChecklistItemProps) => {
  const navigate = useNavigate();
  const { name, quantity, status, expectedWeight, type, boxSettings, sku, barcode } = item;
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [availableSetStock, setAvailableSetStock] = useState<number | null>(null);

  // Показувати у відлагоджувальному режимі коефіцієнти.
  // `unitRatio` — застосовується до звичайних товарів/наборів.
  // `weightRatio` — застосовується для монолітних наборів (мають `portionsPerItem`).
  const weightRatio = (item as any).weightRatio;
  const unitRatio = (item as any).unitRatio ?? 1;

  // Для монолітних наборів: effective = portionsPerItem * weightRatio
  // Для звичайних товарів: пріоритет — server `.calc.sumPortionsOne`, потім `unitRatio`, потім `weightRatio`, інакше 1
  const displayRatio = item.portionsPerItem
    ? (typeof weightRatio === 'number' ? (Number(item.portionsPerItem) * weightRatio) : Number(item.portionsPerItem))
    : (typeof (item as any).calc?.sumPortionsOne === 'number'
        ? (item as any).calc.sumPortionsOne
        : (typeof unitRatio === 'number' ? unitRatio : (typeof weightRatio === 'number' ? weightRatio : 1))
      );

  const { isDebugMode } = useDebug();

  // Перевіряємо, що у нас є валідні дані для відображення
  if (!name || !status || expectedWeight === undefined) {
    console.warn('OrderChecklistItem: Неправильні дані для елемента:', item);
    return null;
  }

  const isDone = status === 'done';
  const isByQuantityProduct = productScanMode === 'by_quantity' && type === 'product';
  const scannedCount = isByQuantityProduct
    ? Math.max(0, Math.min(quantity, item.scannedCount ?? (isDone ? quantity : 0)))
    : 0;
  const fillPercent = isByQuantityProduct && quantity > 0 ? (scannedCount / quantity) * 100 : 0;

  const itemStateClasses = cn(
    'relative overflow-hidden p-3.5 rounded-sm flex items-center justify-between outline-1 outline-transparent transition-background transition-colors duration-300 animate-duration-[100ms]',
    {
      'bg-gray-50 text-neutral-900 cursor-pointer outline-1 outline-neutral-200': status === 'default',
      'bg-warning-400 outline-2 outline-warning-500 cursor-pointer': status === 'pending' || status === 'awaiting_confirmation',
      'bg-success-500 text-white animate-pulse animate-thrice cursor-pointer': status === 'success',
      'bg-danger text-white cursor-pointer': status === 'error',
      'bg-gray-200 text-gray-500 outline-gray-300/75 delay-150': status === 'done',
      // 'outline-success-500/25 bg-success-500/5': fillPercent > 0 && fillPercent < 100,
      // 'cursor-not-allowed opacity-75': isBoxDone,
    }
  );

  // Коробки/Товари клікабельні тільки якщо очікують підтвердження
  // const isClickable = !isDone && !isItemBoxConfirmed && !isBoxDone && (type === 'box' ? status === 'awaiting_confirmation' : isBoxConfirmed && status === 'default');
  const isNoScales = assemblyMode === 'no_scales';
  const isClickable = isNoScales
    ? (type === 'box' ? status !== 'done' : (allowManualSelect && status !== 'done'))
    : (isBoxConfirmed && type === 'product' && status === 'default');
  const shouldConfirmClick = type === 'product' && ((productScanMode === 'single_per_item' && quantity > 1) || allowManualSelect);
  const setSku = (sku as string) || (type === 'box' ? boxSettings?.barcode : undefined);
  const itemKey = sku || item.id;
  const handleClick = () => {
    if (shouldConfirmClick) {
      setShowConfirmModal(true);
      return;
    }

    onClick();
  };

  const [compositionExpanded, setCompositionExpanded] = useState(false);
  const [compositionPortionsTotal, setCompositionPortionsTotal] = useState<number | null>(null);
  const compositionRef = useRef<HTMLUListElement | null>(null);
  const restContentRef = useRef<HTMLDivElement | null>(null);
  const hasPartialSetShortage = item.composition && item.composition.length > 0 && availableSetStock !== null && availableSetStock > 0 && availableSetStock < quantity;

  useEffect(() => {
    const el = restContentRef.current;
    if (!el) return;
    // Use ResizeObserver to handle async changes in inner content (e.g. nested sets auto-expanding)
    let ro: ResizeObserver | null = null;
    const inner = el.firstElementChild as HTMLElement | null;

    const disconnectObserver = () => {
      try {
        if (ro) {
          ro.disconnect();
          ro = null;
        }
      } catch (e) {
        // ignore
      }
    };

    if (compositionExpanded) {
      const setHeight = () => {
        const h = inner ? inner.scrollHeight : el.scrollHeight;
        el.style.maxHeight = h + 'px';
        el.style.opacity = '1';
      };

      setHeight();

      // observe inner for size changes and adjust maxHeight accordingly
      if (typeof window !== 'undefined' && (window as any).ResizeObserver) {
        ro = new (window as any).ResizeObserver(() => {
          // update height on resize to avoid jump
          setHeight();
        });
        if (inner) ro.observe(inner);
      }

      const onEnd = () => {
        // stop observing and allow natural flow
        el.style.maxHeight = 'none';
        disconnectObserver();
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd);
    } else {
      // When collapsing: ensure we animate from current rendered height down to 0
      const prev = el.style.maxHeight;
      if (!prev || prev === 'none') {
        const h = inner ? inner.scrollHeight : el.scrollHeight;
        el.style.maxHeight = h + 'px';
      }
      // force reflow before starting collapse
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.getBoundingClientRect();
      el.style.maxHeight = '0px';
      el.style.opacity = '0';
      disconnectObserver();
    }
  }, [compositionExpanded]);

  useEffect(() => {
    let cancelled = false;

    const loadCompositionTotal = async () => {
      if (!item.composition || item.composition.length === 0) {
        setCompositionPortionsTotal(null);
        return;
      }

      const total = await calculateCompositionPortions(item.composition);
      if (!cancelled) {
        setCompositionPortionsTotal(total);
      }
    };

    loadCompositionTotal();

    return () => {
      cancelled = true;
    };
  }, [item.composition, item.sku]);

  useEffect(() => {
    let mounted = true;

    const loadAvailableStock = async () => {
      if (!showConfirmModal || !item.composition?.length || !setSku) {
        setAvailableSetStock(null);
        return;
      }

      try {
        const res = await fetch(`/api/products/${setSku}`);
        if (!res.ok) return;
        const prod = await res.json();
        if (mounted) {
          setAvailableSetStock(extractStockTotal(prod?.stockBalanceByStock));
        }
      } catch {
        if (mounted) {
          setAvailableSetStock(null);
        }
      }
    };

    loadAvailableStock();

    return () => {
      mounted = false;
    };
  }, [item.composition, setSku, showConfirmModal]);

  return (
    <>
    <div className={itemStateClasses} onClick={isClickable ? handleClick : undefined}>
      {isByQuantityProduct && (
        <div
          className={`absolute inset-y-0 left-0 pointer-events-none transition-all duration-600 ${fillPercent != 100 ? 'bg-gray-500/15' : ''}`}
          style={{ width: `${fillPercent}%` }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-center gap-4 w-full">
        {/* Індикатор статусу */}
        <div className={cn("w-6 h-6 shrink-0 rounded-sm flex items-center justify-center bg-transparent transition-colors duration-300", {
          "bg-gray-400": isDone,
          "border-2 border-gray-400": !isDone && status !== 'success' && status !== 'awaiting_confirmation',
          "border-2 border-warning-600": status === 'pending' || status === 'awaiting_confirmation',
          "bg-success-600": status === 'success',
          "border-danger-foreground": status === 'error',
        })}>
          {(isDone || status === 'success') && <DynamicIcon name="check" size={18} className="text-white" />}
        </div>
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              {name}
            </span>
            
            {type === 'box' && boxSettings && (
              <>
              <span className="text-[13px] tabular-nums bg-gray-950/5 px-2 py-1 rounded">
                {boxSettings.width}×{boxSettings.height}×{boxSettings.length} см
              </span>
              {(currentBoxTotalWeight.totalOrderWeight && currentBoxTotalWeight.totalOrderWeight > 0 && currentBoxTotalWeight.totalOrderWeight !== currentBoxTotalWeight.currentBoxWeight) && (
                <span className={`text-[14px] font-medium ${item.status === 'awaiting_confirmation' && 'text-warning-800'}`}>
                  {currentBoxTotalPortions} порцій / {currentBoxTotalWeight.currentBoxWeight.toFixed(2)} кг
                </span>
              )}
              </>
            )}

            {/* Кількість одиниць × Вага позиції */}
            <span className="text-sm text-gray-400 tabular-nums text-nowrap">{type === 'product' && `× ${quantity}`} ≈ {expectedWeight.toFixed(2)} кг</span>

            {/* Динамічно-монолітний індикатор: відображається коли є portionsPerItem */}
            {showMonolithicAvailabilityBadge && item.portionsPerItem && (
              monolithicBadgeLabel ? (
                <span className="text-[11px] font-semibold bg-lime-300/65 text-emerald-800 px-2.5 py-1 rounded-full border-b-1 border-b-lime-700/25 border-t-1 border-t-white/60">
                  {monolithicBadgeLabel}
                </span>
              ) : ((item.sku || (type === 'box' && boxSettings?.barcode)) && (
                <div className="flex items-center gap-2">
                  <MonolithicIndicator
                    sku={(item.sku as string) || (type === 'box' ? boxSettings?.barcode : undefined)}
                    quantity={quantity}
                    status={status}
                  />
                </div>
              ))
            )}
            
            {isDebugMode && (
              <div className="flex">
                <span className="text-[12px] text-neutral-400 tabular-nums">
                   <span className="font-semibold ml-2 text-red-600">({Number(displayRatio).toFixed(2)})</span>
                </span>
                <span
                  className="flex items-center gap-1 ml-4 text-[12px] text-neutral-400 tabular-nums cursor-pointer hover:text-neutral-600 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const code = sku || (type === 'box' ? boxSettings.barcode : barcode);
                    navigator.clipboard.writeText(code || '');
                  }}
                  title="Click to copy"
                >
                  <DynamicIcon name="scan-barcode" size={14} /> {sku || (type === 'box' ? boxSettings.barcode : barcode)}
                </span>
              </div>
            )}
          </div>
          {/* Відображення складу монолітного набору */}
          {item.composition && item.composition.length > 0 && (
            (() => {
              const total = item.composition.length;
              const firstFive = item.composition.slice(0, 4);
              const rest = item.composition.slice(4);
              const shouldCollapse = total > 4;

              const renderList = (list: any[]) => (
                <ul className="list-none text-[13px] text-slate-400">
                  {list.map((component, index) => {
                    const compObj = normalizeCompositionComponent(component);
                    const key = [compObj.sku || compObj.name, compObj.quantity ?? 1, compObj.unitRatio ?? 1, index].join('|');
                    return <NestedComponentRenderer component={compObj} depth={0} isDebugMode={isDebugMode} key={key} />;
                  })}
                </ul>
              );

              return (
                <div className="mt-1">
                  <div className="mb-1 text-[11px] font-medium text-neutral-500 border border-neutral-400 rounded-full px-1.5 py-0.5 inline-block">
                    Порцій в наборі: {compositionPortionsTotal ?? '...'}
                  </div>
                  {renderList(firstFive)}

                  {shouldCollapse && (
                    <>
                      <div ref={restContentRef} className="overflow-hidden transition-[max-height,opacity] duration-300" style={{ maxHeight: '0px', opacity: 0 }}>
                        {renderList(rest)}
                      </div>
                      <button
                        className="text-[12px] text-neutral-500 flex items-center justify-between border border-neutral-200 rounded-sm px-2 py-1 mt-2 bg-neutral-100 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setCompositionExpanded(!compositionExpanded); }}
                        aria-expanded={compositionExpanded}
                      >
                        <span>{compositionExpanded ? 'Приховати' : `Показати ще ${rest.length}...`}</span>
                        <span className={`inline-block ml-2 transition-transform duration-200 ${compositionExpanded ? '-rotate-90' : 'rotate-0'}`} aria-hidden>
                          <DynamicIcon name="chevron-right" size={14} />
                        </span>
                      </button>
                    </>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Індикатор помилки */}
        {status === 'error' && <DynamicIcon name="x" size={24} />}
        
        {/* Лічильник одиниць порцій */}
        <span className={`text-[18px] tabular-nums rounded-sm bg-gray-950/6 px-2 py-0.5`}>{isByQuantityProduct ? `${scannedCount}/${quantity}` : quantity}</span>
      </div>
    </div>

    <ConfirmModal
      isOpen={showConfirmModal}
      title={name}
      message={
        <div>
          {!hasPartialSetShortage ? <span>Підтверджую додавання <span className="bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded font-semibold tabular-nums">{quantity} {item.composition && item.composition.length > 0 ? pluralize(quantity, 'комплекту', 'комплектів', 'комплектів') : pluralize(quantity, 'порції', 'порцій', 'порцій')}</span></span> : null}
          {availableSetStock === 0 && (
            <div className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <div className="flex items-start gap-2">
                <DynamicIcon name="info" size={16} className="mt-0.5 text-amber-400 shrink-0" />
                <div>
                  <p>Наразі по обліку немає жодного зібраного комплекту, тому списання відвантаження буде відбуватися за складом цього комплекту.</p>
                  <p className="mt-2">Але якщо ви використовуєте в цьому замовленні <span className="font-semibold text-amber-800">фактично зібрані комплекти</span>, спочатку зробіть випуск через <span className="font-semibold text-amber-800">Склад → Випуск наборів</span>, щоб уникнути можливих помилок при інвентаризації.</p>
                </div>
              </div>
            </div>
          )}
          {hasPartialSetShortage && (
            <div className="mt-3 rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">
              <div className="flex items-start gap-2">
                <DynamicIcon name="alert-triangle" size={16} className="mt-0.5 text-red-500 shrink-0" />
                <span>
                  Частково зібраний комплект: є <b>{availableSetStock}</b> з <b>{quantity}</b>. Необхідно випустити ще <b>{quantity - availableSetStock}</b> через <b>Склад → Випуск наборів</b>, інакше відвантаження впаде з помилкою.
                </span>
              </div>
            </div>
          )}
        </div>
      }
      confirmText={hasPartialSetShortage ? 'До випуску наборів' : 'Підтвердити'}
      confirmStartContent={hasPartialSetShortage ? <DynamicIcon name="undo-2" size={16} /> : undefined}
      cancelText="Скасувати"
      confirmColor={hasPartialSetShortage ? 'danger' : 'primary'}
      onConfirm={() => {
        if (hasPartialSetShortage) {
          setShowConfirmModal(false);
          navigate('/warehouse/releases');
          return;
        }

        setShowConfirmModal(false);
        onClick();
      }}
      onCancel={() => setShowConfirmModal(false)}
    />
    </>
  );
};

export default OrderChecklistItem;
