import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { playSoundChoice } from '../lib/soundUtils';
import { Button } from '@heroui/button';
import OrderChecklistItem from './OrderChecklistItem';
import { Progress } from './ui/progress';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';


// Убираем функцию handlePrintTTN - она должна быть только в OrderView
// Убираем все неиспользуемые переменные и импорты

// Функция сортировки элементов по manualOrder -> type -> name
const sortChecklistItems = <T extends { manualOrder?: number; type: string; name: string }>(items: T[]): T[] => {
  return [...items].sort((a, b) => {
    // Спочатку сортуємо по manualOrder, потім по типу, потім по імені
    const aManualOrder = a.manualOrder ?? 999;
    const bManualOrder = b.manualOrder ?? 999;
    
    if (aManualOrder !== bManualOrder) {
      return aManualOrder - bManualOrder;
    }
    
    // Якщо manualOrder однаковий, спочатку коробки, потім товари
    if (a.type !== b.type) {
      return a.type === 'box' ? -1 : 1;
    }
    
    // Для однакового типу сортуємо по імені
    return a.name.localeCompare(b.name);
  });
};

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
  manualOrder?: number; // Ручне сортування
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
  nextOrderNumber?: string; // Номер наступного замовлення
  nextOrderDate?: string; // Дата наступного замовлення
  showNoMoreOrders?: boolean; // Показувати повідомлення про відсутність замовлень
  isDebugMode?: boolean; // Флаг дебаг-режима
}

const OrderChecklist = ({ items, totalPortions, activeBoxIndex, onActiveBoxChange, onItemStatusChange, onPrintTTN, showPrintTTN, onNextOrder, showNextOrder, nextOrderNumber, nextOrderDate, showNoMoreOrders }: OrderChecklistProps) => {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [equipmentState] = useEquipmentFromAuth(); // <-- Используем глобальное состояние оборудования
  const [soundSettings, setSoundSettings] = useState<Record<string, string>>({});
  const { isDebugMode } = useDebug(); // <-- Используем контекст дебага

  // Завантажуємо налаштування звуку
  useEffect(() => {
    fetch('/api/settings/equipment', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.data?.orderSoundSettings) {
          setSoundSettings(data.data.orderSoundSettings);
        }
      })
      .catch(() => {
        // Використовуємо дефолтні налаштування при помилці
        setSoundSettings({ done: 'macos_glass' });
      });
  }, []);


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

    // Если коробка уже подтверждена, ищем первый товар в коробке со статусом 'default' с учетом сортировки
    if (!newActiveItem) {
      const defaultProducts = items.filter((item) =>
        item.type === 'product' &&
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'default'
      );
      
      // Сортируем и берем первый элемент
      const sortedProducts = sortChecklistItems(defaultProducts);
      newActiveItem = sortedProducts[0];
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

  // Проигрываем звук, когда появляется кнопка печати ТТН
  const wasPrintVisibleRef = useRef(false);
  useEffect(() => {
    const isPrintVisible = !!(showPrintTTN || isOrderComplete || isDebugMode);
    if (isPrintVisible && !wasPrintVisibleRef.current) {
      // Використовуємо налаштування звуку для події 'done'
      const doneSound = soundSettings.done || 'macos_glass';
      playSoundChoice(doneSound, 'done');
    }
    wasPrintVisibleRef.current = isPrintVisible;
  }, [showPrintTTN, isOrderComplete, isDebugMode, soundSettings.done]);

  // Автоматичний друк при виконанні умов
  const wasAutoPrintTriggeredRef = useRef(false);
  const [isAutoPrinting, setIsAutoPrinting] = useState(false);
  const [autoPrintCountdown, setAutoPrintCountdown] = useState(0);
  
  useEffect(() => {
    const shouldAutoPrint = !!(isOrderComplete || showPrintTTN || isDebugMode);
    const autoPrintEnabled = equipmentState.config?.printer?.autoPrintOnComplete;
    
    // Перевіряємо чи потрібно автоматично друкувати
    if (shouldAutoPrint && autoPrintEnabled && !wasAutoPrintTriggeredRef.current && onPrintTTN) {
      console.log('🖨️ [OrderChecklist] Автоматичний друк ТТН:', { 
        isOrderComplete, 
        showPrintTTN, 
        isDebugMode, 
        autoPrintEnabled 
      });
      
      // Отримуємо затримку з налаштувань (за замовчуванням 3 секунди)
      const autoPrintDelay = equipmentState.config?.printer?.autoPrintDelayMs ?? 3000;
      const delaySeconds = Math.ceil(autoPrintDelay / 1000);
      
      // Запускаємо анімацію підготовки до автоматичного друку
      setIsAutoPrinting(true);
      setAutoPrintCountdown(delaySeconds);
      
      // Затримка для того, щоб користувач побачив завершення замовлення та анімацію
      setTimeout(() => {
        onPrintTTN();
        wasAutoPrintTriggeredRef.current = true;
        setIsAutoPrinting(false);
        setAutoPrintCountdown(0);
      }, autoPrintDelay);
    }
    
    // Скидаємо прапорець при зміні замовлення
    if (!shouldAutoPrint) {
      wasAutoPrintTriggeredRef.current = false;
      setIsAutoPrinting(false);
      setAutoPrintCountdown(0);
    }
  }, [isOrderComplete, showPrintTTN, isDebugMode, equipmentState.config?.printer?.autoPrintOnComplete, onPrintTTN]);

  // Анімація відліку для автоматичного друку
  useEffect(() => {
    if (autoPrintCountdown > 0) {
      const timer = setTimeout(() => {
        setAutoPrintCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPrintCountdown]);

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

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg shadow">

      {/* Общий прогресс-бар заказа */}
      <div className="bg-success-100 p-4 rounded-sm mb-4">
        <div className="flex justify-between items-center text-success-700 text-lg font-medium">
          <div className="flex items-center gap-4">
            <span>Загальна кількість порцій:</span>
            <span>
              {totalPackedPortions} / {totalPortions}
            </span>
          </div>
          {weightInfo.totalOrderWeight > 0 && (
            <span className="text-base tabular-nums leading-[100%] border-1 border-success-700/10 bg-success-700/5 rounded p-1">
              ~{weightInfo.totalOrderWeight.toFixed(3)} кг
            </span>
          )}
        </div>

        <Progress
          value={(totalPackedPortions / totalPortions) * 100}
          className="mt-2"
        />
      </div>

      {/* Отладочная информация (только при проблемах) */}
      {currentBoxTotalPortions === 0 && (
        <div className="text-xs text-orange-600 mt-1">
          ⚠️ Немає товарів у поточній коробці
        </div>
      )}

      {/* Список позицій для комплектації */}
      <div className="space-y-2 mb-0">
        {sortChecklistItems(
          items.filter((item) => {
            // Фільтруємо елементи за поточною коробкою
            const boxIndex = item.boxIndex || 0;
            return boxIndex === activeBoxIndex;
          })
        ).map((item) => (
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
          <div className="mt-6 space-y-2">
            {/* Індикатор автоматичного друку */}
            {/* {equipmentState.config?.printer?.autoPrintOnComplete && (
              <div className={`flex items-center justify-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md border border-blue-200 transition-all duration-300 ${
                isAutoPrinting ? 'animate-pulse bg-gradient-to-r from-blue-50 to-purple-50' : ''
              }`}>
                <DynamicIcon name="zap" size={16} className={`text-blue-500 ${isAutoPrinting ? 'animate-bounce' : ''}`} />
                <span className="font-medium">
                  {isAutoPrinting ? 'Підготовка до автоматичного друку...' : 'Автоматичний друк увімкнено'}
                </span>
              </div>
            )} */}
            
            <Button
              onPress={onPrintTTN}
              disabled={false} // Убираем локальное состояние, используем глобальное из OrderView
              className={`w-full p-8 rounded-md text-lg font-medium shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-300 ${
                isAutoPrinting 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white animate-pulse' 
                  : 'bg-danger text-white hover:bg-danger-500'
              }`}
            >
              {isAutoPrinting ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Автоматичний друк через {autoPrintCountdown}с...</span>
                  </div>
                  <DynamicIcon name="printer" size={20} strokeWidth={1.5} className="animate-bounce" />
                </>
              ) : (
                <>
                  Роздрукувати ТТН 
                  <DynamicIcon name="printer" size={20} strokeWidth={1.5} />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Кнопка "Наступне замовлення" */}
        {showNextOrder && nextOrderNumber && (
          <Button
            onPress={onNextOrder}
            className="mt-3 w-full bg-primary text-white p-8 rounded-md text-lg font-medium shadow-sm flex items-center justify-center gap-2"
          >
            Наступне замовлення №{nextOrderNumber}{nextOrderDate && <span className="font-normal">(від {nextOrderDate})</span>}
            <DynamicIcon name="arrow-right-circle" size={20} strokeWidth={1.5} />
          </Button>
        )}

        {/* Повідомлення про відсутність замовлень */}
        {showNoMoreOrders && (
          <div className="mt-3 w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <DynamicIcon name="check-circle" size={24} className="text-blue-600" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-blue-900">
                  Всі замовлення виконані! 🎉
                </h3>
                <p className="text-blue-700 text-sm">
                  Наразі більше замовлень для комплектування немає в наявності
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderChecklist;
