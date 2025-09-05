import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { useApi } from '../hooks/useApi';
import OrderChecklist from '@/components/OrderChecklist';
import OrderTrackingNumber from '@/components/OrderTrackingNumber';
import { DeviationButton } from '@/components/DeviationButton';
import { RightPanel } from '@/components/RightPanel';
import { BoxSelector } from '@/components/BoxSelector';
import { SimulationButtons } from '@/components/SimulationButtons';
import { EquipmentIntegrationGuide } from '@/components/EquipmentIntegrationGuide';
import { ScaleWeightDisplay } from '@/components/ScaleWeightDisplay';

import { useAuth } from '../contexts/AuthContext';
import { Code } from '@heroui/code';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDateOnly, formatTimeOnly } from '../lib/formatUtils';
import { useEquipmentFromAuth } from '../contexts/AuthContext';
import { shippingClientService } from '../services/ShippingService';
import ErrorBoundary from '../components/ErrorBoundary'; // Исправленный путь

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
  set: Array<{ id: string; quantity: number }> | null;
}

// Вспомогательная функция для расчета ожидаемого веса
const calculateExpectedWeight = (product: Product, quantity: number): number => {
  // Если есть вес в базе данных, используем его, иначе fallback на 0.3 кг
  if (product.weight && product.weight > 0) {
    // Конвертируем граммы в килограммы
    return (product.weight * quantity) / 1000;
  }
  // Fallback на старую логику (0.3 кг на порцию)
  return quantity * 0.3;
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
                type: 'product'
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
                    type: 'product'
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
                    expectedWeight: totalQuantity * 0.3, // Fallback для неизвестного компонента
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
                  expectedWeight: totalQuantity * 0.3, // Fallback для неизвестного компонента
                  status: 'default' as const,
                  type: 'product'
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
              type: 'product'
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
            expectedWeight: item.quantity * 0.3, // Fallback для неизвестного товара
            status: 'default' as const,
            type: 'product'
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
          expectedWeight: item.quantity * 0.3, // Fallback для ошибки
          status: 'default' as const,
          type: 'product'
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
  const [lastEquipmentSync, setLastEquipmentSync] = useState<number>(0);
  const [isPrintingTTN, setIsPrintingTTN] = useState(false); // Состояние для отслеживания печати ТТН
  const [showPrintTTN, setShowPrintTTN] = useState(false)
  const [isLoadingNextOrder, setIsLoadingNextOrder] = useState(false); // Состояние загрузки следующего заказа
  const [showNextOrder, setShowNextOrder] = useState(false); // Состояние для показа кнопки "Наступне замовлення"
  const [isReadyToShip, setIsReadyToShip] = useState(false); // Состояние для отслеживания статуса id3

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
  }, []); // Убрана зависимость apiCall, которая вызывала бесконечный цикл
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
  }, [activeBoxIndex]);

  // Функция расчета допустимой погрешности
  const calculateTolerance = useCallback((expectedWeight: number) => {
    let tolerance = 0;

    if (weightTolerance.type === 'percentage' || weightTolerance.type === 'combined') {
      // Процентная погрешность (expectedWeight в кг, переводим в граммы для расчета)
      tolerance += (expectedWeight * 1000 * weightTolerance.percentage) / 100;
    }

    if (weightTolerance.type === 'absolute' || weightTolerance.type === 'combined') {
      // Абсолютная погрешность (уже в граммах, переводим в кг для сравнения)
      tolerance += weightTolerance.absolute / 1000;
    }

    return tolerance;
  }, [weightTolerance]);

  // Функция для имитации взвешивания с реальным сравнением веса
  const handleSimulateWeigh = useCallback((itemId: string) => {
    const currentItem = checklistItems.find(item => item.id === itemId);
    if (!currentItem) return;

    // Имитируем реальное взвешивание с случайной погрешностью
    const expectedWeight = currentItem.expectedWeight;
    const tolerance = calculateTolerance(expectedWeight);
    const randomError = (Math.random() - 0.5) * 2 * tolerance; // Случайная погрешность в пределах ± толерантности
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
        
        // Автоматически выбираем следующий элемент
        const currentIndex = checklistItems.findIndex(item => item.id === itemId);
        const nextItem = checklistItems.find((item, index) => 
          index > currentIndex && 
          item.status === 'default' && 
          (item.boxIndex || 0) === activeBoxIndex &&
          item.type === 'product'
        );
        
        if (nextItem) {
          handleSimulateScan(nextItem.id);
        }
      }, 1500);
    } else {
      // Возвращаемся к pending через 2 секунды при ошибке
      setTimeout(() => {
        setChecklistItems(prevItems => 
          prevItems.map(item => 
            item.id === itemId ? { ...item, status: 'pending' } : item
          )
        );
      }, 2000);
    }
  }, [checklistItems, activeBoxIndex, calculateTolerance]);

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
    }
  }, [expandedItems, isReadyToShip]);

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
            expectedWeight: item.quantity * 0.3, // Fallback для ошибки разворачивания
            status: isReadyToShipFallback ? 'done' : 'default' as const,
            type: 'product'
          }));

          setExpandedItems(fallbackItems);

          // Если есть выбранные коробки, объединяем их с товарами
          if (selectedBoxes.length > 0) {
            const itemsWithoutBoxes = fallbackItems.filter(item => item.type !== 'box');
            const combinedItems = combineBoxesWithItems(selectedBoxes, itemsWithoutBoxes, isReadyToShipFallback);
            setChecklistItems(combinedItems);
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
            {hasItems && !expandingSets && equipmentState.isSimulationMode && (
              <div className="w-full relative">
                <SimulationButtons
                  showPrintTTN={showPrintTTN}
                  setShowPrintTTN={setShowPrintTTN}
                  key={`sim-buttons-${equipmentState.isSimulationMode}`}
                  items={checklistItems}
                  activeBoxIndex={activeBoxIndex}
                  onSimulateScan={handleSimulateScan}
                  onSimulateWeigh={handleSimulateWeigh}
                  weightTolerance={calculateTolerance(checklistItems.find(item => item.status === 'pending')?.expectedWeight || 0)}
                  className="bg-white rounded-lg shadow"
                />
                {/* Индикатор реального времени */}
                <div
                  className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full border border-green-200 cursor-pointer hover:bg-green-200 transition-colors"
                  onClick={async () => {
                    try {
                      await equipmentActions.refreshConfig();
                      setLastEquipmentSync(Date.now());
                    } catch (error) {
                      console.error('❌ Ошибка ручной синхронизации:', error);
                    }
                  }}
                  title="Нажмите для ручной синхронизации состояния оборудования"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    Date.now() - lastEquipmentSync < 10000 ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                  }`}></div>
                  <span>Live</span>
                </div>
              </div>
            )}

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
                currentScaleWeight={checklistItems.filter(item =>
                  (item.boxIndex || 0) === activeBoxIndex &&
                  (item.type === 'box' || item.status === 'done')
                ).reduce((acc, item) => acc + item.expectedWeight, 0)}
                totalOrderWeight={expandedItems.reduce((sum, item) => sum + item.expectedWeight, 0)}
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

				{/* Развернутый состав для комплектации */}
				<Card>
				<CardHeader className="border-b border-gray-200">
          <DynamicIcon name="box" size={20} className="text-gray-600 mr-2" />
					<h4 className="text-base font-semibold">Розгорнутий склад</h4>
					<p className="text-sm text-gray-600 ml-auto">Набори розгорнуті на окремі страви</p>
				</CardHeader>
				<CardBody>
					{!hasItems ? (
						<p className="text-gray-500 text-center py-4">Склад замовлення порожній</p>
					) : expandedItems && expandedItems.length > 0 ? (
					<div className="space-y-2">
						{/* Сводка по развернутым элементам */}
						<div className="mb-4 p-3 bg-green-50 rounded border-l-4 border-green-400">
							<div className="text-sm text-green-700">
								<strong>📊 Сводка:</strong> {expandedItems.length} унікальних страв, 
								загалом {expandedItems.reduce((sum, item) => sum + item.quantity, 0)} порцій
							</div>
							
							{/* Дополнительная информация о логике суммирования */}
							{orderAnalysis && orderAnalysis.hasSets && (
								<div className="mt-2 text-xs text-green-600">
									<strong>🔄 Логіка сумування:</strong> Однакові страви з різних наборів та окремі страви 
									автоматично сумуються за назвою. Наприклад, якщо в наборі "А" є "Борщ" ×3, а в наборі "Б" 
									є "Борщ" ×2, то результат буде "Борщ" ×5.
								</div>
							)}
						</div>
						
						{/* Список развернутых элементов */}
						{expandedItems.map((item: OrderChecklistItem, index: number) => (
						<div key={index} className="flex justify-between items-center p-3 bg-blue-50 rounded border-l-4 border-blue-400">
							<div>
							<p className="font-medium">{item.name}</p>
							<div className="flex items-center gap-2 text-sm text-gray-600">
								<span>ID: {item.id}</span>
								<span>•</span>
								<span>{item.quantity === 1 ? '1 порція' : item.quantity < 5 ? `${item.quantity} порції` : `${item.quantity} порцій`}</span>
								{/* Индикатор суммирования */}
								{item.quantity > 1 && (
									<span className="text-xs text-blue-500 bg-blue-100 px-1 py-0.5 rounded">
										{item.quantity > 5 ? 'сумовано' : 'сум'}
									</span>
								)}
							</div>
							</div>
							<div className="text-right">
							<p className="font-medium">{item.quantity} порцій</p>
							<p className="text-sm text-gray-600">~{item.expectedWeight ? item.expectedWeight.toFixed(1) : '0.0'} кг</p>
							</div>
						</div>
						))}
						
						{/* Дополнительная информация о системе */}
						<div className="mt-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
							<div className="text-xs text-blue-700">
								<strong>💡 Переваги системи:</strong>
								<ul className="mt-1 ml-4 space-y-1">
									<li>• Кладовщик бачить точну кількість кожної страви</li>
									<li>• Не потрібно пам'ятати, що входить в набори</li>
									<li>• Автоматичне сумування однакових страв</li>
									<li>• Зручна комплектація за окремими стравами</li>
								</ul>
							</div>
						</div>
					</div>
					) : (
					<p className="text-gray-500 text-center py-4">Розгорнутий склад не доступний</p>
					)}
				</CardBody>
				</Card>
			</div>

			{/* Сырые данные */}
			<div className="flex flex-1 min-w-0 flex-col gap-8">
        {/* Гид по интеграции оборудования */}
        {hasItems && !expandingSets && (
            <EquipmentIntegrationGuide />
          )}

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
