import { playSoundChoice } from '../lib/soundUtils';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader, Chip, Button } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import OrderChecklist from '@/components/OrderChecklist';
import { DeviationButton } from '@/components/DeviationButton';
import { RightPanel } from '@/components/RightPanel';
import { BoxSelector } from '@/components/BoxSelector';

import { useAuth } from '../contexts/AuthContext';
import { Code } from '@heroui/code';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDateOnly, formatTimeOnly, getStatusColor, getStatusLabel } from '../lib/formatUtils';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';
import { shippingClientService } from '../services/ShippingService';
import ErrorBoundary from '../components/ErrorBoundary'; // Исправленный путь
import { addToast } from '@heroui/toast';
import PrinterService from '../services/printerService';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { WeightDisplayWidget } from '@/components/WeightDisplayWidget';

// Типы для данных комплектации
interface OrderChecklistItem {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done' | 'awaiting_confirmation' | 'confirmed';
  type: 'product' | 'box';
  boxSettings?: any;
  boxCount?: number;
  boxIndex?: number; // Индекс коробки (0, 1, 2...)
  portionsRange?: { start: number; end: number }; // Диапазон порций для коробки
  portionsPerBox?: number; // Количество порций на коробку
  sku?: string; // SKU товара для поиска по штрих-коду
  barcode?: string; // Штрих-код товара
}

interface OrderForAssembly {
  id: string | undefined;
  shipping: {
    carrier: string;
    trackingId: string;
    provider: string;
  };
  items: OrderChecklistItem[];
  totalPortions: number;
}

// Интерфейс для товара из базы данных
interface Product {
  id: number;
  sku: string;
  name: string;
  weight?: number; // Вес в граммах
  categoryId?: number; // ID категории для определения веса по умолчанию
  set: Array<{ id: string; quantity: number }> | null;
}

// Вспомогательная функция для расчета ожидаемого веса
const calculateExpectedWeight = (product: Product, quantity: number): number => {
  // Если есть вес в базе данных, используем его
  if (product.weight && product.weight > 0) {
    // Конвертируем граммы в килограммы
    return (product.weight * quantity) / 1000;
  }
  
  // Fallback на вес по умолчанию на основе категории
  // categoryId === 1 - первые блюда (420г), остальные - вторые блюда (330г)
  const defaultWeight = product.categoryId === 1 ? 420 : 330;
  return (defaultWeight * quantity) / 1000;
};

// Функция для разворачивания наборов товаров
const expandProductSets = async (orderItems: any[], apiCall: any): Promise<OrderChecklistItem[]> => {
  const expandedItems: { [key: string]: OrderChecklistItem } = {};
  
  // console.log('=== Початок розгортання наборів ===');
  // console.log(`Загальна кількість позицій замовлення: ${orderItems.length}`);
  
  for (const item of orderItems) {
    try {
      // console.log(`\n--- Обробка позиції: ${item.productName} (SKU: ${item.sku}, кількість: ${item.quantity}) ---`);
      
      // Получаем информацию о товаре по SKU
      const response = await apiCall(`/api/products/${item.sku}`);
      if (response.ok) {
        const product: Product = await response.json();
        // console.log(`✅ Отримано інформацію про товар: ${product.name}`, product);
        
        // Проверяем структуру product.set
        if (product.set) {
          // console.log(`🔍 Структура набору для ${product.name}:`, product.set);
        }
        
        if (product.set && Array.isArray(product.set) && product.set.length > 0) {
          // Это набор - разворачиваем его
          // console.log(`🔍 Це набір з ${product.set.length} компонентів:`);
          
          // Проверяем структуру set
          const validSetItems = product.set.filter(setItem => 
            setItem && typeof setItem === 'object' && setItem.id && setItem.quantity
          );
          
          if (validSetItems.length === 0) {
            console.warn(`⚠️ Набір ${product.name} не має валідних компонентів:`, product.set);
            // Добавляем как обычный товар
            const itemName = item.productName;
            if (expandedItems[itemName]) {
              expandedItems[itemName].quantity += item.quantity;
            } else {
              expandedItems[itemName] = {
                id: item.sku,
                name: itemName,
                quantity: item.quantity,
                expectedWeight: calculateExpectedWeight(product, item.quantity),
                status: 'default' as const,
                type: 'product',
                sku: item.sku,
                barcode: item.sku // Используем SKU как штрих-код для поиска
              };
            }
            continue;
          }
                      for (const setItem of validSetItems) {
              // Проверяем, что у setItem есть id (дополнительная проверка)
              if (!setItem.id) {
                console.warn(`⚠️ Компонент набору не має ID:`, setItem);
                continue;
              }
            
            try {
              // Получаем название компонента набора
              const componentResponse = await apiCall(`/api/products/${setItem.id}`);
              if (componentResponse.ok) {
                const component: Product = await componentResponse.json();
                const componentName = component.name;
                const totalQuantity = item.quantity * setItem.quantity;
                
                // console.log(`  ✅ ${componentName}: ${setItem.quantity} × ${item.quantity} = ${totalQuantity} порцій`);
                
                // Суммируем с существующими компонентами
                if (expandedItems[componentName]) {
                  const oldQuantity = expandedItems[componentName].quantity;
                  expandedItems[componentName].quantity += totalQuantity;
                  // console.log(`    🔄 Сумуємо з існуючими: ${oldQuantity} + ${totalQuantity} = ${expandedItems[componentName].quantity}`);
                } else {
                  expandedItems[componentName] = {
                    id: `${item.sku}_${setItem.id}`,
                    name: componentName,
                    quantity: totalQuantity,
                    expectedWeight: calculateExpectedWeight(component, totalQuantity),
                    status: 'default' as const,
                    type: 'product',
                    sku: setItem.id,
                    barcode: setItem.id // Используем ID компонента как штрих-код
                  };
                  // console.log(`    ➕ Додано новий компонент: ${componentName}`);
                }
              } else {
                console.warn(`⚠️ Не вдалося отримати інформацію про компонент набору: ${setItem.id} (статус: ${componentResponse.status})`);
                // Добавляем компонент с неизвестным названием
                const componentName = `Невідома страва (${setItem.id})`;
                const totalQuantity = item.quantity * setItem.quantity;
                
                if (expandedItems[componentName]) {
                  expandedItems[componentName].quantity += totalQuantity;
                } else {
                  expandedItems[componentName] = {
                    id: `${item.sku}_${setItem.id}`,
                    name: componentName,
                    quantity: totalQuantity,
                    expectedWeight: totalQuantity * 0.33, // Fallback для неизвестного компонента (330г)
                    status: 'default' as const,
                    type: 'product'
                  };
                }
              }
            } catch (componentError) {
              console.error(`❌ Помилка отримання компонента набору ${setItem.id}:`, componentError);
              // Добавляем компонент с неизвестным названием
              const componentName = `Невідома страва (${setItem.id})`;
              const totalQuantity = item.quantity * setItem.quantity;
              
              if (expandedItems[componentName]) {
                expandedItems[componentName].quantity += totalQuantity;
              } else {
                  expandedItems[componentName] = {
                    id: `${item.sku}_${setItem.id}`,
                    name: componentName,
                    quantity: totalQuantity,
                    expectedWeight: totalQuantity * 0.33, // Fallback для неизвестного компонента (330г)
                    status: 'default' as const,
                    type: 'product',
                    sku: setItem.id,
                    barcode: setItem.id // Используем ID компонента как штрих-код
                  };
              }
            }
          }
        } else {
          // Это обычный товар - добавляем как есть
          // console.log(`🍽️ Звичайний товар (не набір): ${item.productName}`);
          const itemName = item.productName;
          if (expandedItems[itemName]) {
            const oldQuantity = expandedItems[itemName].quantity;
            expandedItems[itemName].quantity += item.quantity;
            // console.log(`  🔄 Сумуємо з існуючими: ${oldQuantity} + ${item.quantity} = ${expandedItems[itemName].quantity}`);
          } else {
            expandedItems[itemName] = {
              id: item.sku,
              name: itemName,
              quantity: item.quantity,
              expectedWeight: calculateExpectedWeight(product, item.quantity),
              status: 'default' as const,
              type: 'product',
              sku: item.sku,
              barcode: item.sku // Используем SKU как штрих-код для поиска
            };
            // console.log(`  ➕ Додано новий товар: ${itemName}`);
          }
        }
      } else {
        // Если не удалось получить информацию о товаре, добавляем как есть
        console.warn(`⚠️ Не вдалося отримати інформацію про товар: ${item.sku} (статус: ${response.status})`);
        const itemName = item.productName;
        if (expandedItems[itemName]) {
          expandedItems[itemName].quantity += item.quantity;
        } else {
          expandedItems[itemName] = {
            id: item.sku,
            name: itemName,
            quantity: item.quantity,
            expectedWeight: item.quantity * 0.33, // Fallback для неизвестного товара (330г)
            status: 'default' as const,
            type: 'product',
            sku: item.sku,
            barcode: item.sku // Используем SKU как штрих-код для поиска
          };
        }
      }
    } catch (error) {
      console.error(`❌ Помилка розгортання набору для ${item.sku}:`, error);
      // В случае ошибки добавляем товар как есть
      const itemName = item.productName;
      if (expandedItems[itemName]) {
        expandedItems[itemName].quantity += item.quantity;
      } else {
        expandedItems[itemName] = {
          id: item.sku,
          name: itemName,
          quantity: item.quantity,
          expectedWeight: item.quantity * 0.33, // Fallback для ошибки (330г)
          status: 'default' as const,
          type: 'product',
          sku: item.sku,
          barcode: item.sku // Используем SKU как штрих-код для поиска
        };
      }
    }
  }
  
  // console.log('\n=== Результат розгортання ===');
  // console.log(`Розгорнуто товарів: ${Object.keys(expandedItems).length}`);
  // console.log(`Загальна кількість порцій: ${Object.values(expandedItems).reduce((sum, item) => sum + item.quantity, 0)}`);
  
  // Выводим детальную информацию о каждом развернутом элементе
  Object.entries(expandedItems).forEach(([name, item]) => {
    // console.log(`  📋 ${name}: ${item.quantity} порцій`);
  });
  
  // Преобразуем объект в массив и назначаем уникальные ID
  return Object.values(expandedItems).map((item, index) => ({
    ...item,
    id: (index + 1).toString()
  }));
};

// Функция для объединения коробок с товарами
const combineBoxesWithItems = (boxes: any[], items: OrderChecklistItem[], isReadyToShip: boolean = false): OrderChecklistItem[] => {
  // Проверяем, что у нас есть валидные коробки
  if (!boxes || boxes.length === 0) {
    return items;
  }

  // Создаем уникальные коробки, избегая дублирования
  const boxItems: OrderChecklistItem[] = boxes.map((box, index) => ({
    id: `box_${index + 1}`, // Используем уникальный индекс вместо box.id для избежания дублирования
    name: box.name || `Коробка ${index + 1}`, // Используем реальное название коробки из базы данных или fallback
    quantity: 1, // Количество коробок
    expectedWeight: Number(box.self_weight || box.weight || 0), // Собственный вес коробки (приоритет self_weight)
    status: isReadyToShip ? 'confirmed' : 'awaiting_confirmation' as const, // Коробка автоматически подтверждается для заказов id3
    type: 'box' as const,
    boxSettings: box,
    boxCount: 1,
    boxIndex: index, // Явно устанавливаем boxIndex равным индексу в массиве коробок
    portionsRange: box.portionsRange || { start: 0, end: 0 },
    portionsPerBox: box.portionsPerBox || 0
  }));
  


  // Если есть коробки, разделяем товары по коробкам
  if (boxes.length > 1 && boxes[0].portionsPerBox && boxes[0].portionsPerBox > 0 && !isReadyToShip) {
    // Обычная логика разделения по коробкам только для неготовых заказов
    const portionsPerBox = boxes[0].portionsPerBox;

    const productItems: OrderChecklistItem[] = [];

    let currentPortion = 0;
    let currentBoxIndex = 0;

    for (const item of items) {
      const itemPortions = item.quantity;

      if (currentPortion + itemPortions <= portionsPerBox) {
        // Товар помещается в текущую коробку
        productItems.push({
          ...item,
          id: `product_${currentBoxIndex}_${item.id}`,
          type: 'product' as const,
          boxIndex: currentBoxIndex
        });
        currentPortion += itemPortions;
      } else {
        // Товар не помещается, переходим к следующей коробке
        if (currentBoxIndex < boxes.length - 1) {
          currentBoxIndex++;
          currentPortion = 0;

          // Добавляем товар в новую коробку
          productItems.push({
            ...item,
            id: `product_${currentBoxIndex}_${item.id}`,
            type: 'product' as const,
            boxIndex: currentBoxIndex
          });
          currentPortion += itemPortions;
        } else {
          // Последняя коробка, добавляем как есть
          productItems.push({
            ...item,
            id: `product_${currentBoxIndex}_${item.id}`,
            type: 'product' as const,
            boxIndex: currentBoxIndex
          });

        }
      }
    }

    const result = [...boxItems, ...productItems];
    return result;
  }

  // Если коробка одна или нет коробок, или заказ готов к отправке, добавляем товары как обычно
  const productItems = items.map((item, index) => ({
    ...item,
    id: `product_${index + 1}`,
    type: 'product' as const,
    boxIndex: 0 // Все товары в первой коробке для заказов id3
  }));

  const result = [...boxItems, ...productItems];
  return result;
};


export default function OrderView() {
  const { externalId } = useParams<{ externalId: string }>();
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [equipmentState, equipmentActions] = useEquipmentFromAuth();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<OrderChecklistItem[]>([]);
  const [expandingSets, setExpandingSets] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<any[]>([]);
  const [boxesTotalWeight, setBoxesTotalWeight] = useState<number>(0);
  const [activeBoxIndex, setActiveBoxIndex] = useState<number>(0);
  const [checklistItems, setChecklistItems] = useState<OrderChecklistItem[]>([]);

  // --- Автоматичний запуск/зупинка ваги ---
  const [isWeightWidgetActive, setIsWeightWidgetActive] = useState(false);
  const [isWeightWidgetPaused, setIsWeightWidgetPaused] = useState(false);
  useEffect(() => {
    // Ваги активні, поки не всі товари/коробки зібрані
    const allCollected = checklistItems.length > 0 && checklistItems.every(item =>
      item.status === 'done' || item.status === 'confirmed' || item.status === 'success'
    );
    setIsWeightWidgetActive(!allCollected);
    setIsWeightWidgetPaused(allCollected);
  }, [checklistItems]);

  // --- Sound settings state ---
  type OrderSoundEvent = 'pending' | 'success' | 'done' | 'error';
  const [orderSoundSettings, setOrderSoundSettings] = useState<Record<OrderSoundEvent, string>>({
    pending: 'default',
    success: 'default',
    done: 'default',
    error: 'default',
  });

  // Завантажуємо налаштування звуків з API під час монтування
  useEffect(() => {
    fetch('/api/settings/equipment', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data?.data?.orderSoundSettings) {
          setOrderSoundSettings((prev) => ({ ...prev, ...data.data.orderSoundSettings }));
        }
      })
      .catch(() => {/* ignore */});
  }, []);

  // Універсальна функція для програвання звуку статусу з урахуванням налаштувань
  const playOrderStatusSound = (status: string) => {
    // status: 'pending' | 'success' | 'done' | 'error' | ...
    if (['pending', 'success', 'done', 'error'].includes(status)) {
      playSoundChoice(orderSoundSettings[status as OrderSoundEvent], status as OrderSoundEvent);
    }
  };

  // --- Sound notification effect ---
  const prevChecklistRef = useRef<OrderChecklistItem[]>([]);
  useEffect(() => {
    const prev = prevChecklistRef.current;
    // Compare previous and current checklistItems
    checklistItems.forEach((item, idx) => {
      const prevItem = prev.find((p) => p.id === item.id);
      if (!prevItem) return;
      if (prevItem.status !== item.status) {
        // Only play for tracked statuses
        if (["pending", "success", "done", "error"].includes(item.status)) {
          playOrderStatusSound(item.status);
        }
      }
    });
    prevChecklistRef.current = checklistItems;
  }, [checklistItems]);

  const [isPrintingTTN, setIsPrintingTTN] = useState(false); // Стан для відстеження друку ТТН
  const [showPrintTTN, setShowPrintTTN] = useState(false); // Стан для показу кнопки друку ТТН
  const [isLoadingNextOrder, setIsLoadingNextOrder] = useState(false); // Стан для завантаження наступного замовлення
  const [showNextOrder, setShowNextOrder] = useState(false); // Стан для показу кнопки "Наступне замовлення"
  const [isReadyToShip, setIsReadyToShip] = useState(false); // Стан для відстеження статусу id3
  const { isDebugMode } = useDebug(); // Режим відладки з контексту


  // Завантажуємо деталі замовлення при зміні externalId
  useEffect(() => {
    if (externalId) {
      fetchOrderDetails(externalId);
    }
  }, [externalId]);

  // Оновлюємо title сторінки при зміні замовлення
  useEffect(() => {
    if (order) {
      const date = order.orderDate ? ` від ${formatDateOnly(order.orderDate)}` : '';
      const status = order.status ? ` [${getStatusLabel(order.status)}]` : '';
      document.title = `Замовлення №${order.orderNumber || externalId}${date}${status} | NK Backoffice`;
    }
  }, [order, externalId]);

  // Обробка сканування штрих-кодів
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => Date.now() - 3000); // Ініціалізуємо в минулому
  const SCAN_COUNTDOWN = 2000; // 2 секунди між скануваннями (повинно збігатися з BarcodeScannerService)

  // Запобігання дублікації toast сповіщень
  const lastToastTimestampsRef = useRef<Record<string, number>>({});
  const activeToastsRef = useRef<Set<string>>(new Set()); // Активні toast для запобігання дублікації
  const TOAST_COUNTDOWN = 3000; // 3 секунди між однаковими сповіщеннями
  const [debugMode, setDebugMode] = useState<boolean>(false); // Режим відладки - вимикає фільтр дублікатів

  // Ref для зберігання останнього обробленого коду (щоб уникнути повторної обробки)
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTimestampRef = useRef<number>(0);

  // Функція для показу toast з запобіганням дублікації
  const showToastWithCountdown = useCallback((options: Parameters<typeof addToast>[0], toastKey: string) => {
    const currentTime = Date.now();
    const lastToastTime = lastToastTimestampsRef.current[toastKey] || 0;
    const timeSinceLastToast = currentTime - lastToastTime;

    // Перевіряємо, чи не показується вже такий toast
    if (activeToastsRef.current.has(toastKey)) {
      console.log(`🚫 Toast "${toastKey}" вже активний, пропускаємо`);
      return;
    }

    // У режимі налагодження або якщо минуло достатньо часу - показуємо toast
    if (debugMode || timeSinceLastToast >= TOAST_COUNTDOWN) {
      console.log(`🍞 Показуємо toast "${toastKey}" (пройшло ${timeSinceLastToast}мс)`);

      // Додаємо унікальний ID до toast, щоб уникнути дублювання в HeroUI
      const uniqueId = `${toastKey}-${currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      const toastWithId = {
        ...options,
        id: uniqueId
      };

      // Позначаємо toast як активний
      activeToastsRef.current.add(toastKey);

      addToast(toastWithId);
      lastToastTimestampsRef.current[toastKey] = currentTime;

      // Прибираємо з активних через timeout (трохи більше ніж час життя toast)
      const cleanupTimeout = (options.timeout || 10000) + 1000;
      setTimeout(() => {
        activeToastsRef.current.delete(toastKey);
        console.log(`🧹 Toast "${toastKey}" видалений з активних`);
      }, cleanupTimeout);
    } else {
      console.log(`🚫 Toast "${toastKey}" пропущений (залишилось ${TOAST_COUNTDOWN - timeSinceLastToast}мс)`);
    }
  }, [TOAST_COUNTDOWN, debugMode]);


  // useRef для зберігання актуальних значень без залежностей
  const checklistItemsRef = useRef<OrderChecklistItem[]>([]);
  const activeBoxIndexRef = useRef<number>(0);

  // Синхронізуємо ref з актуальними значеннями
  useEffect(() => {
    checklistItemsRef.current = checklistItems;
  }, [checklistItems]);

  useEffect(() => {
    activeBoxIndexRef.current = activeBoxIndex;
  }, [activeBoxIndex]);



  // Функція скидання стану сканування
  const resetScanState = useCallback(() => {
    setLastScannedCode('');
    setLastScanTimestamp(Date.now());
    // Скидаємо ref щоб наступний скан пройшов
    lastProcessedCodeRef.current = '';
    lastProcessedTimestampRef.current = 0;
    console.log('🔄 [OrderView] Стан сканування скинуто');
    addToast({
      title: "Стан скинуто",
      description: "Система готова до нового сканування",
      color: "primary",
      timeout: 2000
    });
  }, []);

  // Вычисляем ожидаемый вес для отображения в WeightDisplayWidget
  const getExpectedWeight = useCallback(() => {
    // 1. Коробка в статусе awaiting_confirmation
    const awaitingBox = checklistItems.find(item =>
      item.status === 'awaiting_confirmation' &&
      item.type === 'box' &&
      (item.boxIndex || 0) === activeBoxIndex
    );
    if (awaitingBox) {
      console.log('[getExpectedWeight] Коробка awaiting_confirmation:', awaitingBox.name, awaitingBox.expectedWeight);
      return awaitingBox.expectedWeight;
    }

    // 2. Товар в статусе pending
    const pendingItem = checklistItems.find(item =>
      item.status === 'pending' &&
      item.type === 'product' &&
      (item.boxIndex || 0) === activeBoxIndex
    );

    // 3. Собираем все элементы текущей коробки
    const currentBoxItems = checklistItems.filter(item =>
      (item.boxIndex || 0) === activeBoxIndex
    );

    let cumulativeWeight = 0;

    // 4. Вес коробки: считаем done, confirmed, success как взвешенные
    const boxItem = currentBoxItems.find(item => item.type === 'box');
    if (boxItem && ['done', 'confirmed', 'success'].includes(boxItem.status)) {
      cumulativeWeight += boxItem.expectedWeight;
      console.log('[getExpectedWeight] Коробка учтена:', boxItem.name, boxItem.status, boxItem.expectedWeight);
    }

    // 5. Вес товаров: считаем done и success как взвешенные
    const doneItems = currentBoxItems.filter(item =>
      item.type === 'product' && (item.status === 'done' || item.status === 'success')
    );
    doneItems.forEach(item => {
      cumulativeWeight += item.expectedWeight;
      console.log('[getExpectedWeight] Товар учтен:', item.name, item.status, item.expectedWeight);
    });

    // 6. Если есть pending, добавляем его вес
    if (pendingItem) {
      cumulativeWeight += pendingItem.expectedWeight;
      console.log('[getExpectedWeight] Текущий pending:', pendingItem.name, pendingItem.expectedWeight);
    } else {
      // 7. Если есть error, ожидаем именно его (НЕ переходим к следующему default)
      const errorItem = currentBoxItems.find(item =>
        item.type === 'product' && item.status === 'error'
      );
      if (errorItem) {
        cumulativeWeight += errorItem.expectedWeight;
        console.log('[getExpectedWeight] Ожидаем повторное взвешивание error:', errorItem.name, errorItem.expectedWeight);
      } else {
        // 8. Если нет error/pending, ищем следующий default
        const nextItem = currentBoxItems.find(item =>
          item.type === 'product' && item.status === 'default'
        );
        if (nextItem) {
          cumulativeWeight += nextItem.expectedWeight;
          console.log('[getExpectedWeight] Следующий default:', nextItem.name, nextItem.expectedWeight);
        }
      }
    }

    // 8. Логируем итоговое значение
    if (currentBoxItems.length > 0) {
      console.log('[getExpectedWeight] Итог:', cumulativeWeight);
      return cumulativeWeight;
    } else {
      console.log('[getExpectedWeight] В коробке нет товаров');
      return null;
    }
  }, [checklistItems, activeBoxIndex]);

  // Обработка изменения веса от WeightDisplayWidget
  const handleWeightChange = useCallback((weight: number | null) => {
    console.log('⚖️ [OrderView] Получен вес от WeightDisplayWidget:', weight);
    
    if (weight === null) {
      // console.log('⚖️ [OrderView] Вес null, игнорируем');
      return;
    }

    // Используем функциональное обновление состояния для получения актуальных данных
    setChecklistItems(prevItems => {
      // Функция для вычисления ожидаемого накопительного веса
      const calculateExpectedCumulativeWeight = (currentItem: any) => {
        const currentBoxItems = prevItems.filter(item => 
          (item.boxIndex || 0) === activeBoxIndex
        );

        // Суммируем вес коробки (если есть) + всех товаров в статусе done + текущий товар
        let cumulativeWeight = 0;

        // Добавляем вес коробки, если она в финальных статусах
        const boxItem = currentBoxItems.find(item => item.type === 'box');
        if (boxItem && (boxItem.status === 'done' || boxItem.status === 'confirmed' || boxItem.status === 'success')) {
          cumulativeWeight += boxItem.expectedWeight;
        }

        // Добавляем вес всех товаров в статусе done
        const doneItems = currentBoxItems.filter(item => 
          item.type === 'product' && item.status === 'done'
        );
        doneItems.forEach(item => {
          cumulativeWeight += item.expectedWeight;
        });

        // Добавляем вес текущего товара
        if (currentItem) {
          cumulativeWeight += currentItem.expectedWeight;
        }

        return cumulativeWeight;
      };

      // Сначала проверяем коробку со статусом 'awaiting_confirmation'
      const awaitingBox = prevItems.find(item => 
        item.status === 'awaiting_confirmation' && 
        item.type === 'box' && 
        (item.boxIndex || 0) === activeBoxIndex
      );

      // Проверяем, есть ли коробка в финальных статусах - если да, то не взвешиваем коробку
      const completedBox = prevItems.find(item => 
        (item.status === 'done' || item.status === 'success' || item.status === 'confirmed') && 
        item.type === 'box' && 
        (item.boxIndex || 0) === activeBoxIndex
      );

      // console.log('🔍 [OrderView] Поиск коробки для взвешивания:', {
      //   awaitingBox: awaitingBox?.name || 'не найдена',
      //   awaitingBoxStatus: awaitingBox?.status,
      //   completedBox: completedBox?.name || 'не найдена', 
      //   completedBoxStatus: completedBox?.status,
      //   activeBoxIndex
      // });

      if (awaitingBox && !completedBox) {
        // console.log('📦 [OrderView] Взвешиваем коробку:', awaitingBox.name);
        
        // Для коробки ожидаемый вес - это только вес коробки
        const expectedWeight = awaitingBox.expectedWeight;
        const tolerance = Math.max(expectedWeight * 0.2, 0.1); // 20% или минимум 100г
        const minWeight = expectedWeight - tolerance;
        const maxWeight = expectedWeight + tolerance;

        const isWeightValid = weight >= minWeight && weight <= maxWeight;

        // console.log('📦 [OrderView] Проверка веса коробки:', {
        //   expected: expectedWeight,
        //   received: weight,
        //   tolerance: tolerance,
        //   min: minWeight,
        //   max: maxWeight,
        //   isValid: isWeightValid
        // });

        // Если вес 0, не показываем ошибку до изменения веса
        if (weight === 0) {
          // console.log('📦 [OrderView] Вес коробки = 0, ждем изменения веса');
          return prevItems;
        }

        if (isWeightValid) {
          // Коробка взвешена - переводим в success, затем в done
          // console.log('✅ [OrderView] Коробка взвешена успешно');
          
          const updatedItems = prevItems.map(item => {
            if (item.id === awaitingBox.id) {
              // console.log('🔄 [OrderView] Коробка переводится в статус success:', awaitingBox.name);
              return { ...item, status: 'success' as const };
            }
            return item;
          });

          // Показываем уведомление об успехе
          addToast({
            title: "Коробка зважена",
            description: `${awaitingBox.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedWeight.toFixed(3)} кг)`,
            color: "success",
            timeout: 3000
          });

          // Через 1.5 секунды переводим в done
          setTimeout(() => {
            // console.log('🔄 [OrderView] Коробка переводится в статус done:', awaitingBox.name);
            setChecklistItems(prevItems =>
              prevItems.map(item => {
                if (item.id === awaitingBox.id) {
                  return { ...item, status: 'done' as const };
                }
                return item;
              })
            );

            // Автоматически выбираем первый товар в коробке
            setChecklistItems(prevItems => {
              const firstProduct = prevItems.find(item => 
                item.type === 'product' && 
                (item.boxIndex || 0) === activeBoxIndex && 
                item.status === 'default'
              );

              if (firstProduct) {
                // console.log('🔄 [OrderView] Автоматически выбираем первый товар:', firstProduct.name);
                return prevItems.map(item => {
                  if (item.id === firstProduct.id) {
                    return { ...item, status: 'pending' as const };
                  }
                  return item;
                });
              }
              return prevItems;
            });
          }, 1500);

          return updatedItems;
        } else {
          // Вес коробки не соответствует - переводим в error, затем в awaiting_confirmation
          // console.log('❌ [OrderView] Вес коробки не соответствует ожидаемому');
          
          const updatedItems = prevItems.map(item => {
            if (item.id === awaitingBox.id) {
              return { ...item, status: 'error' as const };
            }
            return item;
          });

          // Показываем уведомление об ошибке
          addToast({
            title: "Вага коробки не відповідає",
            description: `${awaitingBox.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedWeight.toFixed(3)} ± ${tolerance.toFixed(3)} кг)`,
            color: "warning",
            timeout: 5000
          });

          // Через 2 секунды возвращаем в awaiting_confirmation для повторного взвешивания
          setTimeout(() => {
            // console.log('🔄 [OrderView] Коробка возвращается в статус awaiting_confirmation:', awaitingBox.name);
            setChecklistItems(prevItems =>
              prevItems.map(item => {
                if (item.id === awaitingBox.id) {
                  return { ...item, status: 'awaiting_confirmation' as const };
                }
                return item;
              })
            );
          }, 2000);

          return updatedItems;
        }
      } else if (completedBox) {
        console.log('🚫 [OrderView] Коробка уже взвешена (статус:', completedBox.status, '), пропускаем взвешивание коробки:', completedBox.name);
      } else {
        console.log('ℹ️ [OrderView] Нет коробки для взвешивания, переходим к товарам');
      }

      // Если коробка не ожидает взвешивания, ищем товар со статусом 'pending'
      const pendingItem = prevItems.find(item => 
        item.status === 'pending' && 
        item.type === 'product' && 
        (item.boxIndex || 0) === activeBoxIndex
      );

      if (!pendingItem) {
        console.log('⚖️ [OrderView] Нет товара в статусе pending для взвешивания');
        console.log('🔍 [OrderView] Доступные товары в коробке:', 
          prevItems
            .filter(item => (item.boxIndex || 0) === activeBoxIndex)
            .map(item => ({ name: item.name, type: item.type, status: item.status }))
        );
        return prevItems;
      }

      // Вычисляем ожидаемый накопительный вес
      const expectedCumulativeWeight = calculateExpectedCumulativeWeight(pendingItem);
      const tolerance = pendingItem.expectedWeight * 0.1; // 10% допуск для товара
      const minWeight = expectedCumulativeWeight - tolerance;
      const maxWeight = expectedCumulativeWeight + tolerance;

      const isWeightValid = weight >= minWeight && weight <= maxWeight;

      console.log('⚖️ [OrderView] Взвешиваем товар:', pendingItem.name);
      console.log('⚖️ [OrderView] Накопительная проверка веса:', {
        currentItem: pendingItem.name,
        currentItemWeight: pendingItem.expectedWeight,
        expectedCumulative: expectedCumulativeWeight,
        received: weight,
        tolerance: tolerance,
        min: minWeight,
        max: maxWeight,
        isValid: isWeightValid
      });

      if (isWeightValid) {
        // Вес соответствует - переводим в success, затем в done
        console.log('✅ [OrderView] Вес товара соответствует ожидаемому');
        
        const updatedItems = prevItems.map(item => {
          if (item.id === pendingItem.id) {
            return { ...item, status: 'success' as const };
          }
          return item;
        });

        // Показываем уведомление об успехе
        addToast({
          title: "Вага відповідає",
          description: `${pendingItem.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedCumulativeWeight.toFixed(3)} кг)`,
          color: "success",
          timeout: 3000
        });

        // Через 1.5 секунды переводим в done
        setTimeout(() => {
          setChecklistItems(prevItems =>
            prevItems.map(item => {
              if (item.id === pendingItem.id) {
                return { ...item, status: 'done' as const };
              }
              return item;
            })
          );

          // Автоматически выбираем следующий товар в коробке
          setChecklistItems(prevItems => {
            const nextItem = prevItems.find(item => 
              item.type === 'product' && 
              (item.boxIndex || 0) === activeBoxIndex && 
              item.status === 'default'
            );

            if (nextItem) {
              console.log('🔄 [OrderView] Автоматически выбираем следующий товар:', nextItem.name);
              return prevItems.map(item => {
                if (item.id === nextItem.id) {
                  return { ...item, status: 'pending' as const };
                }
                return item;
              });
            }
            return prevItems;
          });
        }, 1500);

        return updatedItems;
      } else {
        // Вес не соответствует - переводим в error
        console.log('❌ [OrderView] Вес товара не соответствует ожидаемому');
        
        const updatedItems = prevItems.map(item => {
          if (item.id === pendingItem.id) {
            return { ...item, status: 'error' as const };
          }
          return item;
        });

        // Показываем уведомление об ошибке
        addToast({
          title: "Вага не відповідає",
          description: `${pendingItem.name}: ${weight.toFixed(3)} кг (очікувано: ${expectedCumulativeWeight.toFixed(3)} ± ${tolerance.toFixed(3)} кг)`,
          color: "danger",
          timeout: 5000
        });

        // Через 2 секунды возвращаем в pending для повторного взвешивания
        setTimeout(() => {
          console.log('🔄 [OrderView] Товар возвращается в статус pending:', pendingItem.name);
          setChecklistItems(prevItems =>
            prevItems.map(item => {
              if (item.id === pendingItem.id) {
                return { ...item, status: 'pending' as const };
              }
              return item;
            })
          );
        }, 2000);

        return updatedItems;
      }
    });
  }, [activeBoxIndex, addToast]);

  const { user } = useAuth();

  // Обновленная функция печати ТТН
  const handlePrintTTN = useCallback(async () => {
    if (!order?.ttn || !order?.provider) {
      alert('ТТН або провайдер не знайдені в даних замовлення');
      return;
    }

    if (isPrintingTTN) {
      return;
    }

    try {
      setIsPrintingTTN(true);

      const canUseDirectPrint = equipmentState.config?.printer?.enabled && equipmentState.config?.printer?.name;

      await shippingClientService.printTTN({
        ttn: order.ttn,
        provider: order.provider as 'novaposhta' | 'ukrposhta',
        printerName: canUseDirectPrint ? equipmentState.config.printer.name : undefined
      });

      setTimeout(() => {
        setShowNextOrder(true);
      }, 2000);

    } catch (error) {
      console.error('❌ Ошибка печати ТТН:', error);
      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';
      alert(`Помилка друку ТТН: ${errorMessage}`);
    } finally {
      setIsPrintingTTN(false);
    }
  }, [order?.ttn, order?.provider, isPrintingTTN, equipmentState.config]);

  // Функция для перехода к следующему заказу
  const handleNextOrder = useCallback(async () => {
    console.log('🚀 [NEXT ORDER] Нажата кнопка "Наступне замовлення"');
    console.log('📋 [NEXT ORDER] Текущий externalId:', externalId);
    console.log('⏳ [NEXT ORDER] isLoadingNextOrder:', isLoadingNextOrder);

    if (!externalId || isLoadingNextOrder) {
      console.log('❌ [NEXT ORDER] Прерываем выполнение: externalId отсутствует или уже выполняется');
      return;
    }

    try {
      console.log('🔄 [NEXT ORDER] Начинаем выполнение...');
      setIsLoadingNextOrder(true);

      // 1. Получаем список заказов для нахождения следующего
      console.log('📊 [NEXT ORDER] Шаг 1: Получаем список заказов...');
      const response = await apiCall('/api/orders?limit=100&sortBy=orderDate&sortOrder=desc');
      console.log('📊 [NEXT ORDER] Ответ от API:', response.ok ? 'OK' : 'ERROR', response.status);

      if (!response.ok) {
        throw new Error('Не вдалося отримати список замовлень');
      }

      const ordersData = await response.json();
      const orders = ordersData.data;
      console.log('📊 [NEXT ORDER] Получено заказов:', orders.length);
      console.log('📊 [NEXT ORDER] Первые 3 заказа:', orders.slice(0, 3).map(o => ({ id: o.externalId, number: o.orderNumber })));

      // 2. Находим текущий заказ в списке
      console.log('🔍 [NEXT ORDER] Шаг 2: Ищем текущий заказ в списке...');
      const currentOrderIndex = orders.findIndex((order: any) => order.externalId === externalId);
      console.log('🔍 [NEXT ORDER] Индекс текущего заказа:', currentOrderIndex);

      if (currentOrderIndex === -1) {
        throw new Error('Поточне замовлення не знайдено в списку');
      }

      console.log('✅ [NEXT ORDER] Текущий заказ найден:', {
        externalId: orders[currentOrderIndex].externalId,
        orderNumber: orders[currentOrderIndex].orderNumber,
        index: currentOrderIndex
      });

      // 3. Определяем следующий заказ
      console.log('🎯 [NEXT ORDER] Шаг 3: Определяем следующий заказ...');
      let nextOrderIndex = currentOrderIndex + 1;
      console.log('🎯 [NEXT ORDER] Предварительный индекс следующего заказа:', nextOrderIndex);

      if (nextOrderIndex >= orders.length) {
        // Если это последний заказ, переходим к первому
        console.log('🔄 [NEXT ORDER] Достигнут конец списка, переходим к первому заказу');
        nextOrderIndex = 0;
      }

      const nextOrder = orders[nextOrderIndex];
      console.log('✅ [NEXT ORDER] Следующий заказ определен:', {
        externalId: nextOrder.externalId,
        orderNumber: nextOrder.orderNumber,
        index: nextOrderIndex,
        isFirstOrder: nextOrderIndex === 0 && currentOrderIndex === orders.length - 1
      });

      // 4. Меняем статус текущего заказа на "id3" (Готове до видправки)
      console.log('📝 [NEXT ORDER] Шаг 4: Меняем статус текущего заказа...');
      const statusPayload = { status: 'id3' };
      console.log('📝 [NEXT ORDER] Отправляем статус:', statusPayload);

      const statusResponse = await apiCall(`/api/orders/${externalId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statusPayload),
      });

      console.log('📝 [NEXT ORDER] Ответ от API статуса:', statusResponse.ok ? 'OK' : 'ERROR', statusResponse.status);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.warn('⚠️ [NEXT ORDER] Не удалось обновить статус в SalesDrive:', errorText);
        // Продолжаем, даже если обновление статуса не удалось
      } else {
        // Проверяем результат обновления статуса
        const statusData = await statusResponse.json();
        if (statusData.success) {
          if (statusData.salesDriveUpdated) {
            console.log('✅ [NEXT ORDER] Статус заказа успешно обновлен в SalesDrive на "id3" (Готове до видправки)');
          } else {
            console.warn('⚠️ [NEXT ORDER] Статус обновлен локально, но не удалось обновить в SalesDrive');
          }
        } else {
          console.warn('⚠️ [NEXT ORDER] Ошибка при обновлении статуса:', statusData.error);
        }
      }

      // 5. Переходим к следующему заказу без перезагрузки страницы
      console.log('🏁 [NEXT ORDER] Шаг 5: Переходим к следующему заказу...');
      const nextOrderUrl = `/orders/${nextOrder.externalId}`;
      console.log('🏁 [NEXT ORDER] URL следующего заказа:', nextOrderUrl);

      navigate(nextOrderUrl);
      console.log('✅ [NEXT ORDER] Навигация выполнена успешно');

      // Сбрасываем состояние кнопки для следующего заказа
      setShowNextOrder(false);
      console.log('🔄 [NEXT ORDER] Состояние кнопки сброшено');

    } catch (error) {
      console.error('❌ [NEXT ORDER] Ошибка перехода к следующему заказу:', error);
      console.error('❌ [NEXT ORDER] Детали ошибки:', {
        message: error instanceof Error ? error.message : 'Неизвестная ошибка',
        stack: error instanceof Error ? error.stack : undefined
      });
      alert(`Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    } finally {
      console.log('🏁 [NEXT ORDER] Завершение выполнения функции');
      setIsLoadingNextOrder(false);
    }
  }, [externalId, apiCall, isLoadingNextOrder, navigate]);

  // useEffect(() => {
  //   if (externalId) {
  //     fetchOrderDetails(externalId);
  //   }
  // }, [externalId]);

  // Функция для имитации сканирования
  const handleSimulateScan = useCallback((itemId: string) => {
    setChecklistItems(prevItems =>
      prevItems.map(item => {
        if (item.id === itemId) {
          return { ...item, status: 'pending' };
        }
        // Сбрасываем статус других элементов в default
        if (item.status === 'pending' && (item.boxIndex || 0) === activeBoxIndex) {
          return { ...item, status: 'default' as const };
        }
        return item;
      })
    );

    // Запускаем активный polling при переходе в pending статус
    if (equipmentState.isScaleConnected) {
      equipmentActions.startActivePolling();
    } else {
      equipmentActions.startReservePolling();
    }
  }, [activeBoxIndex, equipmentState.isScaleConnected]); // Убрана зависимость equipmentActions

  // Функция для установки статуса awaiting_confirmation для коробки
  const setBoxAwaitingConfirmation = useCallback((boxId: string) => {
    setChecklistItems(prevItems =>
      prevItems.map(item => {
        if (item.id === boxId && item.type === 'box') {
          return { ...item, status: 'awaiting_confirmation' as const };
        }
        return item;
      })
    );

    // Запускаем активный polling при установке awaiting_confirmation для коробки
    if (equipmentState.isScaleConnected) {
      equipmentActions.startActivePolling();
    } else {
      equipmentActions.startReservePolling();
    }
  }, [equipmentState.isScaleConnected]); // Убрана зависимость equipmentActions





  // Мемоизированная функция обработки сканирования (без зависимостей от checklistItems и activeBoxIndex)
  const handleBarcodeScan = useCallback((scannedCode: string) => {
    const currentTime = Date.now();

    // Проверяем, не обрабатывали ли мы уже этот код
    const isAlreadyProcessed = scannedCode === lastProcessedCodeRef.current &&
                               currentTime - lastProcessedTimestampRef.current < SCAN_COUNTDOWN;

    if (isAlreadyProcessed && !debugMode) {
      console.log('⏳ [OrderView] Код уже обработан недавно:', scannedCode);
      return;
    }

    // Обновляем ref
    lastProcessedCodeRef.current = scannedCode;
    lastProcessedTimestampRef.current = currentTime;

    // Обновляем состояние для совместимости с остальным кодом
    setLastScanTimestamp(currentTime);
    setLastScannedCode(scannedCode);

    console.log('📱 [OrderView] Новое сканирование:', scannedCode);

    // Получаем актуальные данные из ref
    const currentChecklistItems = checklistItemsRef.current;
    const currentActiveBoxIndex = activeBoxIndexRef.current;

    // Проверяем, взвешена ли текущая коробка
    const currentBox = currentChecklistItems.find(item =>
      item.type === 'box' && (item.boxIndex || 0) === currentActiveBoxIndex
    );
    const isCurrentBoxConfirmed = currentBox?.status === 'confirmed' || currentBox?.status === 'done';

    // Отладка проверки статуса коробки
    console.log('🔍 [OrderView] Проверка статуса коробки:', {
      activeBoxIndex: currentActiveBoxIndex,
      currentBoxFound: !!currentBox,
      currentBoxStatus: currentBox?.status,
      currentBoxName: currentBox?.name,
      isCurrentBoxConfirmed,
      checklistItemsCount: currentChecklistItems.length,
      boxItems: currentChecklistItems.filter(item => item.type === 'box').map(item => ({
        name: item.name,
        status: item.status,
        boxIndex: item.boxIndex
      }))
    });

    // Если коробка не взвешена, игнорируем сканирование
    // Коробка считается взвешенной если она имеет статус 'done' или 'confirmed'
    const isBoxWeighed = currentBox?.status === 'confirmed' || currentBox?.status === 'done';

    if (!isBoxWeighed) {
      console.log('🚫 [OrderView] Сканирование заблокировано - коробка не взвешена');
      showToastWithCountdown({
        title: "Спочатку зважте коробку",
        description: "Не можна сканувати товари, поки коробка не буде зважена",
        color: "warning",
        timeout: 3000
      }, "box-not-weighed");
      return;
    }

    // Ищем товар по SKU
    const foundItem = currentChecklistItems.find(item => item.sku === scannedCode);

    if (foundItem) {
      console.log('✅ [OrderView] Найден товар:', foundItem.name);

      // Проверяем, не имеет ли товар уже статус 'done' - ЗАПРЕЩАЕМ сканирование
      if (foundItem.status === 'done') {
        console.log('🚫 [OrderView] Запрещено сканировать товар в статусе done:', foundItem.name);
        showToastWithCountdown({
          title: "Сканування заборонено",
          description: `${foundItem.name} вже завершено - сканування заборонено`,
          color: "danger",
          timeout: 3000
        }, `scan-forbidden-${foundItem.id}`);
        return;
      }

      // Проверяем, что товар не в статусе 'awaiting_confirmation' (коробки)
      if (foundItem.type === 'box' && foundItem.status !== 'awaiting_confirmation') {
        console.log('🚫 [OrderView] Коробки не сканируются, кроме awaiting_confirmation:', foundItem.name);
        showToastWithCountdown({
          title: "Сканування заборонено",
          description: "Коробки не можна сканувати",
          color: "warning",
          timeout: 3000
        }, `box-scan-forbidden-${foundItem.id}`);
        return;
      }

      // Проверяем, что товар находится в активной коробке
      if ((foundItem.boxIndex || 0) !== currentActiveBoxIndex) {
        console.log('🚫 [OrderView] Товар не в активной коробке:', foundItem.name);
        showToastWithCountdown({
          title: "Неправильна коробка",
          description: `${foundItem.name} не в поточній коробці`,
          color: "warning",
          timeout: 3000
        }, `wrong-box-${foundItem.id}`);
        return;
      }

      // ТОЧНО ТАКАЯ ЖЕ ЛОГИКА КАК В handleItemClick:
      // 1. Устанавливаем статус 'pending' для найденного товара
      setChecklistItems(prevItems =>
        prevItems.map(item => {
          if (item.id === foundItem.id) {
            return { ...item, status: 'pending' as const };
          }
          // 2. Сбрасываем статус других элементов в default только в активной коробке
          if (item.status === 'pending' && (item.boxIndex || 0) === currentActiveBoxIndex) {
            return { ...item, status: 'default' as const };
          }
          return item;
        })
      );
      

      // Показываем уведомление
      addToast({
        title: "Штрих-код відскановано",
        description: `${foundItem.name} вибрано для комплектації`,
        color: "success",
        timeout: 2000
      });

    } else {
      console.log('❌ [OrderView] Товар не найден:', scannedCode);

      // Показываем уведомление об ошибке
      showToastWithCountdown({
        title: "Товар не знайдено",
        description: `Штрих-код ${scannedCode} не відповідає жодному товару`,
        color: "warning",
        timeout: 3000
      }, `item-not-found-${scannedCode}`);
    }
  }, [debugMode, SCAN_COUNTDOWN, showToastWithCountdown, addToast, setLastScanTimestamp, setLastScannedCode]);

  // useEffect только для вызова сканирования при изменении lastBarcode
  useEffect(() => {
    if (equipmentState.lastBarcode) {
      handleBarcodeScan(equipmentState.lastBarcode.code);
      // Сбрасываем lastBarcode после обработки, чтобы избежать повторных срабатываний
      equipmentActions.resetScanner();
    }
  }, [equipmentState.lastBarcode, handleBarcodeScan, equipmentState.isScaleConnected]); // Убираем equipmentActions

    // Обработчик изменения коробок
  const handleBoxesChange = useCallback((boxes: any[], totalWeight: number, boxesInfo?: any) => {
    // Проверяем, что у нас есть валидные коробки и товары
    if (!boxes || boxes.length === 0 || expandedItems.length === 0) {
      console.log('📦 OrderView: Пропускаем обновление коробок - нет коробок или товаров');
      return;
    }

    // Сначала обновляем информацию о коробках
    let updatedBoxes = boxes;
    if (boxesInfo) {
      updatedBoxes = boxes.map((box, index) => ({
        ...box,
        boxIndex: index,
        portionsRange: boxesInfo.boxPortionsRanges[index],
        portionsPerBox: boxesInfo.portionsPerBox
      }));
    }

    setSelectedBoxes(updatedBoxes);
    setBoxesTotalWeight(totalWeight);
    setActiveBoxIndex(0); // Сбрасываем активную коробку при изменении

    // Используем expandedItems как базовые товары без коробок
    const itemsWithoutBoxes = expandedItems.filter(item => item.type !== 'box');

    // Объединяем новые коробки с товарами
    const combinedItems = combineBoxesWithItems(updatedBoxes, itemsWithoutBoxes, isReadyToShip);

    // Если заказ готов к отправке, применяем статусы done ко всем товарам
    const finalItems = isReadyToShip ? combinedItems.map(item => {
      if (item.type === 'product') {
        console.log(`📦 Применяем статус done для товара при обновлении коробок: ${item.name}`);
        return { ...item, status: 'done' as const };
      }
      return item;
    }) : combinedItems;

    // console.log('📦 Финальный чек-лист после обновления коробок:', finalItems.map(item => `${item.name} (${item.type}): ${item.status}`));
    setChecklistItems(finalItems);

  }, [expandedItems, isReadyToShip, equipmentState.isScaleConnected]); // Убираем equipmentActions

  const fetchOrderDetails = async (id: string) => {
    try {
      setLoading(true);
      setChecklistItems([]);
      // Сбрасываем состояние кнопки "Наступне замовлення" при загрузке нового заказа
      setShowNextOrder(false);
      const response = await apiCall(`/api/orders/${id}`);
      const data = await response.json();
      
      if (data.success) {
        setOrder(data.data);
        // Разворачиваем наборы товаров
        setExpandingSets(true);
        try {
          const expanded = await expandProductSets(data.data.items, apiCall);
          setExpandedItems(expanded);

          // Проверяем статус заказа - если id3 (На відправку), автоматически отмечаем как собранное
          const orderIsReadyToShip = data.data.status === '3' || data.data.status === 'id3';
          setIsReadyToShip(orderIsReadyToShip);
          let processedItems = expanded;

          if (orderIsReadyToShip) {
            console.log('📦 Заказ имеет статус id3 (На відправку) - автоматически отмечаем как собранный');
            console.log('📦 Количество товаров до обработки:', expanded.length);
            processedItems = expanded.map(item => {
              console.log(`📦 Устанавливаем статус done для товара: ${item.name} (${item.type})`);
              return {
                ...item,
                status: 'done' as const
              };
            });
            console.log('📦 Количество товаров после обработки:', processedItems.length);

            // Автоматически показываем кнопку печати ТТН для заказов со статусом id3
            setShowPrintTTN(true);
          }

          // Если есть выбранные коробки, объединяем их с товарами
          if (selectedBoxes.length > 0) {
            const itemsWithoutBoxes = processedItems.filter(item => item.type !== 'box');
            const combinedItems = combineBoxesWithItems(selectedBoxes, itemsWithoutBoxes, orderIsReadyToShip);
            
            // Проверяем, что combinedItems содержит валидные данные
            if (combinedItems && combinedItems.length > 0) {
              setChecklistItems(combinedItems);

            } else {
              console.log('📦 OrderView: combinedItems пустой, используем processedItems');
              setChecklistItems(processedItems);
            }
          } else {
            // Инициализируем checklistItems с обработанными товарами
            setChecklistItems(processedItems);
          }
        } catch (error) {
          console.error('Error expanding product sets:', error);
          // В случае ошибки используем оригинальные товары
          const isReadyToShipFallback = data.data.status === '3' || data.data.status === 'id3';
          const fallbackItems = data.data.items.map((item: any, index: number) => ({
            id: (index + 1).toString(),
            name: item.productName,
            quantity: item.quantity,
            expectedWeight: item.quantity * 0.33, // Fallback для ошибки разворачивания (330г)
            status: isReadyToShipFallback ? 'done' : 'default' as const,
            type: 'product'
          }));

          setExpandedItems(fallbackItems);

          // Если есть выбранные коробки, объединяем их с товарами
          if (selectedBoxes.length > 0) {
            const itemsWithoutBoxes = fallbackItems.filter(item => item.type !== 'box');
            const combinedItems = combineBoxesWithItems(selectedBoxes, itemsWithoutBoxes, isReadyToShipFallback);
            
            // Проверяем, что combinedItems содержит валидные данные
            if (combinedItems && combinedItems.length > 0) {
              setChecklistItems(combinedItems);

            } else {
              console.log('📦 OrderView: combinedItems пустой (fallback), используем fallbackItems');
              setChecklistItems(fallbackItems);
            }
          } else {
            setChecklistItems(fallbackItems);
          }

          if (isReadyToShipFallback) {
            setShowPrintTTN(true);
          }
        } finally {
          setExpandingSets(false);
        }
      } else {
        console.error('Failed to fetch order:', data.error);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setLoading(false);
    }
  };

  // Подготавливаем данные для комплектации
  const totalPortions = useMemo(() =>
    expandedItems.reduce((sum, item) => sum + item.quantity, 0),
    [expandedItems]
  );


  const orderForAssembly: OrderForAssembly = {
    id: externalId,
    shipping: {
      carrier: order?.shippingMethod || 'Нова Пошта',
      trackingId: order?.ttn || 'Не вказано',
      provider: order?.provider || 'novaposhta', // default provider
    },
    items: expandedItems,
    totalPortions: totalPortions,
  };

  // Анализируем заказ для отображения информации о наборах
  const analyzeOrder = () => {
    if (!order?.items) return null;
    
    const analysis = {
      totalItems: order.items.length,
      expandedItems: expandedItems.length,
      hasSets: false,
      setsInfo: [] as Array<{name: string, quantity: number, sku: string}>,
      individualItems: [] as Array<{name: string, quantity: number, sku: string}>
    };
    
    order.items.forEach((item: any) => {
      // Здесь мы не можем точно определить, является ли товар набором,
      // так как эта информация получается асинхронно
      // Но можем показать исходные данные
      if (item.productName.toLowerCase().includes('набір') || 
          item.productName.toLowerCase().includes('комплект') ||
          item.productName.toLowerCase().includes('(к)')) {
        analysis.hasSets = true;
        analysis.setsInfo.push({
          name: item.productName,
          quantity: item.quantity,
          sku: item.sku || 'N/A'
        });
      } else {
        analysis.individualItems.push({
          name: item.productName,
          quantity: item.quantity,
          sku: item.sku || 'N/A'
        });
      }
    });
    
    return analysis;
  };

  const orderAnalysis = analyzeOrder();

  // Проверяем, есть ли товары в заказе
  const hasItems = order?.items && order.items.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center text-gray-500">
        Замовлення не знайдено
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-primary font-inter text-3xl font-semibold leading-[100%] tracking-[-0.64px] h-10 flex items-center gap-4">
        <Button
          color="secondary"
          variant="flat"
          className="text-neutral-500 min-w-fit"
          onPress={() => navigate("/orders")}
        >
          <DynamicIcon name="arrow-left" size={20} />
        </Button>
        <span>
          Замовлення №{order.orderNumber || externalId}
          {order.orderDate && (
            <span className="font-normal text-xl ml-3 text-gray-500">
              від {formatDateOnly(order.orderDate)}
            </span>
          )}
        </span>
        {order.status && (
          <Chip
            size="md"
            variant="flat"
            classNames={{
              base: getStatusColor(order.status) + " shadow-container",
              content: "font-semibold",
            }}
          >
            {getStatusLabel(order.status)}
          </Chip>
        )}
      </h1>
      {/* Блок комплектации */}
      <div className="flex flex-col xl:flex-row items-start gap-8 w-full">
        {/* Левая колонка - Чек-лист комплектации */}
        <div className="w-full max-w-5xl">
          {/* Чек-лист комплектації */}
          {!hasItems ? (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-gray-600 text-lg mb-2">У замовленні немає товарів</p>
              <p className="text-gray-500">Склад замовлення порожній або не вказаний</p>
            </div>
          ) : expandingSets ? (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Розгортаємо набори товарів...</p>
              <p className="text-sm text-gray-500 mt-2">Це може зайняти кілька секунд</p>
            </div>
          ) : (
            <ErrorBoundary>
              <OrderChecklist
                key={`checklist-${equipmentState.config?.scale?.connectionStrategy}`}
                items={checklistItems}
                totalPortions={orderForAssembly.totalPortions}
                activeBoxIndex={activeBoxIndex}
                onActiveBoxChange={setActiveBoxIndex}
                onItemStatusChange={(itemId, status) => {
                  setChecklistItems(prevItems =>
                    prevItems.map(item => {
                      if (item.id === itemId) {
                        // Дозволяємо лише переведення у 'pending' по кліку
                        return { ...item, status: 'pending' };
                      }
                      // Скидаємо інші товари у цій коробці з 'pending' у 'default'
                      if (item.status === 'pending' && (item.boxIndex || 0) === activeBoxIndex) {
                        return { ...item, status: 'default' };
                      }
                      return item;
                    })
                  );
                  // Запускаємо polling ваги, якщо потрібно
                  if (equipmentState.isScaleConnected) {
                    equipmentActions.startActivePolling();
                  } else {
                    equipmentActions.startReservePolling();
                  }
                }}
                onPrintTTN={handlePrintTTN}
                showPrintTTN={showPrintTTN}
                onNextOrder={handleNextOrder}
                showNextOrder={showNextOrder}
              />
            </ErrorBoundary>
          )}
          
        </div>
          
        {/* Правая колонка - Панель управления */}
        <div className="w-full xl:w-80">
          <RightPanel>
            
            {/* OrderTrackingNumber */}
            <div className="w-full">
              <div className="bg-neutral-50 p-4 rounded-lg">
                <div className="flex items-center gap-2.5 text-2xl font-mono tracking-wider text-primary">
                  {formatTrackingNumberWithIcon(orderForAssembly.shipping.trackingId, {
                    provider: orderForAssembly.shipping.provider,
                    iconSize: 'absolute',
                    iconSizeValue: '1.5rem',
                  })}
                </div>
              </div>
            </div>

            {/* Віджет поточної ваги */}
            <WeightDisplayWidget
              onWeightChange={handleWeightChange}
              expectedWeight={getExpectedWeight()}
              className="w-full"
              isActive={isWeightWidgetActive}
              isPaused={isWeightWidgetPaused}
            />


            {/* Селектор коробок */}
            {hasItems && !expandingSets && (
              <BoxSelector
                totalPortions={orderForAssembly.totalPortions}
                onBoxesChange={handleBoxesChange}
                onActiveBoxChange={setActiveBoxIndex}
                activeBoxIndex={activeBoxIndex}
                className="bg-white p-6 rounded-lg shadow"
              />
            )}

            {/* Кнопка для позначення відхилень */}
            <DeviationButton />

          </RightPanel>
        </div>
      </div>

      {/* Блок деталей замовлення */}
    {(user && ['admin', 'boss'].includes(user.role)) && (
    <>
    <h2 className="text-xl font-semibold text-gray-800 mt-20 border-t border-gray-300 pt-16 mb-4">Деталі замовлення №{order.orderNumber || externalId} <Code color="danger" className="bg-danger-500 text-white text-base">лише для адміністраторів</Code></h2>
    
    <div className="flex w-full gap-6">
      <div className="flex flex-1 min-w-0 flex-col gap-6">
        {/* Основна інформація */}
        <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="info" size={20} className="text-gray-600 mr-2" />
          <h4 className="text-base font-semibold">Основна інформація</h4>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><strong>ID:</strong> {order.id}</p>
            <p><strong>Номер замовлення:</strong> {order.orderNumber || 'Не вказано'}</p>
            <p><strong>ТТН:</strong> {order.ttn || 'Не вказано'}</p>
            <p><strong>Кількість порцій:</strong> {order.quantity}</p>
            <p><strong>Статус:</strong> {order.statusText}</p>
          </div>
          <div>
            <p><strong>Дата створення:</strong> { order.orderDate ? formatDateOnly(order.orderDate) : 'Не вказано'} { order.orderDate && formatTimeOnly(order.orderDate)}</p>
            <p><strong>Сума:</strong> {order.totalPrice} грн</p>
            <p><strong>Спосіб доставки:</strong> {order.shippingMethod}</p>
            <p><strong>Спосіб оплати:</strong> {order.paymentMethod}</p>
            <p><strong>Коментар:</strong> {order.comment || 'Без коментаря'}</p>
          </div>
          </div>
        </CardBody>
        </Card>

        {/* Інформація про клієнта */}
        <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="user" size={20} className="text-gray-600 mr-2" />
          <h4 className="text-base font-semibold">Клієнт</h4>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><strong>ПІБ:</strong> {order.customerName || 'Не вказано'}</p>
            <p><strong>Телефон:</strong> {order.customerPhone || 'Не вказано'}</p>
          </div>
          <div>
            <p><strong>Адреса доставки:</strong></p>
            <p className="text-sm text-gray-600">{order.deliveryAddress || 'Не вказано'}</p>
          </div>
          </div>
        </CardBody>
        </Card>

        {/* Склад замовлення */}
        <Card>
        <CardHeader className="border-b border-gray-200">
          <DynamicIcon name="box" size={20} className="text-gray-600 mr-2" />
          <h4 className="text-base font-semibold">Склад замовлення</h4>
        </CardHeader>
        <CardBody>
          {!hasItems ? (
            <p className="text-gray-500 text-center py-4">Склад замовлення порожній</p>
          ) : order.items && order.items.length > 0 ? (
          <div className="space-y-2">
            {order.items.map((item: any, index: number) => (
            <div key={index} className="flex justify-between items-center p-3 bg-gray-50 border-l-4 border-gray-300 rounded">
              <div>
              <p className="font-medium">{item.productName}</p>
              <p className="text-sm text-gray-600">SKU: {item.sku}</p>
              </div>
              <div className="text-right">
              <p className="font-medium">{item.quantity} шт.</p>
              <p className="text-sm text-gray-600">{item.price} грн</p>
              </div>
            </div>
            ))}
          </div>
          ) : (
          <p className="text-gray-500">Склад замовлення не вказано</p>
          )}
        </CardBody>
        </Card>

      </div>

      {/* Сирі дані */}
      <div className="flex flex-1 min-w-0 flex-col gap-8">
        <Card className="flex-1">
        <CardHeader className="border-b border-gray-200">
                <DynamicIcon name="code" size={20} className="text-gray-600 mr-2" />
          <h4 className="text-base font-semibold">Сирі дані з SalesDrive API для замовлення №{order.orderNumber || externalId}</h4>
        </CardHeader>
        <CardBody>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto h-full font-mono">
            {JSON.stringify(order.rawData || order, null, 2)}
          </pre>
        </CardBody>
        </Card>
      </div>
    </div>
  	</>
  )}
    </div>
  );
}
