import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { playSoundChoice } from '../lib/soundUtils';
import { Button } from '@heroui/button';
import OrderChecklistItem from './OrderChecklistItem';
import { Progress } from './ui/progress';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';
import { sortChecklistItems } from '@/lib/orderAssemblyUtils';
import { LoggingService } from '@/services/LoggingService';
import { smoothScrollToElement } from '@/lib/scrollUtils';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  scannedCount?: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation';
  type: 'box' | 'product';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number; // Індекс коробки (0, 1, 2...)
  portionsRange?: { start: number; end: number }; // Діапазон порцій для коробки
  portionsPerBox?: number; // Кількість порцій на коробку
  manualOrder?: number; // Ручне сортування
  sku?: string;
  barcode?: string;
  portionsPerItem?: number; // Для монолітних комплектів: кількість порцій в одному комплекті
}

interface OrderChecklistProps {
  items: OrderItem[];
  totalPortions: number;
  activeBoxIndex: number;
  onActiveBoxChange?: (activeBoxIndex: number) => void;
  onItemStatusChange?: (itemId: string, status: OrderItem['status']) => void;
  onPrintTTN?: () => void; // Callback для печати ТТН
  showPrintTTN?: boolean;
  wasOpenedAsReady?: boolean; // Чи було замовлення відкрите вже зібраним (без автодруку)
  allowManualSelect?: boolean; // Дозволити ручний вибір товару кліком
  assemblyMode?: 'standard' | 'no_scales';
  productScanMode?: 'single_per_item' | 'by_quantity';
  onNextOrder?: () => void; // Callback для перехода к следующему заказу
  showNextOrder?: boolean;
  nextOrderNumber?: string; // Номер наступного замовлення
  nextOrderDate?: string; // Дата наступного замовлення
  showNoMoreOrders?: boolean; // Показувати повідомлення про відсутність замовлень
  isDebugMode?: boolean; // Флаг дебаг-режима
  onBarcodeScan?: (code: string) => void; // Емуляція сканування ШК (Debug)
  showMonolithicAvailabilityBadge?: boolean;
  monolithicBadgeLabel?: string;
}

const OrderChecklist = ({ items, totalPortions, activeBoxIndex, onActiveBoxChange, onItemStatusChange, onPrintTTN, showPrintTTN, wasOpenedAsReady, onNextOrder, showNextOrder, nextOrderNumber, nextOrderDate, showNoMoreOrders, allowManualSelect = false, assemblyMode = 'standard', productScanMode = 'single_per_item', onBarcodeScan, showMonolithicAvailabilityBadge = true, monolithicBadgeLabel }: OrderChecklistProps) => {
  const navigate = useNavigate();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [equipmentState] = useEquipmentFromAuth(); // <-- Використовуємо глобальний стан обладнання
  const [soundSettings, setSoundSettings] = useState<Record<string, string>>({});
  const { isDebugMode } = useDebug(); // <-- Використовуємо контекст дебагування
  const noMoreOrdersRef = useRef<HTMLDivElement>(null);
  const printTTNRef = useRef<HTMLDivElement>(null);

  // Фільтруємо елементи за поточною коробкою
  const currentBoxItems = items.filter((item) => {
    const boxIndex = item.boxIndex || 0;
    return boxIndex === activeBoxIndex;
  });

  // Підраховуємо товари по назвах для відображення
  const itemsByName = currentBoxItems.reduce((acc, item) => {
    if (item.type === 'product') {
      const key = item.name;
      if (!acc[key]) {
        acc[key] = { ...item, totalQuantity: 0, parts: [] };
      }
      acc[key].totalQuantity += item.quantity;
      acc[key].parts.push(item);
    }
    return acc;
  }, {} as Record<string, any>);

  // Відображаємо згруповані товари

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


  // Синхронізуємо активний елемент при зміні items
  useEffect(() => {
    // Спочатку шукаємо елемент зі статусом 'pending' в поточній коробці
    let newActiveItem = items.find((item) => 
      item.status === 'pending' && 
      (item.boxIndex || 0) === activeBoxIndex
    );

    // Якщо немає pending, шукаємо коробку поточної коробки, яка очікує підтвердження
    if (!newActiveItem) {
      newActiveItem = items.find((item) =>
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'awaiting_confirmation'
      );
    }

    // Якщо коробка уже підтверджена, шукаємо перший товар в коробці зі статусом 'default' з урахуванням сортування
    if (!newActiveItem) {
      const defaultProducts = items.filter((item) =>
        item.type === 'product' &&
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'default'
      );
      
      // Сортуємо і беремо перший елемент
      const sortedProducts = sortChecklistItems(defaultProducts);
      newActiveItem = sortedProducts[0];
    }

    // Встановлюємо активний елемент тільки якщо він дійсно знайдений і валідний
    if (newActiveItem && newActiveItem.id) {
      setActiveItemId(newActiveItem.id);
    } else {
      setActiveItemId(null);
    }
  }, [items, activeBoxIndex]);


  const packedPortions = useMemo(() => {
    // Використовуємо items для коректного підрахунку
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    const packed = currentBoxItems.reduce((acc, item) => {
      if (item.status === 'done') {
        return acc + (item.portionsPerItem ? item.quantity * item.portionsPerItem : item.quantity);
      }
      return acc;
    }, 0);
    
    return packed;
  }, [items, activeBoxIndex]);

  // Вираховуємо вагу активної коробки і загальний вага замовлення
  const weightInfo = useMemo(() => {
    // Вага активної коробки
    const currentBoxItems = items.filter(item =>
      (item.boxIndex || 0) === activeBoxIndex
    );

    const currentBoxWeight = currentBoxItems.reduce((acc, item) => {
      const itemTotalWeight = item.expectedWeight;
      return acc + itemTotalWeight;
    }, 0);

    // Поточний вага на вагах (вага коробки + вага завершених товарів)
    const currentScaleWeight = currentBoxItems.reduce((acc, item) => {
      if (item.type === 'box' || item.status === 'done') {
        return acc + item.expectedWeight;
      }
      return acc;
    }, 0);

    // Загальний вага всього замовлення (товарі + коробки)
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

  // Вираховуємо загальну кількість порцій для поточної коробки
  const currentBoxTotalPortions = useMemo(() => {
    // Використовуємо items для консистентності з packedPortions
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    const total = currentBoxItems.reduce((acc, item) => {
      const portions = item.portionsPerItem ? item.quantity * item.portionsPerItem : item.quantity;
      return acc + portions;
    }, 0);

    return total;
  }, [items, activeBoxIndex]);

  // Перевіряємо, чи завершена поточна коробка
  const isCurrentBoxComplete = useMemo(() => {
    const currentBoxItems = items.filter(item => 
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );
    
    // Коробка завершена, якщо всі товари в ній зібрані
    return currentBoxItems.length > 0 && currentBoxItems.every(item => item.status === 'done');
  }, [items, activeBoxIndex]);

  // Перевіряємо, чи зважена поточна коробка
  const isCurrentBoxConfirmed = useMemo(() => {
    const currentBox = items.find(item =>
      item.type === 'box' && (item.boxIndex || 0) === activeBoxIndex
    );

    const currentBoxProducts = items.filter(item =>
      item.type === 'product' && (item.boxIndex || 0) === activeBoxIndex
    );

    const isMonolithicOnlyBox = currentBoxProducts.length > 0
      && currentBoxProducts.every(item => typeof item.portionsPerItem === 'number' && item.portionsPerItem > 16);

    // У режимі 'no_scales' без коробок вважаємо автоматично підтвердженим
    if (assemblyMode === 'no_scales' && !currentBox) return true;

    if (!currentBox && isMonolithicOnlyBox) return true;

    // Коробка вважається зваженою, якщо вона має статус 'done'
    // У режимі 'no_scales' також вважаємо коробку підтвердженою коли її статус 'pending'
    return currentBox?.status === 'done' || (assemblyMode === 'no_scales' && currentBox?.status === 'pending');
  }, [items, activeBoxIndex, assemblyMode]);

  // Вираховуємо загальну кількість упакованих порцій по всьому замовленню
  const totalPackedPortions = useMemo(() => {
    return items
      .filter(item => item.type === 'product' && item.status === 'done')
      .reduce((acc, item) => {
        const portions = item.portionsPerItem ? item.quantity * item.portionsPerItem : item.quantity;
        return acc + portions;
      }, 0);
  }, [items]);

  // Перевіряємо, чи завершено всє замовлення
  const isOrderComplete = useMemo(() => {
    const allProductItems = items.filter(item => item.type === 'product');
    return allProductItems.length > 0 && allProductItems.every(item => item.status === 'done');
  }, [items]);

  // Програємо звук, коли з'являється кнопка друку ТТН
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
    const shouldAutoPrint = !!(isOrderComplete || showPrintTTN);
    const autoPrintEnabled = equipmentState.config?.printer?.autoPrintOnComplete;
    
    // Перевіряємо чи потрібно автоматично друкувати
    // НЕ друкуємо автоматично, якщо замовлення було відкрите вже зібраним
    if (shouldAutoPrint && autoPrintEnabled && !wasAutoPrintTriggeredRef.current && onPrintTTN && !wasOpenedAsReady) {
      LoggingService.equipmentLog('🖨️ [OrderChecklist] Автоматичний друк ТТН:', { 
        isOrderComplete, 
        showPrintTTN, 
        isDebugMode,
        autoPrintEnabled,
        wasOpenedAsReady
      });

      smoothScrollToElement(printTTNRef, {
        duration: 1000,
        delay: 300,
        offset: 100,
        position: 'bottom'
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
  }, [isOrderComplete, showPrintTTN, isDebugMode, equipmentState.config?.printer?.autoPrintOnComplete, wasOpenedAsReady]);

  // Анімація відліку для автоматичного друку
  useEffect(() => {
    if (autoPrintCountdown > 0) {
      const timer = setTimeout(() => {
        setAutoPrintCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoPrintCountdown]);

  // Автоскролл до блоку "Немає більше замовлень"
  useEffect(() => {
    if (showNoMoreOrders) {
      smoothScrollToElement(noMoreOrdersRef, {
        duration: 1000,
        delay: 300,
        offset: 50,
        position: 'bottom'
      });
    }
  }, [showNoMoreOrders]);

  // Перевіряємо, чи є наступна коробка
  const hasNextBox = useMemo(() => {
    const maxBoxIndex = items.reduce((max, item) => {
      const itemBoxIndex = item.boxIndex || 0;
      return itemBoxIndex > max ? itemBoxIndex : max;
    }, 0);
    return activeBoxIndex < maxBoxIndex;
  }, [items, activeBoxIndex]);

  // Перевіряємо, чи є попередня коробка
  const hasPrevBox = useMemo(() => {
    return activeBoxIndex > 0;
  }, [activeBoxIndex]);

  const handleItemClick = (itemId: string) => {
    const clickedItem = items.find(item => item.id === itemId);
    LoggingService.orderAssemblyLog('[OrderChecklist] handleItemClick', {
      itemId,
      itemType: clickedItem?.type,
      itemStatus: clickedItem?.status,
      activeBoxIndex,
      assemblyMode,
      allowManualSelect
    });

    // Коробки: зазвичай не клікабельні, крім awaiting_confirmation.
    // У режимі 'no_scales' дозволяємо підтвердження коробки кліком, якщо вона в статусі 'pending'.
    if (clickedItem?.type === 'box') {
      LoggingService.orderAssemblyLog('[OrderChecklist] clicked box', { id: clickedItem.id, status: clickedItem.status, assemblyMode });
      if (clickedItem?.status === 'awaiting_confirmation') {
        // allow click through to other logic (if any)
      } else if (assemblyMode === 'no_scales') {
        // In 'no_scales' mode allow confirming the box by click regardless of current non-done status
        LoggingService.orderAssemblyLog('[OrderChecklist] confirming box in no_scales mode (flexible)', { boxId: clickedItem.id, previousStatus: clickedItem.status });
        if (onItemStatusChange) {
          onItemStatusChange(clickedItem.id, 'done');
        }
        return;
      } else {
        LoggingService.orderAssemblyLog('[OrderChecklist] box click ignored (not awaiting_confirmation and not no_scales)', { boxId: clickedItem.id, status: clickedItem.status });
        return;
      }
    }
    // Товари: поведінка відрізняється для режиму 'no_scales'
    if (clickedItem?.type === 'product') {
      LoggingService.orderAssemblyLog('[OrderChecklist] clicked product', { id: clickedItem.id, status: clickedItem.status, assemblyMode, allowManualSelect, isCurrentBoxConfirmed });
      // У режимі 'no_scales' клік може відмічати товар як 'done', якщо дозволений ручний вибір
      if (assemblyMode === 'no_scales') {
        if (!allowManualSelect) {
          LoggingService.orderAssemblyLog('[OrderChecklist] product click ignored: manual select disabled in no_scales', { id: clickedItem.id });
          return; // без ручного вибору клік не робить нічого
        }
        LoggingService.orderAssemblyLog('[OrderChecklist] marking product done in no_scales mode', { id: clickedItem.id });
        if (onItemStatusChange) {
          onItemStatusChange(itemId, 'done');
        }
        return;
      }

      // Стандартна поведінка: товари клікабельні лише якщо коробка підтверджена
      if (!isCurrentBoxConfirmed) {
        LoggingService.orderAssemblyLog('[OrderChecklist] product click ignored: box not confirmed', { id: clickedItem.id });
        return;
      }
      const requiresConfirmation = productScanMode === 'single_per_item' && clickedItem.quantity > 1;

      if (!allowManualSelect && !requiresConfirmation) {
        // У Debug-режимі емулюємо сканування ШК замість ручного вибору
        if (isDebugMode && onBarcodeScan) {
          const code = clickedItem.barcode || clickedItem.sku;
          if (code) {
            LoggingService.orderAssemblyLog('[OrderChecklist] debug: emulating barcode scan for product', { id: clickedItem.id, code });
            onBarcodeScan(code);
          }
        }
        LoggingService.orderAssemblyLog('[OrderChecklist] product click ignored: manual select disabled', { id: clickedItem.id });
        return;
      }

      setActiveItemId(itemId);

      // Встановлюємо 'pending' і скидаємо інші pending в тій же коробці
      if (onItemStatusChange) {
        LoggingService.orderAssemblyLog('[OrderChecklist] marking product pending (manual select)', { id: clickedItem.id });
        onItemStatusChange(itemId, 'pending');
        const currentItem = items.find(item => item.id === itemId);
        const currentBoxIndex = currentItem?.boxIndex || 0;

        items.forEach(item => {
          if (item.id !== itemId && item.status === 'pending' && (item.boxIndex || 0) === currentBoxIndex) {
            onItemStatusChange(item.id, 'default');
          }
        });
      }
      return;
    }
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded-lg shadow">

      {/* Загальний прогрес-бар замовлення */}
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
              ≈ {weightInfo.totalOrderWeight.toFixed(3)} кг
            </span>
          )}
        </div>

        <Progress
          value={(totalPackedPortions / totalPortions) * 100}
          className="mt-2"
        />
      </div>

      {/* Відладочна інформація (тільки при проблемах) */}
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
              currentBoxTotalPortions={currentBoxTotalPortions}
              currentBoxTotalWeight={weightInfo}
              assemblyMode={assemblyMode}
              productScanMode={productScanMode}
              allowManualSelect={allowManualSelect}
              showMonolithicAvailabilityBadge={showMonolithicAvailabilityBadge}
              monolithicBadgeLabel={monolithicBadgeLabel}
              onClick={() => handleItemClick(item.id)}
            />
          </div>
        ))}
      </div>

      {/* Кнопки навігації */}
      <div className="space-y-3">
        {/* Навігація між коробками */}
        {(hasPrevBox || hasNextBox) && (
          <div className={`mt-6 gap-3 ${hasPrevBox && hasNextBox ? 'grid grid-cols-2' : 'flex'}`}>
            {/* Кнопка "Попередня коробка" */}
            {hasPrevBox && (
              <Button
                onPress={() => onActiveBoxChange && onActiveBoxChange(activeBoxIndex - 1)}
                className="w-full bg-lime-600/80 text-white p-8 rounded-md text-lg font-medium shadow-sm flex items-center justify-center gap-2"
              >
                <DynamicIcon name="arrow-left" size={20} strokeWidth={1.5} />
                Попередня коробка
              </Button>
            )}
            
            {/* Кнопка "Наступна коробка" - показується тільки якщо коробка завершена */}
            {isCurrentBoxComplete && hasNextBox && (
              <Button
                onPress={() => onActiveBoxChange && onActiveBoxChange(activeBoxIndex + 1)}
                className="w-full bg-lime-600 text-white p-8 rounded-md text-lg font-medium shadow-sm flex items-center justify-center gap-2"
              >
                Наступна коробка <DynamicIcon name="arrow-right" size={20} strokeWidth={1.5} />
              </Button>
            )}
          </div>
        )}

        {/* Кнопка "Роздрукувати ТТН" */}
        {(isOrderComplete || showPrintTTN || isDebugMode) && (
          <div ref={printTTNRef} className="mt-6 space-y-2">
            <Button
              onPress={onPrintTTN}
              disabled={false} // Прибираємо локальний стан, використовуємо глобальний з OrderView
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
          <div ref={noMoreOrdersRef} className="mt-3 w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <img src="/icons/party-horn.svg" className="w-15 h-15" />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-blue-900">
                  Всі підтверджені замовлення виконані!
                </h3>
                <p className="text-blue-900 text-sm">
                  Наразі більше немає замовлень для комплектування
                </p>
              </div>
              <Button
                onPress={() => { navigate('/orders'); }}
                className="mt-3 bg-primary text-white p-6 rounded-md text-base font-medium shadow-sm flex items-center justify-center gap-2"
              >
                Повернутися до всіх замовлень
                <DynamicIcon name="undo-2" size={20} strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderChecklist;
