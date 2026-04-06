import { useRef, useEffect } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { StepperInput } from '../../shared/StepperInput';
import { InfoDisplay } from '../../shared/InfoDisplay';
import { totalPortions, formatBalanceBreakdown } from '../../shared/WarehouseInventoryUtils';
import type { InventoryProduct } from '../../shared/WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// ProductRow — рядок-акордіон для одного товару або матеріалу
// ---------------------------------------------------------------------------

export interface ProductRowProps {
  product: InventoryProduct;
  index: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onChange: (id: string, field: 'boxCount' | 'actualCount', value: number) => void;
  onCheck: (id: string) => void;
  onEnterPress?: (productId: string) => void;
  /** Автофокус на першому полі при відкритті акордіона. За замовчуванням true. */
  autoFocus?: boolean;
}

export const ProductRow = ({ product, index, isOpen, onToggle, onChange, onCheck, onEnterPress, autoFocus = true }: ProductRowProps) => {
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

  // Ref для першого StepperInput — для автофокусу при відкритті
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Автофокус на першому полі при відкритті акордіона
  useEffect(() => {
    if (isOpen && autoFocus) {
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoFocus, product.id]);

  // Підтвердження позиції + перехід до наступного при Enter
  const handleConfirmClick = () => {
    onCheck(product.id);
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
        <span
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors select-none ${
            product.checked ? 'border-green-500 bg-green-500' : 'border-gray-300'
          }`}
          aria-label={product.checked ? 'Перевірено' : 'Не перевірено'}
        >
          {product.checked && <DynamicIcon name="check" className="w-4 h-4 text-white" />}
        </span>

        {/* Назва */}
        <span className={`flex-1 text-lg font-semibold text-neutral-800 pl-1 ${product.checked ? 'text-gray-400' : ''}`}>
          {product.name}
        </span>

        {/* Відхилення */}
        {hasDeviation && (
          <div className="flex flex-col items-end mr-2">
            <span className="text-xs text-gray-400">{deviation! > 0 ? 'Надлишок' : 'Нестача'}</span>
            <span className={`text-base font-semibold ${deviation! < 0 ? 'text-red-500' : 'text-blue-500'}`}>
              {deviation! > 0 ? '+' : ''}{deviation}
            </span>
          </div>
        )}

        {/* За фактом */}
        <div className="flex flex-col items-end mr-2">
          <span className="text-xs text-gray-400">За фактом</span>
          <span className="text-base font-bold text-gray-800 flex items-center h-6">
            {isCountEntered ? (
              <>
                {!hasDeviation && <DynamicIcon name="check-circle" className="w-4 h-4 text-green-500 mr-1 inline-block" />}
                {total}
              </>
            ) : (
              <DynamicIcon name="circle-question-mark" className="w-4 h-4 text-gray-400/60 inline-block" />
            )}
          </span>
        </div>

        {/* За обліком */}
        <div className="hidden sm:flex flex-col items-end mr-2">
          <span className="text-xs text-gray-400">За обліком</span>
          <span className="text-base font-bold text-gray-600">{product.systemBalance}</span>
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
            <div className="bg-gray-100 py-4 px-4 shadow-inner border-t border-gray-200">
              <div className="grid grid-cols-5 gap-6 items-end">
                {product.unit === 'portions' && (
                  <StepperInput
                    ref={firstInputRef}
                    label={`Коробок × ${product.portionsPerBox}`}
                    value={product.boxCount ?? 0}
                    onChange={(v) => onChange(product.id, 'boxCount', v)}
                    onIncrement={() => onChange(product.id, 'boxCount', (product.boxCount ?? 0) + 1)}
                    onDecrement={() => onChange(product.id, 'boxCount', Math.max(0, (product.boxCount ?? 0) - 1))}
                    onEnter={handleConfirmClick}
                    disabled={product.checked}
                  />
                )}

                <StepperInput
                  ref={product.unit === 'pcs' ? firstInputRef : undefined}
                  label={product.unit === 'portions' ? 'Залишок порцій' : 'Фактична кількість'}
                  value={product.actualCount ?? 0}
                  onChange={(v) => onChange(product.id, 'actualCount', v)}
                  onIncrement={() => onChange(product.id, 'actualCount', (product.actualCount ?? 0) + 1)}
                  onDecrement={() => onChange(product.id, 'actualCount', Math.max(0, (product.actualCount ?? 0) - 1))}
                  onEnter={handleConfirmClick}
                  disabled={product.checked}
                />

                {product.unit === 'portions' && (
                  <InfoDisplay label="Разом порцій" value={total ?? '—'} />
                )}

                <InfoDisplay
                  label="Відхилення"
                  value={deviationLabel}
                  colorClass={deviationColorClass}
                />

                <Button
                  size="lg"
                  color={product.checked ? 'success' : 'primary'}
                  variant={product.checked ? 'flat' : 'solid'}
                  onPress={() => onCheck(product.id)}
                  startContent={<DynamicIcon name={product.checked ? 'check-circle' : 'circle-check'} className="w-4 h-4 shrink-0" />}
                  className="h-18 rounded-lg gap-1.5"
                >
                  {product.checked ? 'Перевірено' : 'Підтвердити'}
                </Button>
              </div>

              {/* SKU + системний залишок */}
              <div className="mt-3 pl-4 gap-2 flex items-center text-sm text-gray-400">
                <span className="font-mono">SKU: {product.sku}</span>
                <span className="mx-1 text-gray-300">|</span>
                {product.unit === 'portions' ? (
                  <span className="font-mono">
                    За обліком: <strong>{formatBalanceBreakdown(product.systemBalance, product.portionsPerBox)}</strong>
                    <span className="text-gray-300 ml-1">(загалом {product.systemBalance} порцій)</span>
                  </span>
                ) : (
                  <span className="font-mono">За обліком: <strong>{product.systemBalance}</strong></span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
