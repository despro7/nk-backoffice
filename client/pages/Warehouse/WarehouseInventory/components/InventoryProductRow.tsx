import { useRef, useEffect } from 'react';
import { Button, Spinner, Divider, Tooltip, Kbd } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { StepperInput } from '../../shared/StepperInput';
import { InfoDisplay } from '../../shared/InfoDisplay';
import { pluralize } from '@/lib/formatUtils';
import { totalPortions, totalPortionsGp, formatBalanceBreakdown } from '../WarehouseInventoryUtils';
import { useDebug } from '@/contexts/DebugContext';
import type { InventoryProduct } from '../WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// ProductRow — рядок-акордіон для одного товару або матеріалу
// ---------------------------------------------------------------------------

export interface ProductRowProps {
  product: InventoryProduct;
  index: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onChange: (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => void;
  onCheck: (id: string) => void;
  onEnterPress?: (productId: string) => void;
  /** Автофокус для звичайних (не тач) пристроїв */
  autoFocus?: boolean;
  /** Автофокус для тач-пристроїв (за замовчуванням false, щоб не відкривати клавіатуру) */
  autoFocusTouch?: boolean;
  /** Обнулити значення (boxCount, actualCount, boxCountGp, actualCountGp) для цієї позиції */
  onReset?: (id: string) => void;
}

/** Повертає true, якщо пристрій є тач-пристроєм */
const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export const ProductRow = ({ product, index, isOpen, onToggle, onChange, onCheck, onEnterPress, autoFocus = true, autoFocusTouch = false, onReset }: ProductRowProps) => {
  const { isDebugMode } = useDebug();
  const total = totalPortions(product);
  const deviation = total !== null ? total - product.systemBalance : null;
  const hasDeviation = deviation !== null && deviation !== 0;
  const isCountEntered = total !== null;

  const deviationColorClass =
    deviation === null ? 'text-gray-400'
    : deviation === 0 ? 'text-green-600'
    : deviation < 0 ? 'text-red-500'
    : 'text-blue-600';

  const deviationLabel =
    deviation === null ? '—'
    : deviation > 0 ? `+${deviation}`
    : `${deviation}`;

  // --- Склад готової продукції (ГП) ---
  const totalGp = totalPortionsGp(product);
  const deviationGp = totalGp !== null ? totalGp - product.systemBalanceGp : null;
  const hasDeviationGp = deviationGp !== null && deviationGp !== 0;
  const isCountEnteredGp = totalGp !== null;

  const deviationGpColorClass =
    deviationGp === null ? 'text-gray-400'
    : deviationGp === 0 ? 'text-green-600'
    : deviationGp < 0 ? 'text-red-500'
    : 'text-blue-600';

  const deviationGpLabel =
    deviationGp === null ? '—'
    : deviationGp > 0 ? `+${deviationGp}`
    : `${deviationGp}`;

  const hasUnconfirmedCounts = !product.checked && (product.actualCount !== null || product.boxCount !== null || product.actualCountGp !== null || product.boxCountGp !== null);
  // Чи заповнене хоча б одне поле в Accordion body (для активації кнопки "Підтвердити")
  const isAnyFieldFilled = product.actualCount !== null || product.boxCount !== null || product.actualCountGp !== null || product.boxCountGp !== null;
  const isPortionsUnit = product.unit === 'portions';
  const isBalanceRefreshing = Boolean(product.isBalanceRefreshing);
  const isOutdated = Boolean(product.isOutdated);

  // Ref для першого StepperInput — для автофокусу при відкритті
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Автофокус на першому полі при відкритті акордіона
  // Для тач-пристроїв використовується окремий параметр autoFocusTouch
  useEffect(() => {
    const shouldFocus = isTouchDevice() ? autoFocusTouch : autoFocus;
    if (isOpen && shouldFocus) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoFocus, autoFocusTouch, product.id]);

  // При натисканні Enter у полі:
  // - якщо жодне поле не заповнене → лише зачинити accordion і перейти до наступного (без підтвердження)
  // - якщо заповнене хоча б одне поле → підтвердити позицію і перейти до наступного (стара схема)
  const handleEnterPress = () => {
    if (isAnyFieldFilled) {
      onCheck(product.id);
    }
    if (onEnterPress) {
      onEnterPress(product.id);
    }
  };

  return (
    <div className={`border-b border-gray-200 transition-colors ${product.checked ? 'bg-neutral-50' : ''}`}>
      {/* Accordion header */}
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onToggle(product.id)}
      >
        {/* Checkbox */}
        <span className={`w-7 h-7 rounded-full border-1.5 flex items-center justify-center flex-shrink-0 transition-colors select-none ${
            product.checked ? 'border-green-500 bg-green-500' : hasUnconfirmedCounts ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'
          }`} aria-label={product.checked ? 'Перевірено' : 'Не перевірено'}
        >
          {product.checked ? <DynamicIcon name="check" size={18} className="text-white" /> : hasUnconfirmedCounts ? <DynamicIcon name="alert-triangle" size={18} className="text-white relative -top-[1px]" /> : ''}
        </span>

        {/* Назва */}
        <div className="flex flex-1 gap-5 pl-1">
          <div className="flex flex-col">
            <span className="text-lg leading-tight font-semibold text-neutral-800">
              {product.name}
              {isOutdated && (
                <span className="text-xs font-medium px-1.5 py-0.5 ml-2 relative -top-0.5 rounded bg-red-500 text-white">
                  Застарілий
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">sku <span className="font-medium">{product.sku}</span></span>
              {product.portionsPerBox ? (
                <span className="text-xs text-gray-400 pl-2 border-l-1">в коробці: <span className="font-medium">{product.portionsPerBox}</span></span>
              ) : ''}
            </div>
          </div>
        </div>

        {/* Відхилення – Малий склад */}
        {hasDeviation && (
          <div className="flex flex-col items-end mr-2">
            <span className={`text-base font-semibold pr-0.5 ${deviation! < 0 ? 'text-red-500' : 'text-blue-500'}`}>
              {deviation! > 0 ? '+' : ''}{deviation}
            </span>
            <span className="text-xs text-gray-400">{deviation! > 0 ? 'Надлишок' : 'Нестача'} <span className="text-[10px] text-lime-800/50 bg-lime-500/10 px-1 py-0.5 rounded">МС</span></span>
          </div>
        )}

        {/* За фактом – Малий склад */}
        <div className="flex flex-col items-end mr-2">
          <span className="text-base font-bold pr-0.5 text-gray-800 flex items-center h-6">
            {isCountEntered ? (
              <>
                {!hasDeviation && <DynamicIcon name="check-circle" className="w-4 h-4 text-green-500 mr-1 inline-block" />}
                {total}
              </>
            ) : (
              <DynamicIcon name="message-circle-question-mark" className="w-4 h-4 text-gray-400/60 inline-block" />
            )}
          </span>
          <span className="text-xs text-gray-400">Факт <span className="text-[10px] text-lime-800/50 bg-lime-500/10 px-1 py-0.5 rounded">МС</span></span>
        </div>

        {/* За обліком – Малий склад */}
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-base font-bold pr-0.5 text-gray-800 flex items-center gap-1">
            {isBalanceRefreshing && <Spinner size="sm" color="default" />}
            {product.systemBalance}
          </span>
          <span className="text-xs text-gray-400">Облік <span className="text-[10px] text-lime-800/50 bg-lime-500/10 px-1 py-0.5 rounded">МС</span></span>
        </div>

        <Divider className="hidden sm:block h-6 w-[1px] bg-gray-200 mx-2" />

        {/* Відхилення – склад ГП */}
        {hasDeviationGp && (
          <div className="flex flex-col items-end mr-2">
            <span className={`text-base font-semibold pr-0.5 ${deviationGp! < 0 ? 'text-red-500' : 'text-blue-500'}`}>
              {deviationGp! > 0 ? '+' : ''}{deviationGp}
            </span>
            <span className="text-xs text-gray-400">{deviationGp! > 0 ? 'Надлишок' : 'Нестача'} <span className="text-[10px] text-blue-800/50 bg-blue-500/10 px-1 py-0.5 rounded">ГП</span></span>
          </div>
        )}

        {/* За фактом – склад ГП */}
        <div className="flex flex-col items-end mr-2">
          <span className="text-base font-bold pr-0.5 text-gray-800 flex items-center h-6">
            {isCountEnteredGp ? (
              <>
                {!hasDeviationGp && <DynamicIcon name="check-circle" className="w-4 h-4 text-green-500 mr-1 inline-block" />}
                {totalGp}
              </>
            ) : (
              <DynamicIcon name="message-circle-question-mark" className="w-4 h-4 text-gray-400/60 inline-block" />
            )}
          </span>
          <span className="text-xs text-gray-400">Факт <span className="text-[10px] text-blue-800/50 bg-blue-500/10 px-1 py-0.5 rounded">ГП</span></span>
        </div>

        {/* За обліком – склад ГП */}
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-base font-bold pr-0.5 text-gray-800 flex items-center gap-1">
            {isBalanceRefreshing && <Spinner size="sm" color="default" />}
            {product.systemBalanceGp}
          </span>
          <span className="text-xs text-gray-400">Облік <span className="text-[10px] text-blue-800/50 bg-blue-500/10 px-1 py-0.5 rounded">ГП</span></span>
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
          >
            <div className={`bg-gray-100 py-6 px-4 shadow-inner border-t border-gray-200 flex ${isPortionsUnit ? 'flex-col gap-8' : 'gap-8 2xl:gap-12'}`}>
              {/* Блок: Малий склад */}
              <div className={`flex flex-col gap-4 ${isPortionsUnit ? 'w-[calc(80%-0.5rem)]' : 'w-5/13'}`}>
                <div className="px-3 py-1.5 bg-gray-200/50 rounded-full gap-2 flex items-center justify-between text-sm text-gray-400 shadow-inner-sm">
                  <div className="font-semibold text-gray-500 uppercase tracking-wide">Малий склад</div>
                  {isPortionsUnit ? (
                    <span>
                      За обліком: <strong className="inline-flex items-center gap-1">{formatBalanceBreakdown(product.systemBalance, product.portionsPerBox)}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong>
                      <span className="text-gray-400 ml-1">(загалом {product.systemBalance} {pluralize(product.systemBalance, 'порція', 'порції', 'порцій')})</span>
                    </span>
                  ) : (
                    <span>За обліком: <strong className="inline-flex items-center gap-1">{product.systemBalance}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong></span>
                  )}
                </div>
                <div className={`grid gap-6 items-end ${isPortionsUnit ? 'grid-cols-4' : 'sm:grid-cols-2'}`}>
                  {isPortionsUnit && (
                    <StepperInput
                      ref={firstInputRef}
                      size="lg"
                      className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                      label={`Коробок × ${product.portionsPerBox}`}
                      value={product.boxCount}
                      onChange={(v) => onChange(product.id, 'boxCount', v)}
                      onIncrement={() => onChange(product.id, 'boxCount', (product.boxCount ?? 0) + 1)}
                      onDecrement={() => onChange(product.id, 'boxCount', Math.max(0, (product.boxCount ?? 0) - 1))}
                      onEnter={handleEnterPress}
                      disabled={product.checked}
                    />
                  )}
                  <StepperInput
                    ref={product.unit === 'pcs' ? firstInputRef : undefined}
                    size="lg"
                    className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                    label={isPortionsUnit ? '+ порцій' : 'Фактична кількість'}
                    value={product.actualCount}
                    max={isPortionsUnit ? product.portionsPerBox - 1 : undefined}
                    onChange={(v) => onChange(product.id, 'actualCount', v)}
                    onIncrement={() => onChange(product.id, 'actualCount', (product.actualCount ?? 0) + 1)}
                    onDecrement={() => onChange(product.id, 'actualCount', Math.max(0, (product.actualCount ?? 0) - 1))}
                    onEnter={handleEnterPress}
                    disabled={product.checked}
                  />
                  {isPortionsUnit && (
                    <InfoDisplay
                      label="Всього порцій"
                      value={total ?? '—'}
                      className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                    />
                  )}
                  <InfoDisplay
                    label="Відхилення"
                    value={deviationLabel}
                    colorClass={deviationColorClass}
                    className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                  />
                </div>
              </div>

              {isPortionsUnit && <Divider className="bg-gray-300/50" />}

              {/* Блок: Склад готової продукції (ГП) */}
              <div className="flex flex-col gap-4 flex-auto">
                <div className="px-3 py-1.5 bg-gray-200/50 rounded-full gap-2 flex items-center justify-between text-sm text-gray-400 shadow-inner-sm">
                  <div className="font-semibold text-gray-500 uppercase tracking-wide">Склад готової продукції</div>
                  {isPortionsUnit ? (
                    <span>
                      За обліком: <strong className="inline-flex items-center gap-1">{formatBalanceBreakdown(product.systemBalanceGp, product.portionsPerBox)}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong>
                      <span className="text-gray-400 ml-1">(загалом {product.systemBalanceGp} {pluralize(product.systemBalanceGp, 'порція', 'порції', 'порцій')})</span>
                    </span>
                  ) : (
                    <span>За обліком: <strong className="inline-flex items-center gap-1">{product.systemBalanceGp}{isBalanceRefreshing && <Spinner size="sm" color="default" />}</strong></span>
                  )}
                </div>
                <div className={`grid gap-6 items-end ${isPortionsUnit ? 'grid-cols-5' : 'grid-cols-3'}`}>
                  {isPortionsUnit && (
                    <StepperInput
                      size="lg"
                      className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                      label={`Коробок × ${product.portionsPerBox}`}
                      value={product.boxCountGp}
                      onChange={(v) => onChange(product.id, 'boxCountGp', v)}
                      onIncrement={() => onChange(product.id, 'boxCountGp', (product.boxCountGp ?? 0) + 1)}
                      onDecrement={() => onChange(product.id, 'boxCountGp', Math.max(0, (product.boxCountGp ?? 0) - 1))}
                      onEnter={handleEnterPress}
                      disabled={product.checked}
                    />
                  )}
                  <StepperInput
                    size="lg"
                    className="min-w-40 gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                    label={isPortionsUnit ? '+ порцій' : 'Фактична кількість'}
                    value={product.actualCountGp}
                    onChange={(v) => onChange(product.id, 'actualCountGp', v)}
                    onIncrement={() => onChange(product.id, 'actualCountGp', (product.actualCountGp ?? 0) + 1)}
                    onDecrement={() => onChange(product.id, 'actualCountGp', Math.max(0, (product.actualCountGp ?? 0) - 1))}
                    onEnter={handleEnterPress}
                    disabled={product.checked}
                  />
                  {isPortionsUnit && (
                    <InfoDisplay
                      label="Всього порцій"
                      value={totalGp ?? '—'}
                      className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                    />
                  )}
                  <InfoDisplay
                    label="Відхилення"
                    value={deviationGpLabel}
                    colorClass={deviationGpColorClass}
                    className="gap-1 [&>span]:font-semibold [&>span]:uppercase [&>span]:text-[11px]"
                  />
                  <div className={`flex items-center gap-2`}>
                    {/* Кнопка підтвердження — неактивна, якщо жодне поле не заповнене */}
                    <Button
                      size="lg"
                      color={product.checked ? 'success' : 'primary'}
                      variant={product.checked ? 'flat' : 'solid'}
                      isDisabled={!product.checked && !isAnyFieldFilled}
                      onPress={() => onCheck(product.id)}
                      startContent={<DynamicIcon size={18} name={product.checked ? 'check-check' : 'corner-down-left'} className="shrink-0" />}
                      className="h-18 rounded-lg gap-1.5 flex-auto"
                    >
                      {product.checked ? 'Перевірено' : 'Підтвердити'}
                    </Button>
                    {/* Кнопка обнулення значень — зупиняємо propagation, щоб не тригерити toggle */}
                    {hasUnconfirmedCounts && (
                      <Tooltip content="Обнулити значення">
                        <Button
                          size="lg"
                          variant="flat"
                          color="warning"
                          className="h-18 rounded-lg gap-1.5 min-w-0"
                            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                            // onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            onPress={() => onReset?.(product.id)}
                        >
                          <DynamicIcon name="trash-2" size={18} className="shrink-0" />
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
