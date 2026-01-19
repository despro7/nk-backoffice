import type { OrderChecklistItem } from '../types/orderAssembly';

// Інтерфейс для товару з бази даних
export interface Product {
  id: number;
  sku: string;
  name: string;
  weight?: number; // Вага в грамах
  categoryId?: number; // ID категорії для визначення ваги за замовчуванням
  manualOrder?: number; // Ручне сортування
  barcode?: string; // Штрих-код товару
  set: Array<{ id: string; quantity: number }> | null;
}

/**
 * Розраховує очікувану вагу для товару
 */
export const calculateExpectedWeight = (product: Product, quantity: number): number => {
  // Якщо є вага в базі даних, використовуємо її
  if (product.weight && product.weight > 0) {
    // Конвертуємо грами в кілограми
    return (product.weight * quantity) / 1000;
  }

  // Fallback на вагу за замовчуванням на основі категорії
  // categoryId === 1 - перші страви (420г), решта - другі страви (330г)
  const defaultWeight = product.categoryId === 1 ? 420 : 330;
  return (defaultWeight * quantity) / 1000;
};

/**
 * Сортує елементи чек-листа по manualOrder -> type -> name
 */
export const sortChecklistItems = (items: OrderChecklistItem[]): OrderChecklistItem[] => {
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

/**
 * Розгортає набори товарів в окремі компоненти
 */
export const expandProductSets = async (orderItems: any[], apiCall: any): Promise<OrderChecklistItem[]> => {
  const expandedItems: { [key: string]: OrderChecklistItem } = {};

  for (const item of orderItems) {
    try {
      // Отримуємо інформацію про товар по SKU
      const response = await apiCall(`/api/products/${item.sku}`);
      if (response.ok) {
        const product: Product = await response.json();

        if (product.set && Array.isArray(product.set) && product.set.length > 0) {
          // Це набір - розгортаємо його

          // Перевіряємо структуру set
          const validSetItems = product.set.filter(setItem =>
            setItem && typeof setItem === 'object' && setItem.id && setItem.quantity
          );

          if (validSetItems.length === 0) {
            console.warn(`⚠️ Набір ${product.name} не має валідних компонентів:`, product.set);
            // Додаємо як звичайний товар
            const itemName = item.productName;
            if (expandedItems[itemName]) {
              expandedItems[itemName].quantity += item.quantity;
              // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
              expandedItems[itemName].expectedWeight = calculateExpectedWeight(product, expandedItems[itemName].quantity);
            } else {
              expandedItems[itemName] = {
                id: item.sku,
                name: itemName,
                quantity: item.quantity,
                expectedWeight: calculateExpectedWeight(product, item.quantity),
                status: 'default' as const,
                type: 'product',
                sku: item.sku,
                barcode: product.barcode || item.sku, // Використовуємо реальний barcode або fallback на SKU
                manualOrder: product.manualOrder
              };
            }
            continue;
          }

          for (const setItem of validSetItems) {
            // Перевіряємо, що у setItem є id
            if (!setItem.id) {
              console.warn(`⚠️ Компонент набору не має ID:`, setItem);
              continue;
            }

            try {
              // Отримуємо назву компонента набору
              const componentResponse = await apiCall(`/api/products/${setItem.id}`);
              if (componentResponse.ok) {
                const component: Product = await componentResponse.json();
                const componentName = component.name;
                const totalQuantity = item.quantity * setItem.quantity;

                // Сумуємо з існуючими компонентами
                if (expandedItems[componentName]) {
                  expandedItems[componentName].quantity += totalQuantity;
                  // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
                  expandedItems[componentName].expectedWeight = calculateExpectedWeight(component, expandedItems[componentName].quantity);
                } else {
                  expandedItems[componentName] = {
                    id: `${item.sku}_${setItem.id}`,
                    name: componentName,
                    quantity: totalQuantity,
                    expectedWeight: calculateExpectedWeight(component, totalQuantity),
                    status: 'default' as const,
                    type: 'product',
                    sku: setItem.id,
                    barcode: component.barcode || setItem.id, // Використовуємо реальний barcode або fallback на SKU
                    manualOrder: component.manualOrder
                  };
                }
              } else {
                console.warn(`⚠️ Не вдалося отримати інформацію про компонент набору: ${setItem.id} (статус: ${componentResponse.status})`);
                // Додаємо компонент з невідомою назвою
                const componentName = `Невідома страва (${setItem.id})`;
                const totalQuantity = item.quantity * setItem.quantity;

                if (expandedItems[componentName]) {
                  expandedItems[componentName].quantity += totalQuantity;
                  // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
                  expandedItems[componentName].expectedWeight = expandedItems[componentName].quantity * 0.33;
                } else {
                  expandedItems[componentName] = {
                    id: `${item.sku}_${setItem.id}`,
                    name: componentName,
                    quantity: totalQuantity,
                    expectedWeight: totalQuantity * 0.33,
                    status: 'default' as const,
                    type: 'product',
                    manualOrder: 999
                  };
                }
              }
            } catch (componentError) {
              console.error(`❌ Помилка отримання компонента набору ${setItem.id}:`, componentError);
              // Додаємо компонент з невідомою назвою
              const componentName = `Невідома страва (${setItem.id})`;
              const totalQuantity = item.quantity * setItem.quantity;

              if (expandedItems[componentName]) {
                expandedItems[componentName].quantity += totalQuantity;
                // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
                expandedItems[componentName].expectedWeight = expandedItems[componentName].quantity * 0.33;
              } else {
                expandedItems[componentName] = {
                  id: `${item.sku}_${setItem.id}`,
                  name: componentName,
                  quantity: totalQuantity,
                  expectedWeight: totalQuantity * 0.33,
                  status: 'default' as const,
                  type: 'product',
                  sku: setItem.id,
                  barcode: setItem.id,
                  manualOrder: 999
                };
              }
            }
          }
        } else {
          // Це звичайний товар - додаємо як є
          const itemName = item.productName;
          if (expandedItems[itemName]) {
            expandedItems[itemName].quantity += item.quantity;
            // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
            expandedItems[itemName].expectedWeight = calculateExpectedWeight(product, expandedItems[itemName].quantity);
          } else {
            expandedItems[itemName] = {
              id: item.sku,
              name: itemName,
              quantity: item.quantity,
              expectedWeight: calculateExpectedWeight(product, item.quantity),
              status: 'default' as const,
              type: 'product',
              sku: item.sku,
              barcode: product.barcode || item.sku, // Використовуємо реальний barcode або fallback на SKU
              manualOrder: product.manualOrder
            };
          }
        }
      } else {
        // Якщо не вдалося отримати інформацію про товар, додаємо як є
        console.warn(`⚠️ Не вдалося отримати інформацію про товар: ${item.sku} (статус: ${response.status})`);
        const itemName = item.productName;
        if (expandedItems[itemName]) {
          expandedItems[itemName].quantity += item.quantity;
          // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
          expandedItems[itemName].expectedWeight = expandedItems[itemName].quantity * 0.33;
        } else {
          expandedItems[itemName] = {
            id: item.sku,
            name: itemName,
            quantity: item.quantity,
            expectedWeight: item.quantity * 0.33,
            status: 'default' as const,
            type: 'product',
            sku: item.sku,
            barcode: item.sku,
            manualOrder: 999
          };
        }
      }
    } catch (error) {
      console.error(`❌ Помилка розгортання набору для ${item.sku}:`, error);
      // У випадку помилки додаємо товар як є
      const itemName = item.productName;
      if (expandedItems[itemName]) {
        expandedItems[itemName].quantity += item.quantity;
        // ВАЖЛИВО: оновлюємо вагу при додаванні кількості
        expandedItems[itemName].expectedWeight = expandedItems[itemName].quantity * 0.33;
      } else {
        expandedItems[itemName] = {
          id: item.sku,
          name: itemName,
          quantity: item.quantity,
          expectedWeight: item.quantity * 0.33,
          status: 'default' as const,
          type: 'product',
          sku: item.sku,
          barcode: item.sku,
          manualOrder: 999
        };
      }
    }
  }

  // Перетворюємо об'єкт в масив і призначаємо унікальні ID
  const result = Object.values(expandedItems).map((item, index) => ({
    ...item,
    id: (index + 1).toString()
  }));
  
  return result;
};

/**
 * Об'єднує коробки з товарами в один чек-ліст
 * @param boxes - Масив коробок
 * @param items - Масив товарів
 * @param isReadyToShip - Чи замовлення готове до відправлення
 * @param boxInitialStatus - Початковий статус коробки (за замовчуванням 'default')
 * @returns Масив елементів чек-листа та інформацію про нерозподілені порції
 */
export const combineBoxesWithItems = (
  boxes: any[], 
  items: OrderChecklistItem[], 
  isReadyToShip: boolean = false,
  boxInitialStatus: 'default' | 'pending' | 'awaiting_confirmation' = 'default'
): { checklistItems: OrderChecklistItem[]; unallocatedPortions: number; unallocatedItems: Array<{ name: string; quantity: number }> } => {
  // Перевіряємо, що у нас є валідні коробки
  if (!boxes || boxes.length === 0) {
    return {
      checklistItems: items,
      unallocatedPortions: 0,
      unallocatedItems: []
    };
  }

  // Створюємо унікальні коробки, уникаючи дублювання
  const boxItems: OrderChecklistItem[] = boxes.map((box, index) => ({
    id: `box_${index + 1}`,
    name: box.name || `Коробка ${index + 1}`,
    quantity: 1,
    expectedWeight: Number(box.self_weight || box.weight || 0),
    status: (isReadyToShip ? 'done' : boxInitialStatus) as OrderChecklistItem['status'],
    type: 'box' as const,
    boxSettings: box,
    boxCount: 1,
    boxIndex: index,
    portionsRange: box.portionsRange || { start: 0, end: 0 },
    portionsPerBox: box.portionsPerBox || 0
  }));

  // Якщо є коробки, розділяємо товари по коробках
  // Тільки якщо більше однієї коробки І встановлено portionsPerBox
  if (boxes.length > 1 && boxes[0].portionsPerBox && boxes[0].portionsPerBox > 0) {
    // НОВИЙ АЛГОРИТМ: збалансований розподіл з урахуванням ваги
    const MAX_BOX_WEIGHT = 15; // Максимальна вага коробки в кг
    
    const productItems: OrderChecklistItem[] = [];
    
    // Трекінг нерозподілених порцій
    const unallocatedItems: Array<{ name: string; quantity: number }> = [];
    let totalUnallocated = 0;
    
    // Ініціалізуємо стан кожної коробки
    const boxStates = boxes.map((box, index) => ({
      index,
      portionsCount: 0,
      currentWeight: Number(box.self_weight || box.weight || 0),
      limit: box.portionsPerBox || 0
    }));
    
    // Сортуємо товари за вагою (важкі спочатку) для кращого балансування
    const sortedItems = [...items].sort((a, b) => {
      const weightA = a.expectedWeight / a.quantity;
      const weightB = b.expectedWeight / b.quantity;
      return weightB - weightA;
    });
    
    // Розподіляємо кожен товар по коробках збалансовано
    for (const item of sortedItems) {
      const itemWeightPerUnit = item.expectedWeight / item.quantity;
      let remaining = item.quantity;
      let partIndex = 0;
      let itemUnallocated = 0;
      
      // Для важких товарів (>0.4 кг) намагаємось розділити по різних коробках
      const isHeavyItem = itemWeightPerUnit > 0.4;
      const shouldDistribute = isHeavyItem && remaining >= boxes.length && boxes.length > 1;
      
      if (shouldDistribute) {
        // Розділяємо важкий товар порівну по всіх коробках
        const portionsPerBox = Math.floor(remaining / boxes.length);
        const remainder = remaining % boxes.length;
        
        for (let boxIdx = 0; boxIdx < boxes.length && remaining > 0; boxIdx++) {
          const boxState = boxStates[boxIdx];
          let toAddToThisBox = portionsPerBox + (boxIdx < remainder ? 1 : 0);
          
          // Перевіряємо ліміти коробки
          const freeSpace = boxState.limit - boxState.portionsCount;
          const availableWeight = MAX_BOX_WEIGHT - boxState.currentWeight;
          const maxByWeight = Math.floor(availableWeight / itemWeightPerUnit);
          
          toAddToThisBox = Math.min(toAddToThisBox, freeSpace, maxByWeight);
          
          if (toAddToThisBox > 0) {
            productItems.push({
              ...item,
              id: `product_${boxIdx}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
              type: 'product' as const,
              quantity: toAddToThisBox,
              expectedWeight: itemWeightPerUnit * toAddToThisBox,
              boxIndex: boxIdx
            });
            
            boxState.portionsCount += toAddToThisBox;
            boxState.currentWeight += itemWeightPerUnit * toAddToThisBox;
            remaining -= toAddToThisBox;
            partIndex++;
          }
        }
        
        // Якщо після розподілу по всіх коробках щось залишилось - продовжуємо в while
        // Якщо все розподілено - пропускаємо while блок
      }
      
      // Решту (або весь товар, якщо він легкий) розподіляємо послідовно, шукаючи найлегшу коробку
      while (remaining > 0) {
        // Знаходимо коробку з найменшою вагою і вільним місцем
        const availableBoxes = boxStates.filter(box => 
          box.portionsCount < box.limit && 
          (MAX_BOX_WEIGHT - box.currentWeight) >= itemWeightPerUnit
        );
        
        if (availableBoxes.length === 0) {
          // Немає доступних коробок - фіксуємо нерозподілені порції
          console.warn(`⚠️ Не вдалося розподілити ${remaining} порцій товару "${item.name}"`);
          itemUnallocated = remaining;
          totalUnallocated += remaining;
          break;
        }
        
        // Сортуємо за вагою (найлегша спочатку)
        availableBoxes.sort((a, b) => a.currentWeight - b.currentWeight);
        const targetBox = availableBoxes[0];
        
        // Розраховуємо скільки можна додати
        const freeSpace = targetBox.limit - targetBox.portionsCount;
        const availableWeight = MAX_BOX_WEIGHT - targetBox.currentWeight;
        const maxByWeight = Math.floor(availableWeight / itemWeightPerUnit);
        const toAdd = Math.min(remaining, freeSpace, maxByWeight);
        
        if (toAdd <= 0) {
          // Не можемо додати - фіксуємо нерозподілені порції
          console.warn(`⚠️ Не вдалося розподілити ${remaining} порцій товару "${item.name}" - ліміти вичерпані`);
          itemUnallocated = remaining;
          totalUnallocated += remaining;
          break;
        }
        
        productItems.push({
          ...item,
          id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
          type: 'product' as const,
          quantity: toAdd,
          expectedWeight: itemWeightPerUnit * toAdd,
          boxIndex: targetBox.index
        });
        
        targetBox.portionsCount += toAdd;
        targetBox.currentWeight += itemWeightPerUnit * toAdd;
        remaining -= toAdd;
        partIndex++;
      }
      
      // Зберігаємо інформацію про нерозподілені порції
      if (itemUnallocated > 0) {
        unallocatedItems.push({
          name: item.name,
          quantity: itemUnallocated
        });
      }
    }
    
    const result = [...boxItems, ...productItems];
    
    // Якщо є нерозподілені порції, виводимо детальне попередження
    if (totalUnallocated > 0) {
      console.error('❌ КРИТИЧНА ПОМИЛКА: Не всі товари поміщаються в коробки!');
      console.error(`Всього нерозподілених порцій: ${totalUnallocated}`);
      console.error('Деталі:', unallocatedItems);
      console.error('Стан коробок:', boxStates);
    }
    
    return {
      checklistItems: result,
      unallocatedPortions: totalUnallocated,
      unallocatedItems
    };
  }

  // Якщо коробка одна або немає коробок, або замовлення готове до відправки, додаємо товари як зазвичай
  const productItems = items.map((item, index) => ({
    ...item,
    id: `product_${index + 1}`,
    type: 'product' as const,
    boxIndex: 0
  }));

  // Зливаємо елементи з однаковими назвами для однієї коробки
  const mergedProductItems = productItems.reduce((acc, item) => {
    const existingItem = acc.find(i => i.name === item.name);
    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as typeof productItems);

  const result = [...boxItems, ...mergedProductItems];
  
  return {
    checklistItems: result,
    unallocatedPortions: 0,
    unallocatedItems: []
  };
};

