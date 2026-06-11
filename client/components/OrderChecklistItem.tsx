import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDebug } from '@/contexts/DebugContext';
import { DynamicIcon } from 'lucide-react/dynamic';

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
}

const OrderChecklistItem = ({ item, isBoxConfirmed, currentBoxTotalPortions, currentBoxTotalWeight, onClick, assemblyMode = 'standard', productScanMode = 'single_per_item', allowManualSelect = false }: OrderChecklistItemProps) => {
  const { name, quantity, status, expectedWeight, type, boxSettings, sku, barcode } = item;

  // Показувати у відлагоджувальному режимі коефіцієнти.
  // `unitRatio` — застосовується до звичайних товарів/наборів.
  // `weightRatio` — застосовується для монолітних наборів (мають `portionsPerItem`).
  const weightRatio = (item as any).weightRatio;
  const unitRatio = (item as any).unitRatio ?? (item as any).portionsPerItem ?? 1;

  // Для верхнього індикатора: якщо це монолітний набір — показуємо `weightRatio`, інакше `unitRatio`.
  const displayRatio = item.portionsPerItem ? (typeof weightRatio === 'number' ? weightRatio : unitRatio) : unitRatio;

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

  return (
    <div className={itemStateClasses} onClick={isClickable ? onClick : undefined}>
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
          {(isDone || status === 'success') && <Check size={18} className="text-white" />}
        </div>
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className={cn({
              "font-semibold": type === 'box',
              "font-normal": type === 'product'
            })}>
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
            <ul className="text-[13px] text-blue-500 mt-1">
              {item.composition.map((component, index) => {
                const isObj = typeof component !== 'string' && component !== null && typeof component === 'object';
                const compName = isObj ? (component as any).name : (component as string);
                const compQty = isObj && (component as any).quantity ? ` x${(component as any).quantity}` : '';
                const compUnitRatio = isObj ? ((component as any).unitRatio as number | undefined) : undefined;
                const ratioToShow = typeof compUnitRatio === 'number' ? compUnitRatio : unitRatio;
                return (
                  <li className="before:content-['•'] before:mr-1.5 before:text-blue-500" key={index}>
                    {compName}{compQty}{isDebugMode && <span className="font-semibold ml-2 text-red-600 text-[12px]"> ({Number(ratioToShow).toFixed(2)})</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Індикатор помилки */}
        {status === 'error' && <X size={24} />}
        
        {/* Лічильник одиниць порцій */}
        <span className={`text-[18px] tabular-nums rounded-sm bg-gray-950/6 px-2 py-0.5`}>{isByQuantityProduct ? `${scannedCount}/${quantity}` : quantity}</span>
      </div>
    </div>
  );
};

export default OrderChecklistItem;
