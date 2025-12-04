import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/DebugContext';
import { DynamicIcon } from 'lucide-react/dynamic';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation' | 'confirmed';
  type: 'box' | 'product';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number;
  manualOrder?: number;
  sku?: string;
  barcode?: string;
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
}

const OrderChecklistItem = ({ item, isActive, isBoxConfirmed, currentBoxTotalPortions, currentBoxTotalWeight, onClick }: OrderChecklistItemProps) => {
  const { name, quantity, status, expectedWeight, type, boxSettings, sku, barcode } = item;

  const { isDebugMode } = useDebug();

  // Перевіряємо, що у нас є валідні дані для відображення
  if (!name || !status || expectedWeight === undefined) {
    console.warn('OrderChecklistItem: Невалидные данные для элемента:', item);
    return null;
  }

  // Функція для форматування кількості порцій
  // const formatQuantity = (qty: number) => {
  //   if (qty === 1) return '1 порція';
  //   if (qty < 5) return `${qty} порції`;
  //   return `${qty} порцій`;
  // };

  const { isAdmin } = useRoleAccess();

  const isDone = status === 'done';
  const isBoxDone = type === 'box' && status === 'done';

  const itemStateClasses = cn(
    'p-4 rounded-sm flex items-center justify-between outline-2 outline-transparent transition-background transition-colors duration-300 animate-duration-[100ms]',
    {
      'bg-gray-50 text-neutral-900 cursor-pointer outline-1 outline-neutral-200': status === 'default',
      'bg-warning-400 outline-2 outline-warning-500 cursor-pointer': status === 'pending' || status === 'awaiting_confirmation',
      'bg-success-500 text-white animate-pulse animate-thrice cursor-pointer': status === 'success',
      'bg-danger text-white cursor-pointer': status === 'error',
      'bg-gray-200 text-gray-500': status === 'done',
      // 'cursor-not-allowed opacity-75': isBoxDone,
    }
  );

  // Коробки/Товари клікабельні тільки якщо очікують підтвердження
  // const isClickable = !isDone && !isItemBoxConfirmed && !isBoxDone && (type === 'box' ? status === 'awaiting_confirmation' : isBoxConfirmed && status === 'default');
  const isClickable = isBoxConfirmed && type === 'product' && status === 'default';

  // console.log('🔄 [OrderChecklistItem] item:', item);

  return (
    <div className={itemStateClasses} onClick={isClickable ? onClick : undefined}>
      <div className="flex items-center gap-4">
        {/* Індикатор статусу */}
        <div className={cn("w-6 h-6 rounded-sm flex items-center justify-center bg-transparent transition-colors duration-300", {
          "bg-gray-400": isDone,
          "border-2 border-gray-400": !isDone && status !== 'success' && status !== 'awaiting_confirmation',
          "border-2 border-warning-600": status === 'pending' || status === 'awaiting_confirmation',
          "bg-success-600": status === 'success',
          "border-danger-foreground": status === 'error',
        })}>
          {(isDone || status === 'success') && <Check size={18} className="text-white" />}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn({
            "font-semibold": type === 'box',
            "font-normal": type === 'product'
          })}>
            {name} {type !== 'box' && (<span>× <span className="text-[18px] font-mono rounded-sm bg-gray-950/5 px-2.5 py-1">{quantity}</span></span>)}
          </span>
          {/* {item.manualOrder && isAdmin() && (<span className="text-[13px] text-neutral-300 tabular-nums">#{item.manualOrder}</span>)} */}
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
          {isDebugMode && (
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
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Індикатор помилки */}
        {status === 'error' && <X size={24} />}
        
        {/* Лічильник порцій */}
        <span className="text-[13px] tabular-nums">
          ~{expectedWeight.toFixed(3)} кг
          {/* {type === 'box' ? `Вага коробки: ${expectedWeight.toFixed(3)} кг` : `~${expectedWeight.toFixed(3)} кг`} */}
        </span>
          {/* {type !== 'box' && (
            <span className="font-medium">
              {formatQuantity(quantity)}
            </span>
          )} */}
      </div>
    </div>
  );
};

export default OrderChecklistItem;
