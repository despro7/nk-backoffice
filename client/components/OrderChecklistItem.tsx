import { Check, X } from 'lucide-react';
import { cn } from '../lib/utils';

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
}

interface OrderChecklistItemProps {
  item: OrderItem;
  isActive: boolean;
  isBoxConfirmed: boolean;
  onClick: () => void;
}

const OrderChecklistItem = ({ item, isActive, isBoxConfirmed, onClick }: OrderChecklistItemProps) => {
  const { name, quantity, status, expectedWeight, type, boxSettings } = item;

  // Функция для форматирования количества порций
  const formatQuantity = (qty: number) => {
    if (qty === 1) return '1 порція';
    if (qty < 5) return `${qty} порції`;
    return `${qty} порцій`;
  };

  const itemStateClasses = cn(
    'p-4 rounded-sm flex items-center justify-between outline-2 outline-transparent transition-background transition-colors duration-300 animate-duration-[100ms] cursor-pointer',
    {
      'bg-gray-50 text-neutral-900': status === 'default',
      'bg-warning-400 outline-2 outline-warning-500': status === 'pending' || status === 'awaiting_confirmation',
      'bg-success-500 text-white animate-pulse animate-thrice': status === 'success',
      'bg-danger text-white': status === 'error',
      'bg-gray-200 text-gray-500': status === 'done' || status === 'confirmed',
    }
  );

  const isDone = status === 'done';
  const isItemBoxConfirmed = type === 'box' && status === 'confirmed';

  // Коробки кликабельны только если ожидают подтверждения
  // Товары кликабельны только если коробка уже взвешена
  const isClickable = !isDone && !isItemBoxConfirmed && (type === 'box' ? status === 'awaiting_confirmation' : isBoxConfirmed);

  return (
    <div className={itemStateClasses} onClick={isClickable ? onClick : undefined}>
      <div className="flex items-center gap-4">
        {/* Индикатор статуса */}
        <div className={cn("w-6 h-6 rounded-sm flex items-center justify-center bg-transparent transition-colors duration-300", {
          "bg-gray-400": isDone || status === 'confirmed',
          "border-2 border-gray-400": !isDone && status !== 'success' && status !== 'awaiting_confirmation' && status !== 'confirmed',
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
            {name}
          </span>
          {type === 'box' && boxSettings && (
            <span className="text-xs bg-gray-950/5 px-2 py-1 rounded">
              {boxSettings.width}×{boxSettings.height}×{boxSettings.length} см
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Индикатор ошибки */}
        {status === 'error' && <X size={24} />}
        
        {/* Счетчик порций */}
        <span className="px-1 py-0.5 mr-2 rounded bg-gray-950/5 font-normal text-xs">
          {type === 'box' ? `Вага коробки: ${expectedWeight.toFixed(3)} кг` : `~${expectedWeight.toFixed(3)} кг`}
        </span>
          {type !== 'box' && (
            <span className="font-medium">
              {formatQuantity(quantity)}
            </span>
          )}
      </div>
    </div>
  );
};

export default OrderChecklistItem;
