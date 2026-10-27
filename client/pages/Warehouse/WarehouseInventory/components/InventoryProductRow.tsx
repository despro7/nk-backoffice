import { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { StepperInput } from '../../shared/StepperInput';
import { InfoDisplay } from '../../shared/InfoDisplay';
import { pluralize } from '@/lib/formatUtils';
import {
  factTotalForWarehouseScope,
  formatBalanceBreakdown,
  systemBalanceForWarehouseScope,
} from '../WarehouseInventoryUtils';
import type { InventoryProduct, InventoryWarehouseScope } from '../WarehouseInventoryTypes';
import { itemHasEnteredCountsForScope } from '../WarehouseInventoryUtils';
import { inventoryRowDomId, scrollInventoryRowIntoViewIfNeeded, type InventoryRowKind } from '../inventoryRowScroll';
import {
  InventoryCatalogStatusBadges,
  inventoryCatalogItemNeedsStockToShow,
} from './InventoryCatalogStatusBadges';

// ---------------------------------------------------------------------------
// ProductRow — рядок-акордіон для одного товару або матеріалу
// ---------------------------------------------------------------------------

export interface ProductRowProps {
  product: InventoryProduct;
  index: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onChange: (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number | null) => void;
  onCheck: (id: string) => void;
  onEnterPress?: (productId: string) => void;
  /** Автофокус для звичайних (не тач) пристроїв */
  autoFocus?: boolean;
  /** Автофокус для тач-пристроїв (за замовчуванням false, щоб не відкривати клавіатуру) */
  autoFocusTouch?: boolean;
  /** Обнулити значення (boxCount, actualCount, boxCountGp, actualCountGp) для цієї позиції */
  onReset?: (id: string) => void;
  warehouseScope: InventoryWarehouseScope;
  rowKind: InventoryRowKind;
}

/** Повертає true, якщо пристрій є тач-пристроєм */
const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const ConfirmActions = ({
  product,
  isAnyFieldFilled,
  hasUnconfirmedCounts,
  onCheck,
  onReset,
}: {
  product: InventoryProduct;
  isAnyFieldFilled: boolean;
  hasUnconfirmedCounts: boolean;
  onCheck: (id: string) => void;
  onReset?: (id: string) => void;
}) => {
  const [cancelHover, setCancelHover] = useState(false);
  const isChecked = product.checked;
  const showCancelStyle = isChecked && cancelHover;

  return (
  <div className="flex items-center gap-2">
    <Button
      size="lg"
      color={showCancelStyle ? 'warning' : isChecked ? 'success' : 'primary'}
      variant={isChecked ? 'flat' : 'solid'}
      isDisabled={!isChecked && !isAnyFieldFilled}
      onPress={() => onCheck(product.id)}
      onMouseEnter={() => { if (isChecked) setCancelHover(true); }}
      onMouseLeave={() => setCancelHover(false)}
      startContent={(
        <DynamicIcon
          size={18}
          name={showCancelStyle ? 'x' : isChecked ? 'check-check' : 'corner-down-left'}
          className="shrink-0 transition-opacity duration-300 ease-in-out"
        />
      )}
      className="h-18 rounded-lg gap-1.5 flex-auto transition-colors duration-300 ease-in-out"
    >
      <span className="transition-opacity duration-300 ease-in-out">
        {showCancelStyle ? 'Скасувати' : isChecked ? 'Перевірено' : 'Підтвердити'}
      </span>
    </Button>
    {hasUnconfirmedCounts && (
      <Tooltip content="Обнулити значення (Delete)">
        <Button
          size="lg"
          variant="flat"
          color="warning"
          className="h-18 rounded-lg gap-1.5 min-w-0"
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          onPress={() => onReset?.(product.id)}
        >
          <DynamicIcon name="trash-2" size={18} className="shrink-0" />
        </Button>
      </Tooltip>
    )}
  </div>
  );
};

type CountField = 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp';

export const ProductRow = ({ product, index, isOpen, onToggle, onChange, onCheck, onEnterPress, autoFocus = true, autoFocusTouch = false, onReset, warehouseScope, rowKind }: ProductRowProps) => {
  const boxField: CountField = warehouseScope === 'gp' ? 'boxCountGp' : 'boxCount';
  const actualField: CountField = warehouseScope === 'gp' ? 'actualCountGp' : 'actualCount';
  const boxValue = warehouseScope === 'gp' ? product.boxCountGp : product.boxCount;
  const actualValue = warehouseScope === 'gp' ? product.actualCountGp : product.actualCount;

  const scopeTotal = factTotalForWarehouseScope(product, warehouseScope);
  const scopeSystemBalance = systemBalanceForWarehouseScope(product, warehouseScope);
  const scopeDeviation = scopeTotal !== null ? scopeTotal - scopeSystemBalance : null;
  const scopeHasDeviation = scopeDeviation !== null && scopeDeviation !== 0;
  const scopeIsCountEntered = scopeTotal !== null;

  const deviationColorClass =
    scopeDeviation === null ? 'text-gray-400'
    : scopeDeviation === 0 ? 'text-green-600'
    : scopeDeviation < 0 ? 'text-red-500'
    : 'text-blue-600';

  const deviationLabel =
    scopeDeviation === null ? '—'
    : scopeDeviation > 0 ? `+${scopeDeviation}`
    : `${scopeDeviation}`;

  const hasUnconfirmedCounts = !product.checked && itemHasEnteredCountsForScope(product, warehouseScope);
  const isAnyFieldFilled = itemHasEnteredCountsForScope(product, warehouseScope);
  const warehouseSectionLabel = warehouseScope === 'gp' ? 'Склад готової продукції' : 'Малий склад';
  const isPortionsUnit = product.unit === 'portions';
  const isBalanceRefreshing = Boolean(product.isBalanceRefreshing);
  const isMutedCatalog = inventoryCatalogItemNeedsStockToShow(product);

  // Ref для першого StepperInput — для автофокусу при відкритті
  const firstInputRef = useRef<HTMLInputElement>(null);
  const wasCheckedRef = useRef(product.checked);

  const focusFirstStepper = useCallback(() => {
    const shouldFocus = isTouchDevice() ? autoFocusTouch : autoFocus;
    if (!shouldFocus || product.checked) return;
    firstInputRef.current?.focus();
  }, [autoFocus, autoFocusTouch, product.checked]);

  useEffect(() => {
    if (wasCheckedRef.current && !product.checked && isOpen) {
      const timer = setTimeout(() => focusFirstStepper(), 0);
      wasCheckedRef.current = product.checked;
      return () => clearTimeout(timer);
    }
    wasCheckedRef.current = product.checked;
  }, [product.checked, isOpen, focusFirstStepper]);

  useEffect(() => {
    if (!isOpen) return;
    scrollInventoryRowIntoViewIfNeeded(rowKind, product.id);
  }, [isOpen, rowKind, product.id]);

  // При натисканні Enter у полі:
  // - якщо жодне поле не заповнене → лише зачинити accordion і перейти до наступного (без підтвердження)
  // - якщо заповнене хоча б одне поле → підтвердити позицію і перейти до наступного (стара схема)
  const handleEnterPress = () => {
    if (!product.checked && isAnyFieldFilled) {
      onCheck(product.id);
    }
    onEnterPress?.(product.id);
  };

  return (
    <div
      data-inventory-row={inventoryRowDomId(rowKind, product.id)}
      className={`not-last:border-b border-gray-200 transition-colors ${product.checked ? 'bg-neutral-50' : ''}`}
    >
      {/* Accordion header */}
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onToggle(product.id)}
      >
        {/* Checkbox */}
        <span className={`w-7 h-7 rounded-full border-1.5 flex items-center justify-center flex-shrink-0 transition-colors select-none 
          ${ product.checked
              ? scopeHasDeviation
                ? scopeDeviation! < 0
                  ? 'bg-red-500 border-red-500'
                  : 'bg-blue-500 border-blue-500'
                : 'bg-green-500 border-green-500'
              : hasUnconfirmedCounts
                ? 'bg-yellow-400 border-yellow-400'
                : 'border-gray-300'
          }`}
          aria-label={product.checked ? 'Перевірено' : 'Не перевірено'}
        >
          {product.checked ? <DynamicIcon name="check" size={18} className="text-white" /> : hasUnconfirmedCounts ? <DynamicIcon name="alert-triangle" size={18} className="text-white relative -top-[1px]" /> : ''}
        </span>

        {/* Назва */}
        <div className="flex flex-1 gap-5 pl-1">
          <div className="flex flex-col">
            <span className={`inline text-lg leading-tight font-semibold ${isMutedCatalog ? 'text-neutral-600' : 'text-neutral-800'}`}>
              {product.name}
            </span>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-xs text-gray-400">sku <span className="font-medium">{product.sku}</span></span>
              {product.portionsPerBox ? (
                <span className="text-xs text-gray-400 pl-2 border-l-1 border-gray-200">в коробці: <span className="font-medium">{product.portionsPerBox}</span></span>
              ) : null}
              <InventoryCatalogStatusBadges item={product} className="ml-1 align-middle" />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 items-center w-64">
          <div className="hidden sm:flex flex-col mr-2">
            <span className={`text-base font-bold pr-0.5 ${scopeSystemBalance < 0 ? 'text-red-500' : 'text-gray-800'} flex items-center gap-1`}>
              {isBalanceRefreshing && <Spinner size="sm" color="default" />}
              {scopeSystemBalance}
              {scopeSystemBalance < 0 && 
              <Tooltip content="Увага, нестача в обліку" placement="top" offset={10} showArrow classNames={{ base: 'before:bg-danger before:rounded-[3px] before:z-10 before:shadow-none', content: 'bg-danger border-0 text-white text-xs font-medium' }}>
                <DynamicIcon name="triangle-alert" className="w-4 h-4 text-red-500 ml-0.5 inline-block" />
              </Tooltip>
              }
            </span>
            <span className="text-xs text-gray-400">Облік</span>
          </div>
          
          <div className="flex flex-col mr-2">
            <span className="text-base font-bold pr-0.5 text-gray-800 flex items-center h-6">
              {scopeIsCountEntered ? (
                <>
                  {scopeTotal}
                  {!scopeHasDeviation && <DynamicIcon name="check-circle" className="w-4 h-4 text-green-500 ml-1 inline-block" />}
                </>
              ) : (
                <DynamicIcon name="circle-question-mark" className="w-4 h-4 text-gray-400/60 inline-block" />
              )}
            </span>
            <span className="text-xs text-gray-400">Факт</span>
          </div>

          <div className="flex flex-col mr-2">
            <span className={`text-base font-semibold pr-0.5 ${scopeHasDeviation && scopeDeviation! < 0 ? 'text-red-500' : 'text-blue-500'}`}>
              {scopeHasDeviation
                ? (scopeDeviation! > 0 ? '+' : '') + scopeDeviation
                : <span className="text-gray-400/60 inline-block font-normal">—</span>
              }
            </span>
            <span className="text-xs text-gray-400">
              {scopeHasDeviation ? (scopeDeviation! > 0 ? 'Надлишок' : 'Нестача') : 'Відхилення'}
            </span>
          </div>
        </div>

        {/* Іконка розкриття */}
        <DynamicIcon
          name="chevron-down"
          className={`w-5 h-5 text-gray-400 ml-1 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Accordion body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
            onAnimationComplete={() => {
              if (isOpen) focusFirstStepper();
            }}
          >
            <div className={`bg-gray-100 p-5 shadow-inner border-t border-gray-200 flex flex-col gap-4`}>
              <div className="px-3 py-1.5 bg-gray-200/50 rounded-full gap-2 flex items-center justify-between text-sm text-gray-400 shadow-inner-sm">
                <div className="font-semibold text-gray-500 uppercase tracking-wide">{warehouseSectionLabel}</div>
                {isPortionsUnit ? (
                  <span>
                    За обліком: <strong className="inline-flex items-center gap-1">{formatBalanceBreakdown(scopeSystemBalance, product.portionsPerBox)}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong>
                    <span className="text-gray-400 ml-1">(загалом {scopeSystemBalance} {pluralize(scopeSystemBalance, 'порція', 'порції', 'порцій')})</span>
                  </span>
                ) : (
                  <span>За обліком: <strong className="inline-flex items-center gap-1">{scopeSystemBalance}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong></span>
                )}
              </div>
              <div className={`grid gap-6 items-end ${isPortionsUnit ? 'grid-cols-3 md:grid-cols-5' : 'grid-cols-3 md:w-3/5'}`}>
                {isPortionsUnit && (
                  <StepperInput
                    ref={firstInputRef}
                    allowEmptyDisplay
                    size="lg"
                    className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                    label={`Коробок × ${product.portionsPerBox}`}
                    value={boxValue}
                    onChange={(v) => onChange(product.id, boxField, v)}
                    onIncrement={() => onChange(product.id, boxField, (boxValue ?? 0) + 1)}
                    onDecrement={() => onChange(product.id, boxField, Math.max(0, (boxValue ?? 0) - 1))}
                    onEnter={handleEnterPress}
                    locked={product.checked}
                  />
                )}
                <StepperInput
                  ref={!isPortionsUnit ? firstInputRef : undefined}
                  allowEmptyDisplay
                  size="lg"
                  className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                  label={isPortionsUnit ? '+ порцій' : 'Фактична кількість'}
                  value={actualValue}
                  max={isPortionsUnit ? product.portionsPerBox - 1 : undefined}
                  onChange={(v) => onChange(product.id, actualField, v)}
                  onIncrement={() => onChange(product.id, actualField, (actualValue ?? 0) + 1)}
                  onDecrement={() => onChange(product.id, actualField, Math.max(0, (actualValue ?? 0) - 1))}
                  onEnter={handleEnterPress}
                  locked={product.checked}
                />
                {isPortionsUnit && (
                  <InfoDisplay
                    label="Всього порцій"
                    value={scopeTotal ?? '—'}
                    className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                  />
                )}
                <InfoDisplay
                  label="Відхилення"
                  value={deviationLabel}
                  colorClass={deviationColorClass}
                  className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                />
                <ConfirmActions
                  product={product}
                  isAnyFieldFilled={isAnyFieldFilled}
                  hasUnconfirmedCounts={hasUnconfirmedCounts}
                  onCheck={onCheck}
                  onReset={onReset}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
