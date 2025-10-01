import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Button } from '@heroui/button';
import OrderChecklistItem from './OrderChecklistItem';
import { Progress } from './ui/progress';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';


// Убираем функцию handlePrintTTN - она должна быть только в OrderView
// Убираем все неиспользуемые переменные и импорты

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation' | 'confirmed';
  type: 'box' | 'product';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number; // Индекс коробки (0, 1, 2...)
  portionsRange?: { start: number; end: number }; // Диапазон порций для коробки
  portionsPerBox?: number; // Количество порций на коробку
}

interface OrderChecklistProps {
  items: OrderItem[];
  totalPortions: number;
  activeBoxIndex: number;
  onActiveBoxChange?: (activeBoxIndex: number) => void;
  onItemStatusChange?: (itemId: string, status: OrderItem['status']) => void;
  onPrintTTN?: () => void; // Callback для печати ТТН
  showPrintTTN?: boolean;
  onNextOrder?: () => void; // Callback для перехода к следующему заказу
  showNextOrder?: boolean;
  isDebugMode?: boolean; // Флаг дебаг-режима
}

const OrderChecklist = ({ items, totalPortions, activeBoxIndex, onActiveBoxChange, onItemStatusChange, onPrintTTN, showPrintTTN, onNextOrder, showNextOrder }: OrderChecklistProps) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [equipmentState] = useEquipmentFromAuth(); // <-- Используем глобальное состояние оборудования
  const { isDebugMode } = useDebug(); // <-- Используем контекст дебага

  // Синхронизируем активный элемент при изменении items
  useEffect(() => {
    // console.log('🔄 [OrderChecklist] Синхронизация активного элемента:', {
    //   activeBoxIndex,
    //   items: items
    //     .filter(item => (item.boxIndex || 0) === activeBoxIndex)
    //     .map(item => ({ name: item.name, type: item.type, status: item.status }))
    // });

    // Сначала ищем элемент со статусом 'pending' в текущей коробке
    let newActiveItem = items.find((item) => 
      item.status === 'pending' && 
      (item.boxIndex || 0) === activeBoxIndex
    );

    // Если нет pending, ищем коробку текущей коробки, которая ожидает подтверждения
    if (!newActiveItem) {
      newActiveItem = items.find((item) =>
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'awaiting_confirmation'
      );
    }

    // Если коробка уже подтверждена, ищем первый товар в коробке со статусом 'default'
    if (!newActiveItem) {
      newActiveItem = items.find((item) =>
        item.type === 'product' &&
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'default'
      );
    }

    // console.log('🎯 [OrderChecklist] Выбранный активный элемент:', newActiveItem?.name || 'нет');
    // console.log('📋 [OrderChecklist] Статусы товаров в коробке:', 
    //   items
    //     .filter(item => (item.boxIndex || 0) === activeBoxIndex && item.type === 'product')
    //     .map(item => ({ name: item.name, status: item.status }))
    // );

    // Устанавливаем активный элемент только если он действительно найден и валиден
    if (newActiveItem && newActiveItem.id) {
      setActiveItemId(newActiveItem.id);
    } else {
      setActiveItemId(null);
    }
  }, [items, activeBoxIndex]);



  const packedPortions = useMemo(() => {
    // Используем items для корректного подсчета
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    const packed = currentBoxItems.reduce((acc, item) => {
      if (item.status === 'done') {
        return acc + item.quantity;
      }
      return acc;
    }, 0);
    
    return packed;
  }, [items, activeBoxIndex]);

  // Вычисляем вес активной коробки и общий вес заказа
  const weightInfo = useMemo(() => {
    // Вес активной коробки
    const currentBoxItems = items.filter(item =>
      (item.boxIndex || 0) === activeBoxIndex
    );

    const currentBoxWeight = currentBoxItems.reduce((acc, item) => {
      const itemTotalWeight = item.expectedWeight;
      return acc + itemTotalWeight;
    }, 0);

    // Текущий вес на весах (вес коробки + вес завершенных товаров)
    const currentScaleWeight = currentBoxItems.reduce((acc, item) => {
      if (item.type === 'box' || item.status === 'done') {
        return acc + item.expectedWeight;
      }
      return acc;
    }, 0);

    // Общий вес всего заказа (товары + коробки)
    const allProductItems = items.filter(item => item.type === 'product');
    const allBoxItems = items.filter(item => item.type === 'box');

    const productsWeight = allProductItems.reduce((acc, item) => {
      const itemTotalWeight = item.expectedWeight;
      return acc + itemTotalWeight;
    }, 0);

    const boxesWeight = allBoxItems.reduce((acc, item) => {
      return acc + item.expectedWeight;
    }, 0);

    const totalOrderWeight = productsWeight + boxesWeight;

    return {
      currentBoxWeight,
      currentScaleWeight,
      totalOrderWeight
    };
  }, [items, activeBoxIndex]);

  // Вычисляем общее количество порций для текущей коробки
  const currentBoxTotalPortions = useMemo(() => {
    // Используем items для консистентности с packedPortions
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    const total = currentBoxItems.reduce((acc, item) => {
      return acc + item.quantity;
    }, 0);
    
    return total;
  }, [items, activeBoxIndex]);

  // Проверяем, завершена ли текущая коробка
  const isCurrentBoxComplete = useMemo(() => {
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    // Коробка завершена, если все товары в ней собраны
    return currentBoxItems.length > 0 && currentBoxItems.every(item => item.status === 'done');
  }, [items, activeBoxIndex]);

  // Проверяем, взвешена ли текущая коробка
  const isCurrentBoxConfirmed = useMemo(() => {
    const currentBox = items.find(item =>
      item.type === 'box' && (item.boxIndex || 0) === activeBoxIndex
    );

    // Коробка считается взвешенной если она имеет статус 'confirmed' или 'done'
    return currentBox?.status === 'confirmed' || currentBox?.status === 'done';
  }, [items, activeBoxIndex]);

  // Подсчитываем общее количество упакованных порций по всему заказу
  const totalPackedPortions = useMemo(() => {
    return items
      .filter(item => item.type === 'product' && item.status === 'done')
      .reduce((acc, item) => acc + item.quantity, 0);
  }, [items]);

  // Проверяем, завершен ли весь заказ
  const isOrderComplete = useMemo(() => {
    const allProductItems = items.filter(item => item.type === 'product');
    return allProductItems.length > 0 && allProductItems.every(item => item.status === 'done');
  }, [items]);

  // Проверяем, есть ли следующая коробка
  const hasNextBox = useMemo(() => {
    const totalBoxes = items.filter(item => item.type === 'box').length;
    return activeBoxIndex < totalBoxes - 1;
  }, [items, activeBoxIndex]);

  const handleItemClick = (itemId: string) => {
    const clickedItem = items.find(item => item.id === itemId);

    // Коробки не кликабельны, кроме awaiting_confirmation
    // Коробки со статусом 'done' полностью заблокированы от повторного взвешивания
    if (clickedItem?.type === 'box' && clickedItem?.status !== 'awaiting_confirmation') {
      return;
    }

    // Товары не кликабельны, пока коробка не взвешена
    if (clickedItem?.type === 'product' && !isCurrentBoxConfirmed) {
      return;
    }

    setActiveItemId(itemId);

    // Обновляем статус через callback
    if (onItemStatusChange) {
        onItemStatusChange(itemId, 'pending');
        // Сбрасываем статус других элементов в default
        // Находим текущий элемент, чтобы получить его boxIndex
        const currentItem = items.find(item => item.id === itemId);
        const currentBoxIndex = currentItem?.boxIndex || 0;

        items.forEach(item => {
          if (item.id !== itemId && item.status === 'pending' && (item.boxIndex || 0) === currentBoxIndex) {
            onItemStatusChange(item.id, 'default');
          }
        });

      }
  };

  // Обработка завершения коробки
  const handleBoxComplete = (itemId: string) => {
    if (onItemStatusChange) {
      onItemStatusChange(itemId, 'done');
      
      // Автоматически выбираем первый товар в коробке
      // Находим коробку по itemId, чтобы получить её boxIndex
      const boxItem = items.find(item => item.id === itemId);
      const boxIndex = boxItem?.boxIndex || 0;
      
      const firstProduct = items.find((item) => 
        item.type === 'product' && 
        (item.boxIndex || 0) === boxIndex && 
        item.status === 'default'
      );
      
      if (firstProduct) {
        handleItemClick(firstProduct.id);
      } else {
        setActiveItemId(null);
      }
    }
  };



  // Создаем кастомный компонент для табов
  const CustomBoxTabs = ({ 
    items, 
    activeBoxIndex, 
    onActiveBoxChange, 
    totalPortions 
  }: {
    items: OrderItem[];
    activeBoxIndex: number;
    onActiveBoxChange: (index: number) => void;
    totalPortions: number;
  }) => {
    const boxCount = items.filter((item) => item.type === "box").length;
    
    if (boxCount <= 1) return null;

    return (
      <div className="mb-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: boxCount }, (_, index) => {
            const boxItems = items.filter(
              (item) =>
                (item.boxIndex || 0) === index && item.type === "product",
            );
            const boxPortions = boxItems.reduce(
              (sum, item) => sum + item.quantity,
              0,
            );
            const boxItem = items.find(item => item.type === "box" && (item.boxIndex || 0) === index);
            const boxName = boxItem?.name || `Коробка ${index + 1}`;
            const isActive = index === activeBoxIndex;

            return (
              <button
                key={index}
                onClick={() => onActiveBoxChange(index)}
                className={`flex-1 min-w-0 p-3 bg-white border rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-base font-semibold px-1 py-0 flex items-center gap-2 ${
                    isActive ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    <DynamicIcon name="package" size={20} strokeWidth={1.5} /> 
                    {boxName}
                  </span>
                  <div className={`text-sm px-1 ${
                    isActive ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {boxPortions} порций
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg shadow">
      {/* Убираем стандартные табы, так как теперь коробки переключаются через BoxSelector */}
      {/* {items.filter((item) => item.type === "box").length > 1 && (
        <Tabs
          selectedKey={activeBoxIndex.toString()}
          onSelectionChange={(key) => onActiveBoxChange?.(Number(key))}
          variant="solid"
          color="default"
          size="lg"
          classNames={{
          tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg w-full",
          cursor: "bg-blue-500 text-white shadow-sm rounded-md",
          tab: "px-3 py-1.5 text-sm font-normal flex-1 data-[hover-unselected=true]:opacity-100 text-neutral-500",
          tabContent: "group-data-[selected=true]:text-white text-neutral-400"
        }}
      >
        {Array.from(
          { length: items.filter((item) => item.type === "box").length },
          (_, index) => {
            // ... existing tab logic ...
          }
        )}
      </Tabs>
    )} */}

      {/* Общий прогресс-бар заказа */}
      <div className="bg-success-100 p-4 rounded-sm mb-4">
        <div className="flex justify-between items-center text-success-700 text-lg font-medium">
          <span>Загальна кількість порцій</span>
          <div className="flex items-center gap-8">
            {weightInfo.totalOrderWeight > 0 && (
              <span className="text-base leading-[100%] border-1 border-success-700/10 bg-success-700/5 rounded p-1">
                ~{weightInfo.totalOrderWeight.toFixed(3)} кг
              </span>
            )}
            <span>
              {totalPackedPortions} / {totalPortions}
            </span>
          </div>
        </div>

        <Progress
          value={(totalPackedPortions / totalPortions) * 100}
          className="mt-2"
        />
      </div>

             {/* Прогресс-бар текущей коробки */}
       {/* {items.filter((item) => item.type === "box").length > 1 && (
         <div className="bg-success-100 p-4 rounded-sm mb-4">
           <div className="flex justify-between items-center text-success-700 text-lg font-medium">
             <span>
               {(() => {
                 const boxItem = items.find(item => item.type === "box" && (item.boxIndex || 0) === activeBoxIndex);
                 return boxItem?.name || `Коробка ${activeBoxIndex + 1}`;
               })()} - Кількість порцій
             </span>
             <div className="flex items-center gap-8">
               {weightInfo.currentBoxWeight > 0 && (
                 <span className="text-base leading-[100%] border-1 border-success-700/10 bg-success-700/5 rounded p-1">
                   ~{weightInfo.currentBoxWeight.toFixed(3)} кг
                 </span>
               )}
               <span>
                 {packedPortions} / {currentBoxTotalPortions}
               </span>
             </div>
           </div>

           {currentBoxTotalPortions > 0 ? (
             <Progress
               value={(packedPortions / currentBoxTotalPortions) * 100}
               className="mt-2"
             />
           ) : (
             <div className="mt-2 text-center text-sm text-gray-500">
               Немає товарів у поточній коробці
             </div>
           )}
         </div>
       )} */}


      {/* Отладочная информация (только при проблемах) */}
      {currentBoxTotalPortions === 0 && (
        <div className="text-xs text-orange-600 mt-1">
          ⚠️ Немає товарів у поточній коробці
        </div>
      )}

      {/* Список позиций для комплектации */}
      <div className="space-y-2 mb-0">
        {items
          .filter((item) => {
            // Фильтруем элементы по текущей коробке
            const boxIndex = item.boxIndex || 0;
            return boxIndex === activeBoxIndex;
          })
          .map((item) => (
            <div key={item.id} className="relative">
              <OrderChecklistItem
                item={item}
                isActive={activeItemId === item.id}
                isBoxConfirmed={isCurrentBoxConfirmed}
                onClick={() => handleItemClick(item.id)}
              />
            </div>
          ))}
      </div>

      {/* Кнопки навигации */}
      <div className="space-y-3">
        {/* Кнопка "Следующая коробка" */}
        {isCurrentBoxComplete && hasNextBox && (
          <Button
            onPress={() => onActiveBoxChange && onActiveBoxChange(activeBoxIndex + 1)}
            className="mt-6 w-full bg-blue-600 text-white p-8 rounded-md text-lg font-medium hover:bg-blue-700 shadow-sm flex items-center justify-center gap-2"
          >
            Наступна коробка <DynamicIcon name="arrow-right" size={20} strokeWidth={1.5} />
          </Button>
        )}

        {/* Кнопка "Распечатать ТТН" */}
        {(isOrderComplete || showPrintTTN || isDebugMode) && (
          <Button
            onPress={onPrintTTN}
            disabled={false} // Убираем локальное состояние, используем глобальное из OrderView
            className="mt-6 w-full bg-danger text-white p-8 rounded-md text-lg font-medium hover:bg-danger-500 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Роздрукувати ТТН <DynamicIcon name="printer" size={20} strokeWidth={1.5} />
          </Button>
        )}

        {/* Кнопка "Наступне замовлення" */}
        {showNextOrder && (
          <Button
            onPress={onNextOrder}
            className="mt-3 w-full bg-primary text-white p-8 rounded-md text-lg font-medium shadow-sm flex items-center justify-center gap-2"
          >
            Наступне замовлення <DynamicIcon name="arrow-right-circle" size={20} strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </div>
  );
};

export default OrderChecklist;
