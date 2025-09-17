import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { useApi } from '../hooks/useApi';
import OrderChecklist from '@/components/OrderChecklist';
import OrderTrackingNumber from '@/components/OrderTrackingNumber';
import { DeviationButton } from '@/components/DeviationButton';
import { RightPanel } from '@/components/RightPanel';
import { BoxSelector } from '@/components/BoxSelector';
import { ScaleWeightDisplay } from '@/components/ScaleWeightDisplay';

import { useAuth } from '../contexts/AuthContext';
import { Code } from '@heroui/code';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDateOnly, formatTimeOnly } from '../lib/formatUtils';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { shippingClientService } from '../services/ShippingService';
import ErrorBoundary from '../components/ErrorBoundary'; // Исправленный путь
import { addToast } from '@heroui/toast';

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

  // Создаем уникальные коробки, избегая дублирования
  const boxItems: OrderChecklistItem[] = boxes.map((box, index) => ({
    id: `box_${index + 1}`, // Используем уникальный индекс вместо box.id для избежания дублирования
    name: box.name, // Используем реальное название коробки из базы данных
    quantity: 1, // Количество коробок
    expectedWeight: Number(box.self_weight || box.weight), // Собственный вес коробки (приоритет self_weight)
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
  const [weightTolerance, setWeightTolerance] = useState<{type: string, percentage: number, absolute: number}>({
    type: 'combined',
    percentage: 5,
    absolute: 20 // в граммах
  });

  // Отслеживаем предыдущий вес для расчета накопления
  const [previousWeight, setPreviousWeight] = useState<number>(0);
  const [lastWeighTimestamp, setLastWeighTimestamp] = useState<number>(0);

  const [lastEquipmentSync, setLastEquipmentSync] = useState<number>(0);
  const [isPrintingTTN, setIsPrintingTTN] = useState(false); // Состояние для отслеживания печати ТТН
  const [showPrintTTN, setShowPrintTTN] = useState(false)
  const [isLoadingNextOrder, setIsLoadingNextOrder] = useState(false); // Состояние загрузки следующего заказа
  const [showNextOrder, setShowNextOrder] = useState(false); // Состояние для показа кнопки "Наступне замовлення"
  const [isReadyToShip, setIsReadyToShip] = useState(false); // Состояние для отслеживания статуса id3
  const failedWeightsRef = useRef<Record<string, number>>({});

  const [isAwaitingWeightChange, setIsAwaitingWeightChange] = useState(false);
  const previousWeightOnSuccessRef = useRef<number | null>(null);

  // Обеспечиваем подключение весов на странице комплектации
  useEffect(() => {
    const ensureScaleConnection = async () => {
      if (!equipmentState.isSimulationMode && !equipmentState.isScaleConnected) {
        console.log('🔧 OrderView: Обеспечиваем подключение весов...');
        try {
          const connected = await equipmentActions.connectScale();
          if (connected) {
            console.log('✅ OrderView: Ваги успішно підключені');
          } else {
            console.log('❌ OrderView: Не вдалося підключити ваги');
          }
        } catch (error) {
          console.log('⚠️ OrderView: Помилка підключення ваг:', error);
        }
      }
    };

    // Запускаем проверку через 1 секунду после загрузки страницы
    const timer = setTimeout(ensureScaleConnection, 1000);
    return () => clearTimeout(timer);
  }, [equipmentState.isSimulationMode, equipmentState.isScaleConnected]); // Убираем equipmentActions

  // Загружаем настройки толерантности веса из базы данных
  useEffect(() => {
    const fetchWeightToleranceSettings = async () => {
      try {
        const response = await apiCall('/api/settings/weight-tolerance/values');
        if (response.ok) {
          const settings = await response.json();
          setWeightTolerance({
            type: settings.type || 'combined',
            percentage: settings.percentage || 5,
            absolute: settings.absolute || 20 // в граммах
          });
        }
      } catch (error) {
        console.error('Error fetching weight tolerance settings:', error);
        // Оставляем значение по умолчанию при ошибке
      }
    };

    fetchWeightToleranceSettings();

    // Сбрасываем previousWeight при загрузке страницы
    setPreviousWeight(0);
    setLastWeighTimestamp(0);

    // Cleanup функция при уходе со страницы
    return () => {
      console.log('🔄 OrderView: Уход со страницы, сбрасываем вес');
      setPreviousWeight(0);
      setLastWeighTimestamp(0);
    };
  }, []); // Убрана зависимость apiCall, которая вызывала бесконечный цикл

  // Сбрасываем вес при переходе к другому заказу
  useEffect(() => {
    console.log('🔄 OrderView: Изменение externalId, сбрасываем вес для нового заказа');
    setPreviousWeight(0);
    setLastWeighTimestamp(0);
    failedWeightsRef.current = {}; // Сбрасываем кэш неудачных взвешиваний
  }, [externalId]);

  useEffect(() => {
    if (externalId) {
      failedWeightsRef.current = {}; // Сбрасываем кэш неудачных взвешиваний
      fetchOrderDetails(externalId);
    }
  }, [externalId]);

  // После успешного взвешивания, этот useEffect будет ждать, пока вес не изменится (товар уберут)
  useEffect(() => {
    const currentWeight = equipmentState.currentWeight?.weight;
    if (
      isAwaitingWeightChange &&
      currentWeight !== undefined &&
      currentWeight !== null &&
      previousWeightOnSuccessRef.current !== null
    ) {
      // Ждем, пока вес не УВЕЛИЧИТСЯ, что означает добавление нового товара
      if (currentWeight > previousWeightOnSuccessRef.current + 0.01) { // Порог в 10г
        setIsAwaitingWeightChange(false);
        previousWeightOnSuccessRef.current = null;
        console.log('⚖️ OrderView: Weight has increased. Resuming automatic checks.');
      }
    }
  }, [equipmentState.currentWeight, isAwaitingWeightChange]);

  // Сбрасываем вес при завершении заказа (все товары done и вес близок к 0)
  useEffect(() => {
    const allProductsDone = checklistItems
      .filter(item => item.type === 'product')
      .every(item => item.status === 'done');

    const currentWeight = equipmentState.currentWeight?.weight || 0;
    const weightNearZero = Math.abs(currentWeight) < 0.01; // Вес близок к 0

    // Сбрасываем только если вес еще не сброшен
    if (allProductsDone && weightNearZero && previousWeight > 0) {
      console.log('🔄 OrderView: Заказ завершен и вес сброшен, сбрасываем previousWeight');
      setPreviousWeight(0);
      setLastWeighTimestamp(0);
    }
  }, [checklistItems, equipmentState.currentWeight?.weight, previousWeight]); // Убрали equipmentState.currentWeight из зависимостей

  // Обработка сканирования штрих-кодов
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number>(() => Date.now() - 3000); // Инициализируем в прошлом
  const SCAN_COOLDOWN = 2000; // 2 секунды между сканированиями (должно совпадать с BarcodeScannerService)

  // Предотвращение дублирования toast уведомлений
  const lastToastTimestampsRef = useRef<Record<string, number>>({});
  const activeToastsRef = useRef<Set<string>>(new Set()); // Активные toast для предотвращения дублирования
  const TOAST_COOLDOWN = 3000; // 3 секунды между одинаковыми уведомлениями
  const [debugMode, setDebugMode] = useState<boolean>(false); // Режим отладки - отключает фильтр дубликатов

  // Ref для хранения последнего обработанного кода (чтобы избежать повторной обработки)
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTimestampRef = useRef<number>(0);

  // Функция для показа toast с предотвращением дублирования
  const showToastWithCooldown = useCallback((options: Parameters<typeof addToast>[0], toastKey: string) => {
    const currentTime = Date.now();
    const lastToastTime = lastToastTimestampsRef.current[toastKey] || 0;
    const timeSinceLastToast = currentTime - lastToastTime;

    // Проверяем, не показывается ли уже такой toast
    if (activeToastsRef.current.has(toastKey)) {
      console.log(`🚫 Toast "${toastKey}" уже активен, пропускаем`);
      return;
    }

    // В режиме отладки или если прошло достаточно времени - показываем toast
    if (debugMode || timeSinceLastToast >= TOAST_COOLDOWN) {
      console.log(`🍞 Показываем toast "${toastKey}" (прошло ${timeSinceLastToast}мс)`);

      // Добавляем уникальный ID к toast, чтобы избежать дублирования в HeroUI
      const uniqueId = `${toastKey}-${currentTime}-${Math.random().toString(36).substr(2, 9)}`;
      const toastWithId = {
        ...options,
        id: uniqueId
      };

      // Помечаем toast как активный
      activeToastsRef.current.add(toastKey);

      addToast(toastWithId);
      lastToastTimestampsRef.current[toastKey] = currentTime;

      // Убираем из активных через timeout (немного больше чем время жизни toast)
      const cleanupTimeout = (options.timeout || 10000) + 1000;
      setTimeout(() => {
        activeToastsRef.current.delete(toastKey);
        console.log(`🧹 Toast "${toastKey}" очищен из активных`);
      }, cleanupTimeout);
    } else {
      console.log(`🚫 Toast "${toastKey}" пропущен (осталось ${TOAST_COOLDOWN - timeSinceLastToast}мс)`);
    }
  }, [TOAST_COOLDOWN, debugMode]);


  // useRef для хранения актуальных значений без зависимостей
  const checklistItemsRef = useRef<OrderChecklistItem[]>([]);
  const activeBoxIndexRef = useRef<number>(0);

  // Синхронизируем ref с актуальными значениями
  useEffect(() => {
    checklistItemsRef.current = checklistItems;
  }, [checklistItems]);

  useEffect(() => {
    activeBoxIndexRef.current = activeBoxIndex;
  }, [activeBoxIndex]);



  // Функция сброса состояния сканирования
  const resetScanState = useCallback(() => {
    setLastScannedCode('');
    setLastScanTimestamp(Date.now());
    // Сбрасываем ref чтобы следующий скан прошел
    lastProcessedCodeRef.current = '';
    lastProcessedTimestampRef.current = 0;
    console.log('🔄 [OrderView] Состояние сканирования сброшено');
    addToast({
      title: "Стан скинуто",
      description: "Система готова до нового сканування",
      color: "primary",
      timeout: 2000
    });
  }, []);

  const { user } = useAuth();

  // Обновленная функция печати ТТН
  const handlePrintTTN = useCallback(async () => {
    if (!order?.ttn || !order?.provider) {
      alert('ТТН або провайдер не знайдені в даних замовлення');
      return;
    }

    // Предотвращаем множественные вызовы
    if (isPrintingTTN) {
      return;
    }

    try {
      setIsPrintingTTN(true);

      await shippingClientService.downloadAndPrintTTN(
        order.ttn,
        order.provider as 'novaposhta' | 'ukrposhta'
      );

      // Показываем кнопку "Наступне замовлення" через 2 секунды после успешной печати
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
  }, [order?.ttn, order?.provider, order?.orderNumber, isPrintingTTN]);

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

  useEffect(() => {
    if (externalId) {
      fetchOrderDetails(externalId);
    }
  }, [externalId]);

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
    if (!equipmentState.isSimulationMode) {
      if (equipmentState.isScaleConnected) {
        equipmentActions.startActivePolling();
      } else {
        equipmentActions.startReservePolling();
      }
    }
  }, [activeBoxIndex, equipmentState.isSimulationMode, equipmentState.isScaleConnected]); // Убрана зависимость equipmentActions

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
    if (!equipmentState.isSimulationMode) {
      if (equipmentState.isScaleConnected) {
        equipmentActions.startActivePolling();
      } else {
        equipmentActions.startReservePolling();
      }
    }
  }, [equipmentState.isSimulationMode, equipmentState.isScaleConnected]); // Убрана зависимость equipmentActions

  // Функция расчета допустимой погрешности
  const calculateTolerance = useCallback((expectedWeight: number) => {
    let tolerance = 0;

    if (weightTolerance.type === 'percentage' || weightTolerance.type === 'combined') {
      // Процентная погрешность (expectedWeight в кг, рассчитываем в кг)
      tolerance += (expectedWeight * weightTolerance.percentage) / 100;
    }

    if (weightTolerance.type === 'absolute' || weightTolerance.type === 'combined') {
      // Абсолютная погрешность (в граммах, переводим в кг)
      tolerance += weightTolerance.absolute / 1000;
    }

    return tolerance;
  }, [weightTolerance]);

  // Функция для имитации взвешивания с реальным сравнением веса (сохраняем для совместимости)
  const handleSimulateWeigh = useCallback((itemId: string) => {
    const currentItem = checklistItems.find(item => item.id === itemId);
    if (!currentItem) return;

    // Рассчитываем ожидаемый вес в зависимости от типа элемента
    let expectedWeight = 0;
    let tolerance = 0;

    if (currentItem.type === 'box') {
      // Для коробки ожидаемый вес - это ее собственный вес
      expectedWeight = currentItem.expectedWeight;
      tolerance = calculateTolerance(expectedWeight);
    } else {
      // Для товара: вес коробки + вес всех завершенных товаров в этой коробке + вес текущего товара
      const boxItem = checklistItems.find(item =>
        item.type === 'box' &&
        (item.boxIndex || 0) === (currentItem.boxIndex || 0)
      );

      const boxWeight = boxItem ? boxItem.expectedWeight : 0;

      const completedProductsWeight = checklistItems
        .filter(item =>
          item.type === 'product' &&
          (item.boxIndex || 0) === (currentItem.boxIndex || 0) &&
          item.status === 'done'
        )
        .reduce((sum, item) => sum + item.expectedWeight, 0);

      expectedWeight = boxWeight + completedProductsWeight + currentItem.expectedWeight;
      tolerance = calculateTolerance(currentItem.expectedWeight);
    }

    // Имитируем вес с учетом накопления
    const randomError = (Math.random() - 0.5) * 2 * tolerance;
    const simulatedWeight = expectedWeight + randomError;

    // Проверяем, попадает ли вес в допустимый диапазон
    const weightDifference = Math.abs(simulatedWeight - expectedWeight);
    const isSuccess = weightDifference <= tolerance;

    setChecklistItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, status: isSuccess ? 'success' : 'error' } : item
      )
    );

    if (isSuccess) {
              setTimeout(() => {
          setChecklistItems(prevItems =>
            prevItems.map(item =>
              item.id === itemId ? { ...item, status: 'done' } : item
            )
          );

        // Если это коробка, не выбираем следующий элемент автоматически
        if (currentItem.type === 'box') {
          return;
        }

        // Автоматически выбираем первый доступный элемент (не по порядку, а первый доступный)
        const nextItem = checklistItems.find((item) =>
          item.status === 'default' &&
          (item.boxIndex || 0) === activeBoxIndex &&
          item.type === 'product'
        );

        if (nextItem) {
          handleSimulateScan(nextItem.id);
        }
      }, 1500);
    } else {
      // Возвращаемся к pending через 1 секунду при ошибке (ускорено в 2 раза)
      setTimeout(() => {
        setChecklistItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, status: 'pending' } : item
          )
        );
      }, 1000);
    }
  }, [checklistItems, activeBoxIndex, calculateTolerance]);

  // Функция для реального взвешивания товара с использованием данных с весов
  const handleRealWeigh = useCallback(async (itemId: string) => {
    const currentItem = checklistItems.find(item => item.id === itemId);
    if (!currentItem) return;

    try {
      console.log('⚖️ OrderView: Начинаем реальное взвешивание товара:', currentItem.name);
      
      // Запускаем активный polling при начале взвешивания
      if (equipmentState.isScaleConnected) {
        equipmentActions.startActivePolling();
      } else {
        equipmentActions.startReservePolling();
      }

      // Проверяем, подключены ли весы
      if (equipmentState.isSimulationMode) {
        console.log('🎭 OrderView: Режим симуляции - используем имитацию взвешивания');
        // В режиме симуляции вызываем функцию напрямую, без реального получения веса
        const currentItem = checklistItems.find(item => item.id === itemId);
        if (!currentItem) return;

        // Рассчитываем ожидаемый вес в зависимости от типа элемента
        let expectedWeight = 0;
        let tolerance = 0;

        if (currentItem.type === 'box') {
          // Для коробки ожидаемый вес - это ее собственный вес
          expectedWeight = currentItem.expectedWeight;
          tolerance = calculateTolerance(expectedWeight);
        } else {
          // Для товара: вес коробки + вес всех завершенных товаров в этой коробке + вес текущего товара
          const boxItem = checklistItems.find(item =>
            item.type === 'box' &&
            (item.boxIndex || 0) === (currentItem.boxIndex || 0)
          );

          const boxWeight = boxItem ? boxItem.expectedWeight : 0;

          const completedProductsWeight = checklistItems
            .filter(item =>
              item.type === 'product' &&
              (item.boxIndex || 0) === (currentItem.boxIndex || 0) &&
              item.status === 'done'
            )
            .reduce((sum, item) => sum + item.expectedWeight, 0);

          expectedWeight = boxWeight + completedProductsWeight + currentItem.expectedWeight;
          tolerance = calculateTolerance(currentItem.expectedWeight);
        }

        // Имитируем вес с учетом накопления
        const randomError = (Math.random() - 0.5) * 2 * tolerance;
        const simulatedWeight = expectedWeight + randomError;
        const weightDifference = Math.abs(simulatedWeight - expectedWeight);
        const isSuccess = weightDifference <= tolerance;

        setChecklistItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, status: isSuccess ? 'success' : 'error' } : item
          )
        );

        if (isSuccess) {
          // Обновляем предыдущий вес для следующего товара
          if (currentItem.type === 'box') {
            // Для коробки previousWeight = вес коробки
            setPreviousWeight(currentItem.expectedWeight);
          } else {
            // Для товара previousWeight = текущий вес на весах
            setPreviousWeight(simulatedWeight);
          }
          setLastWeighTimestamp(Date.now());

          addToast({
            title: "Вага підтверджена",
            description: `${currentItem.name}: ${simulatedWeight.toFixed(2)} кг (очікувалося ${expectedWeight.toFixed(2)} кг)`,
            color: "success",
            timeout: 2000
          });

          setTimeout(() => {
            setChecklistItems(prevItems =>
              prevItems.map(item =>
                item.id === itemId ? { ...item, status: 'done' } : item
              )
            );

            if (currentItem.type === 'box') {
              return;
            }

            // Выбираем первый доступный элемент (не по порядку, а первый доступный)
            const nextItem = checklistItems.find((item) =>
              item.status === 'default' &&
              (item.boxIndex || 0) === activeBoxIndex &&
              item.type === 'product'
            );

            if (nextItem) {
              handleSimulateScan(nextItem.id);
            }
          }, 1500);
        } else {
          addToast({
            title: "Невідповідність ваги",
            description: `${currentItem.name}: ${simulatedWeight.toFixed(2)} кг (очікувалося ${expectedWeight.toFixed(2)} кг ±${tolerance.toFixed(2)} кг)`,
            color: "danger",
            timeout: 4000
          });

          // Возвращаемся к pending через 1.5 секунды при ошибке (ускорено в 2 раза)
          setTimeout(() => {
            setChecklistItems(prevItems =>
              prevItems.map(item =>
                item.id === itemId ? { ...item, status: 'pending' } : item
              )
            );
            // Продолжаем активный polling для повторного взвешивания
          }, 1500);
        }
        return;
      }

      if (!equipmentState.isScaleConnected) {
        console.log('⚠️ OrderView: Ваги не подключены');
        addToast({
          title: "Ваги не підключені",
          description: "Підключіть ваги перед зважуванням товару",
          color: "warning",
          timeout: 3000
        });
        return;
      }

      // Проверяем, есть ли стабильные данные веса
      console.log('⚖️ OrderView: Checking weight state:', {
        hasCurrentWeight: !!equipmentState.currentWeight,
        currentWeight: equipmentState.currentWeight,
        isStable: equipmentState.currentWeight?.isStable,
        weightValue: equipmentState.currentWeight?.weight
      });

      if (!equipmentState.currentWeight || !equipmentState.currentWeight.isStable) {
        console.log('⚠️ OrderView: Вес нестабильный или отсутствует');
        addToast({
          title: "Вага нестабільна",
          description: "Зачекайте, поки вага стабілізується",
          color: "warning",
          timeout: 2000
        });
        return;
      }

      // Получаем текущий вес с весов
      // const weightData = await equipmentActions.getWeight();

      let weightData = equipmentState.currentWeight;
      const weightAge = weightData ? Date.now() - new Date(weightData.timestamp).getTime() : Infinity;

      // Обновляем вес, если он старше 1.5 секунд или отсутствует
      if (!weightData || weightAge > 1500) {
        console.log(`⚖️ OrderView: Вес устарел (${weightAge}ms) или отсутствует, обновляем...`);
        weightData = await equipmentActions.getWeight();
      } else {
        console.log(`⚖️ OrderView: Используем недавний вес из состояния (${weightAge}ms).`);
      }

      if (!weightData) {
        console.log('⚠️ OrderView: Не удалось получить вес с весов');
        addToast({
          title: "Помилка зважування",
          description: "Не вдалося отримати дані з ваг. Перевірте підключення.",
          color: "warning",
          timeout: 3000
        });
        return;
      }

      const actualWeight = weightData.weight;

      // Игнорируем проверку, если вес на весах практически нулевой
      if (actualWeight < 0.005) { // 5 грамм
        console.log(`⚖️ OrderView: Вес ${actualWeight.toFixed(3)} кг слишком мал, проверка игнорируется.`);
        return;
      }

      if (
        failedWeightsRef.current[itemId] !== undefined &&
        Math.abs(failedWeightsRef.current[itemId] - actualWeight) < 0.001
      ) {
        console.log(
          `⚖️ OrderView: Пропускаем проверку для ${
            currentItem.name
          }, вес ${actualWeight.toFixed(
            3
          )} кг уже был определен как неверный.`
        );
        return; // Прерываем выполнение, чтобы не создавать цикл
      }
      
      // Проверяем валидность полученного веса
      if (actualWeight > 1000) { // разумные границы для веса товара (убрали проверку на <= 0)
        console.log('⚠️ OrderView: Получен некорректный вес:', actualWeight);
        addToast({
          title: "Некоректна вага",
          description: `Отримано невірне значення: ${actualWeight.toFixed(2)} кг`,
          color: "danger",
          timeout: 3000
        });
        return;
      }

      // Рассчитываем ожидаемый вес в зависимости от типа элемента
      let expectedWeight = 0;
      let tolerance = 0;

      if (currentItem.type === 'box') {
        // Для коробки ожидаемый вес - это ее собственный вес
        expectedWeight = currentItem.expectedWeight;
        tolerance = calculateTolerance(expectedWeight);
      } else {
        // Для товара: вес коробки + вес всех завершенных товаров в этой коробке + вес текущего товара
        const boxItem = checklistItems.find(item =>
          item.type === 'box' &&
          (item.boxIndex || 0) === (currentItem.boxIndex || 0)
        );

        const boxWeight = boxItem ? boxItem.expectedWeight : 0;

        const completedProductsWeight = checklistItems
          .filter(item =>
            item.type === 'product' &&
            (item.boxIndex || 0) === (currentItem.boxIndex || 0) &&
            item.status === 'done'
          )
          .reduce((sum, item) => sum + item.expectedWeight, 0);

        expectedWeight = boxWeight + completedProductsWeight + currentItem.expectedWeight;
        tolerance = calculateTolerance(currentItem.expectedWeight);
      }

      console.log('⚖️ OrderView: Проверка веса с учетом накопления:', {
        товар: currentItem.name,
        тип: currentItem.type,
        'ожидаемый вес': expectedWeight,
        'фактический вес': actualWeight,
        допуск: tolerance
      });

      // Проверяем, попадает ли вес в допустимый диапазон
      const weightDifference = Math.abs(actualWeight - expectedWeight);
      const isSuccess = weightDifference <= tolerance;

      console.log('⚖️ OrderView: Результат проверки:', {
        разница: weightDifference,
        успех: isSuccess
      });

      // Обновляем статус товара
      setChecklistItems(prevItems =>
        prevItems.map(item =>
          item.id === itemId ? { ...item, status: isSuccess ? 'success' : 'error' } : item
        )
      );

      // Показываем уведомление о результате
        if (isSuccess) {
          // При успехе - удаляем запись о неудачном весе для этого товара
          if (failedWeightsRef.current[itemId] !== undefined) {
            delete failedWeightsRef.current[itemId];
          }
          // Останавливаем активный polling при успешном взвешивании
          equipmentActions.stopActivePolling();
          
          // Обновляем предыдущий вес для следующего товара
          if (currentItem.type === 'box') {
            // Для коробки previousWeight = вес коробки
            setPreviousWeight(currentItem.expectedWeight);
          } else {
            // Для товара previousWeight = текущий вес на весах
            setPreviousWeight(actualWeight);
          }
          setLastWeighTimestamp(Date.now());

          addToast({
            title: "Вага підтверджена",
            description: `${currentItem.name}: ${actualWeight.toFixed(2)} кг (очікувалося ${expectedWeight.toFixed(2)} кг)`,
            color: "success",
            timeout: 2000
          });

          // Через 1.5 секунды переводим в статус "done"
          setTimeout(() => {
            setChecklistItems(prevItems =>
              prevItems.map(item =>
                item.id === itemId ? { ...item, status: 'done' } : item
              )
            );

            // Автоматически выбираем следующий элемент
            const currentIndex = checklistItems.findIndex(item => item.id === itemId);

            if (currentItem.type === 'box') {
              // После завершения коробки выбираем первый товар в этой коробке
              const firstProductInBox = checklistItems.find((item) =>
                item.type === 'product' &&
                (item.boxIndex || 0) === (currentItem.boxIndex || 0) &&
                item.status === 'default'
              );

              if (firstProductInBox) {
                // Включаем режим ожидания изменения веса
                previousWeightOnSuccessRef.current = actualWeight;
                setIsAwaitingWeightChange(true);
                handleSimulateScan(firstProductInBox.id);
              } else {
                // Если нет товаров для сканирования в этой коробке, переходим к следующей коробке
                console.log('📦 OrderView: Коробка взвешена, товаров для сканирования нет - завершаем активный polling');
                equipmentActions.stopActivePolling();
              }
              return;
            }

            // Для товаров выбираем первый доступный товар в той же коробке
            const nextItem = checklistItems.find((item) =>
              item.status === 'default' &&
              (item.boxIndex || 0) === activeBoxIndex &&
              item.type === 'product'
            );

            if (nextItem) {
              // Включаем режим ожидания изменения веса
              previousWeightOnSuccessRef.current = actualWeight;
              setIsAwaitingWeightChange(true);
              handleSimulateScan(nextItem.id);
            } else {
              // Если нет товаров для сканирования, проверяем есть ли другие коробки с awaiting_confirmation
              const hasAwaitingBoxes = checklistItems.some(item =>
                item.type === 'box' && item.status === 'awaiting_confirmation'
              );
              if (!hasAwaitingBoxes) {
                console.log('📦 OrderView: Все товары взвешены, нет awaiting_confirmation коробок - завершаем активный polling');
                equipmentActions.stopActivePolling();
              }
            }
          }, 1500);
        } else {
        // При ошибке - запоминаем "неудачный" вес
        failedWeightsRef.current[itemId] = actualWeight;
        addToast({
          title: "Невідповідність ваги",
          description: `${currentItem.name}: ${actualWeight.toFixed(2)} кг (очікувалося ${expectedWeight.toFixed(2)} кг ±${tolerance.toFixed(2)} кг)`,
          color: "danger",
          timeout: 4000
        });

        // Возвращаемся к pending через 1.5 секунды при ошибке (ускорено в 2 раза)
        setTimeout(() => {
          setChecklistItems(prevItems =>
            prevItems.map(item =>
              item.id === itemId ? { ...item, status: 'pending' } : item
            )
          );
        }, 1500);
      }
    } catch (error) {
      console.error('❌ OrderView: Ошибка взвешивания:', error);
      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';

      addToast({
        title: "Помилка зважування",
        description: `Сталася помилка: ${errorMessage}`,
        color: "danger",
        timeout: 2000
      });

      // Останавливаем активный polling при ошибке
      equipmentActions.stopActivePolling();
      
      // Возвращаемся к pending при ошибке (ускорено в 2 раза)
      setTimeout(() => {
        setChecklistItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId ? { ...item, status: 'pending' } : item
          )
        );
      }, 1000);
    }
  }, [checklistItems, activeBoxIndex, calculateTolerance, equipmentState, addToast, handleSimulateWeigh, equipmentState.isScaleConnected]); // Убираем equipmentActions

  // Запускаем резервный polling при загрузке страницы
  useEffect(() => {
    console.log('🔄 OrderView: Запуск резервного polling для отображения веса');
    equipmentActions.startReservePolling();

    return () => {
      console.log('🔄 OrderView: Остановка всех polling при выходе со страницы');
      equipmentActions.stopActivePolling();
      equipmentActions.stopReservePolling();
    };
  }, []); // Убираем equipmentActions из зависимостей

  // Отслеживаем изменения pending/awaiting_confirmation статусов для управления активным polling
  useEffect(() => {
    const hasPendingItems = checklistItems.some(item =>
      item.status === 'pending' ||
      (item.type === 'box' && item.status === 'awaiting_confirmation')
    );

    if (hasPendingItems && !equipmentState.isSimulationMode) {
      // Проверяем, что весы подключены для активного polling
      if (equipmentState.isScaleConnected) {
        console.log('⚖️ OrderView: Найдены pending/awaiting_confirmation элементы, запускаем активный polling');
        equipmentActions.startActivePolling();
      } else {
        console.log('⚖️ OrderView: Найдены pending элементы, но весы не подключены - запускаем резервный polling');
        equipmentActions.startReservePolling();
      }
    } else if (!hasPendingItems) {
      console.log('⚖️ OrderView: Нет pending/awaiting_confirmation элементов, останавливаем активный polling');
      equipmentActions.stopActivePolling();
      // Оставляем резервный polling для отображения веса
    }
  }, [checklistItems, equipmentState.isSimulationMode, equipmentState.isScaleConnected]); // Убираем equipmentActions

  // Мемоизированная функция обработки сканирования (без зависимостей от checklistItems и activeBoxIndex)
  const handleBarcodeScan = useCallback((scannedCode: string) => {
    const currentTime = Date.now();

    // Проверяем, не обрабатывали ли мы уже этот код
    const isAlreadyProcessed = scannedCode === lastProcessedCodeRef.current &&
                               currentTime - lastProcessedTimestampRef.current < SCAN_COOLDOWN;

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
      showToastWithCooldown({
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
        showToastWithCooldown({
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
        showToastWithCooldown({
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
        showToastWithCooldown({
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
      
      // Запускаем активный polling при переходе в pending статус
      if (!equipmentState.isSimulationMode) {
        if (equipmentState.isScaleConnected) {
          equipmentActions.startActivePolling();
        } else {
          equipmentActions.startReservePolling();
        }
      }

      // 3. В режиме симуляции запускаем взвешивание сразу после сканирования (как в handleItemClick)
      if (equipmentState.isSimulationMode) {
        console.log('🎭 [OrderView] Режим симуляции - запускаем взвешивание после сканирования');
        setTimeout(() => {
          // Вызываем handleRealWeigh напрямую (аналогично handleItemClick в OrderChecklist)
          handleRealWeigh(foundItem.id);
        }, 300); // Такая же задержка как в handleItemClick
      }

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
      showToastWithCooldown({
        title: "Товар не знайдено",
        description: `Штрих-код ${scannedCode} не відповідає жодному товару`,
        color: "warning",
        timeout: 3000
      }, `item-not-found-${scannedCode}`);
    }
  }, [debugMode, SCAN_COOLDOWN, showToastWithCooldown, addToast, setLastScanTimestamp, setLastScannedCode, equipmentState.isSimulationMode, handleRealWeigh]);

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

    // Обновляем checklistItems с новыми коробками
    if (expandedItems.length > 0) {
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

      console.log('📦 Финальный чек-лист после обновления коробок:', finalItems.map(item => `${item.name} (${item.type}): ${item.status}`));
      setChecklistItems(finalItems);

      // Запускаем активный polling если есть awaiting_confirmation коробки
      const hasAwaitingBoxes = finalItems.some(item =>
        item.type === 'box' && item.status === 'awaiting_confirmation'
      );
      if (hasAwaitingBoxes && !equipmentState.isSimulationMode) {
        if (equipmentState.isScaleConnected) {
          console.log('📦 OrderView: Найдены awaiting_confirmation коробки, запускаем активный polling');
          equipmentActions.startActivePolling();
        } else {
          console.log('📦 OrderView: Найдены awaiting_confirmation коробки, но весы не подключены - запускаем резервный polling');
          equipmentActions.startReservePolling();
        }
      }
    }
  }, [expandedItems, isReadyToShip, equipmentState.isSimulationMode, equipmentState.isScaleConnected]); // Убираем equipmentActions

  const fetchOrderDetails = async (id: string) => {
    try {
      setLoading(true);
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
            setChecklistItems(combinedItems);

            // Запускаем активный polling если есть awaiting_confirmation коробки
            const hasAwaitingBoxes = combinedItems.some(item =>
              item.type === 'box' && item.status === 'awaiting_confirmation'
            );
            if (hasAwaitingBoxes && !isReadyToShip) {
              setTimeout(() => {
                if (equipmentState.isScaleConnected) {
                  console.log('📦 OrderView: Найдены awaiting_confirmation коробки при загрузке заказа, запускаем активный polling');
                  equipmentActions.startActivePolling();
                } else {
                  console.log('📦 OrderView: Найдены awaiting_confirmation коробки, но весы не подключены - запускаем резервный polling');
                  equipmentActions.startReservePolling();
                }
              }, 100); // Небольшая задержка для инициализации
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
            setChecklistItems(combinedItems);

            // Запускаем активный polling если есть awaiting_confirmation коробки
            const hasAwaitingBoxes = combinedItems.some(item =>
              item.type === 'box' && item.status === 'awaiting_confirmation'
            );
            if (hasAwaitingBoxes && !isReadyToShipFallback) {
              setTimeout(() => {
                if (equipmentState.isScaleConnected) {
                  console.log('📦 OrderView: Найдены awaiting_confirmation коробки при загрузке заказа (fallback), запускаем активный polling');
                  equipmentActions.startActivePolling();
                } else {
                  console.log('📦 OrderView: Найдены awaiting_confirmation коробки, но весы не подключены - запускаем резервный polling');
                  equipmentActions.startReservePolling();
                }
              }, 100); // Небольшая задержка для инициализации
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

  // Состояние для текущего ожидаемого веса
  const [currentScaleWeight, setCurrentScaleWeight] = useState(0);

  // Рассчитываем текущий ожидаемый вес на весах с небольшой задержкой для синхронизации
  useEffect(() => {
    const calculateWeight = () => {
      // Рассчитываем ожидаемый вес на текущем этапе
      const boxItem = checklistItems.find(item =>
        item.type === 'box' &&
        (item.boxIndex || 0) === activeBoxIndex
      );
      const boxWeight = boxItem ? boxItem.expectedWeight : 0;

      const completedProductsWeight = checklistItems
        .filter(item =>
          item.type === 'product' &&
          (item.boxIndex || 0) === activeBoxIndex &&
          item.status === 'done'
        )
        .reduce((sum, item) => sum + item.expectedWeight, 0);

      // Ищем элемент в статусе pending (только товары, коробки в awaiting_confirmation не считаются pending)
      const pendingItem = checklistItems.find(item =>
        (item.boxIndex || 0) === activeBoxIndex &&
        item.status === 'pending' &&
        item.type === 'product' // Только товары могут быть в pending
      );
      const pendingWeight = pendingItem ? pendingItem.expectedWeight : 0;

    const calculatedWeight = boxWeight + completedProductsWeight + pendingWeight;

    // Отладка расчета currentScaleWeight
    console.log('📊 OrderView: Расчет currentScaleWeight (useEffect):', {
      activeBoxIndex,
      boxWeight,
      completedProductsWeight,
      pendingWeight,
      pendingItemName: pendingItem?.name,
      calculatedWeight,
      previousWeight: currentScaleWeight,
      boxItem: boxItem ? {
        name: boxItem.name,
        status: boxItem.status,
        boxIndex: boxItem.boxIndex
      } : null,
      allBoxes: checklistItems.filter(item => item.type === 'box').map(item => ({
        name: item.name,
        status: item.status,
        boxIndex: item.boxIndex
      }))
    });

      setCurrentScaleWeight(calculatedWeight);
    };

    // Небольшая задержка для синхронизации с асинхронными обновлениями состояния
    const timeoutId = setTimeout(calculateWeight, 100);

    return () => clearTimeout(timeoutId);
  }, [checklistItems, activeBoxIndex]);

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
    <div className="space-y-8">
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
                key={`checklist-${equipmentState.isSimulationMode}-${equipmentState.config?.connectionType}`}
                items={checklistItems}
                totalPortions={orderForAssembly.totalPortions}
                activeBoxIndex={activeBoxIndex}
                onActiveBoxChange={setActiveBoxIndex}
                onItemStatusChange={(itemId, status) => {
                  setChecklistItems(prevItems =>
                    prevItems.map(item =>
                      item.id === itemId ? { ...item, status } : item
                    )
                  );
                }}
                onPrintTTN={handlePrintTTN}
                showPrintTTN={showPrintTTN}
                onNextOrder={handleNextOrder}
                showNextOrder={showNextOrder}
                onWeighItem={handleRealWeigh}
                isAwaitingWeightChange={isAwaitingWeightChange}
              />
            </ErrorBoundary>
          )}
          
        </div>
          
        {/* Правая колонка - Панель управления */}
        <div className="w-full xl:w-80">
          <RightPanel>
            <OrderTrackingNumber order={orderForAssembly} />
            <DeviationButton />

            {/* Кнопки имитации оборудования */}
            

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

            {/* Отображение веса на весах */}
            {hasItems && !expandingSets && (
              <ScaleWeightDisplay
                currentScaleWeight={currentScaleWeight}
                totalOrderWeight={checklistItems.reduce((sum, item) => sum + item.expectedWeight, 0)}
                className="mb-4"
              />
            )}

          </RightPanel>
        </div>
      </div>

      {/* Блок деталей заказа */}
	  {(user && ['admin', 'boss'].includes(user.role)) && (
		<>
		<h2 className="text-xl font-semibold text-gray-800 mt-20 border-t border-gray-300 pt-16 mb-4">Деталі замовлення №{order.orderNumber || externalId} <Code color="danger" className="bg-danger-500 text-white text-base">лише для адмінів</Code></h2>
    
		<div className="flex w-full gap-6">
			<div className="flex flex-1 min-w-0 flex-col gap-6">
				{/* Основная информация */}
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

				{/* Информация о клиенте */}
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

				{/* Состав заказа */}
				<Card>
				<CardHeader className="border-b border-gray-200">
          <DynamicIcon name="box" size={20} className="text-gray-600 mr-2" />
					<h4 className="text-base font-semibold">Склад</h4>
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

			{/* Сырые данные */}
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
