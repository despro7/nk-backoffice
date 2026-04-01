import { LoggingService } from '@/services/LoggingService';
import type { OrderChecklistItem } from '../types/orderAssembly';

// Інтерфейс для товару з бази даних
export interface Product {
  id: number;
  sku: string;
  name: string;
  weight?: number; // Вага в грамах
  categoryId?: number; // ID категорії для визначення ваги за замовчуванням
  categoryName?: string; // Назва категорії
  manualOrder?: number; // Ручне сортування
  barcode?: string; // Штрих-код товару
  set: Array<{ id: string; name?: string; quantity: number }> | null;
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
 * Рекурсивно розгортає один товар/комплект у фінальні компоненти
 * @param sku - SKU товару для розгортання
 * @param quantity - Кількість цього товару
 * @param apiCall - Функція для API викликів
 * @param expandedItems - Об'єкт для накопичення результатів
 * @param visitedSets - Set для відстеження відвіданих SKU (запобігання циклічним посиланням)
 * @param depth - Поточна глибина рекурсії (для безпеки). depth=0 означає прямий товар в замовленні
 * @param monolithicCategories - Список назв категорій, які не повинні розгортатися
 */
const expandProductRecursively = async (
  sku: string,
  quantity: number,
  apiCall: any,
  expandedItems: { [key: string]: OrderChecklistItem },
  visitedSets: Set<string> = new Set(),
  depth: number = 0,
  monolithicCategories: string[] = []
): Promise<void> => {
  // Захист від нескінченної рекурсії
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.error(`🛑 Досягнуто максимальну глибину рекурсії (${MAX_DEPTH}) для SKU: ${sku}`);
    return;
  }

  // Захист від циклічних посилань (комплект A містить комплект B, який містить комплект A)
  if (visitedSets.has(sku)) {
    console.warn(`🔄 Виявлено циклічне посилання на SKU: ${sku}. Пропускаємо.`);
    return;
  }

  try {
    const response = await apiCall(`/api/products/${sku}`);
    if (!response.ok) {
      console.warn(`⚠️ Не вдалося отримати інформацію про товар: ${sku} (статус: ${response.status})`);
      return;
    }

    const product: Product = await response.json();

    // Перевіряємо, чи це комплект
    if (product.set && Array.isArray(product.set) && product.set.length > 0) {
      // 🚀 НОВА ЛОГІКА: Якщо це монолітна категорія, не розгортаємо його далі
      const categoryIdStr = product.categoryId?.toString();
      LoggingService.orderAssemblyLog(`📦 Перевірка комплекту: "${product.name}" (SKU: ${sku}), categoryId: ${product.categoryId}, categoryName: "${product.categoryName}", monolithicCategories: [${monolithicCategories.join(', ')}], depth=${depth}`);
      
      if (categoryIdStr && Array.isArray(monolithicCategories) && monolithicCategories.includes(categoryIdStr)) {
        LoggingService.orderAssemblyLog(`📦 Монолітний комплект: "${product.name}" (SKU: ${sku}). Рекурсія зупинена. depth=${depth}`);

        // Збираємо склад комплекту для відображення комірнику
        // ВАЖЛИВО: Показуємо кількість кожного компонента на ОДИН комплект (не множимо на quantity)
        const compositionPromises = product.set
          .filter(si => si.id)
          .map(async si => {
            const componentLabel = si.quantity > 0 ? `x${si.quantity}` : '';
            if (si.name) {
              return componentLabel ? `${si.name} ${componentLabel}` : si.name;
            } else {
              // Спробуємо отримати назву компонента через API
              try {
                const componentResponse = await apiCall(`/api/products/${si.id}`);
                if (componentResponse.ok) {
                  const componentData = await componentResponse.json();
                  const name = componentData.name || `Товар ${si.id}`;
                  return componentLabel ? `${name} ${componentLabel}` : name;
                }
              } catch (error) {
                console.warn(`Не вдалося отримати назву компонента ${si.id}:`, error);
              }
              return `Товар ${si.id} ${componentLabel}`;
            }
          });

        const composition = await Promise.all(compositionPromises);

        // 🔑 Рахуємо порції для всіх монолітних комплектів (depth == 0 або depth > 0)
        // Порції = кількість компонентів у комплекті (по одному кожного)
        const portionsPerSet = product.set.reduce((sum, si) => sum + (si.quantity || 0), 0);
        
        const totalPortions = portionsPerSet * quantity;
        LoggingService.orderAssemblyLog(`📊 Монолітний комплект "${product.name}" (depth=${depth}): ${quantity} × ${portionsPerSet} = ${totalPortions} порцій`);

        addOrUpdateExpandedItem(expandedItems, product, quantity, sku, composition, portionsPerSet);
        return;
      }

      // Це звичайний комплект - розгортаємо компоненти рекурсивно
      const validSetItems = product.set.filter(setItem =>
        setItem && typeof setItem === 'object' && setItem.id && setItem.quantity
      );

      if (validSetItems.length === 0) {
        console.warn(`⚠️ Набір ${product.name} (${sku}) не має валідних компонентів:`, product.set);
        // Додаємо як звичайний товар
        addOrUpdateExpandedItem(expandedItems, product, quantity, sku);
        return;
      }

      LoggingService.orderAssemblyLog(`Розгортаємо комплект "${product.name}" (глибина: ${depth}, кількість: ${quantity})`, { sku, depth, quantity });
      
      // Додаємо до відвіданих перед рекурсією
      visitedSets.add(sku);

      // Рекурсивно розгортаємо кожен компонент
      for (const setItem of validSetItems) {
        if (!setItem.id) {
          console.warn(`⚠️ Компонент набору не має ID:`, setItem);
          continue;
        }

        const componentQuantity = quantity * setItem.quantity;
        
        // 🔄 РЕКУРСИВНИЙ ВИКЛИК - розгортаємо компонент (він може бути теж комплектом!)
        await expandProductRecursively(
          setItem.id,
          componentQuantity,
          apiCall,
          expandedItems,
          new Set(visitedSets), // Створюємо копію Set для кожної гілки рекурсії
          depth + 1,
          monolithicCategories
        );
      }

      // Видаляємо з відвіданих після обробки (для незалежних гілок)
      visitedSets.delete(sku);

    } else {
      // Це звичайний товар (не комплект) - додаємо до результату
      addOrUpdateExpandedItem(expandedItems, product, quantity, sku, undefined);
    }

  } catch (error) {
    console.error(`❌ Помилка розгортання товару ${sku}:`, error);
  }
};

/**
 * Допоміжна функція для додавання/оновлення товару в expandedItems
 */
const addOrUpdateExpandedItem = (
  expandedItems: { [key: string]: OrderChecklistItem },
  product: Product,
  quantity: number,
  sku: string,
  composition?: string[],
  portionsPerItem?: number
): void => {
  const itemName = product.name;

  // Ключ для об'єднання товарів:
  // - Звичайні товари: itemName (об'єднуються за назвою)
  // - Монолітні товари: itemName + sku (щоб розрізняти одну й ту саму назву з різних контекстів)
  const key = portionsPerItem !== undefined ? `${itemName}:::${sku}` : itemName;

  if (expandedItems[key]) {
    // Товар вже є - збільшуємо кількість
    expandedItems[key].quantity += quantity;
    expandedItems[key].expectedWeight = calculateExpectedWeight(product, expandedItems[key].quantity);

    // Оновлюємо склад, якщо він ще не був доданий
    if (composition && (!expandedItems[key].composition || expandedItems[key].composition!.length === 0)) {
      expandedItems[key].composition = composition;
    }
  } else {
    // Додаємо новий товар
    expandedItems[key] = {
      id: sku,
      name: itemName,
      quantity: quantity,
      expectedWeight: calculateExpectedWeight(product, quantity),
      status: 'default' as const,
      type: 'product',
      sku: sku,
      barcode: product.barcode || sku,
      manualOrder: product.manualOrder,
      composition: composition,
      portionsPerItem: portionsPerItem

    };
  }

  LoggingService.orderAssemblyLog(`  ✅ Додано: ${itemName} × ${quantity} (SKU: ${sku})${composition ? ' [M]' : ''}${portionsPerItem ? ` [portionsPerItem=${portionsPerItem}]` : ''}`);
};

/**
 * Розгортає набори товарів в окремі компоненти (з підтримкою вкладених комплектів)
 * @param orderItems - Товари замовлення
 * @param apiCall - Функція для API викликів
 * @param monolithicCategoryIds - Список ID категорій, які не повинні розгортатися
 */
export const expandProductSets = async (
  orderItems: any[],
  apiCall: any,
  monolithicCategoryIds: number[] = []
): Promise<OrderChecklistItem[]> => {
  const expandedItems: { [key: string]: OrderChecklistItem } = {};

  LoggingService.orderAssemblyLog(`🚀 Початок розгортання ${orderItems.length} товарів замовлення... (Монолітні категорії ID: [${monolithicCategoryIds.join(', ') || 'немає'}])`);
  LoggingService.orderAssemblyLog(`📋 Вхідні товари: ${JSON.stringify(orderItems.map(item => ({ name: item.productName, sku: item.sku, quantity: item.quantity })))}`);

  for (const item of orderItems) {
    try {
      LoggingService.orderAssemblyLog(`\n📦 Обробка: ${item.productName} (SKU: ${item.sku}) × ${item.quantity}`);

      // Рекурсивно розгортаємо кожен товар замовлення
      await expandProductRecursively(
        item.sku,
        item.quantity,
        apiCall,
        expandedItems,
        new Set(), // Новий Set для кожного товару замовлення
        0, // Починаємо з глибини 0
        monolithicCategoryIds.map(id => id.toString()) // Конвертуємо ID категорій в строки для порівняння
      );

    } catch (error) {
      console.error(`❌ Помилка розгортання набору для ${item.sku}:`, error);
      
      // У випадку помилки додаємо товар як є (fallback)
      const itemName = item.productName;
      if (expandedItems[itemName]) {
        expandedItems[itemName].quantity += item.quantity;
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

  LoggingService.orderAssemblyLog(`\n✅ Розгортання завершено. Отримано ${result.length} унікальних товарів.`);
  LoggingService.orderAssemblyLog(`📊 Детальний список з portionsPerItem:`);
  result.forEach((item, i) => {
    const portions = item.portionsPerItem ? item.quantity * item.portionsPerItem : item.quantity;
    LoggingService.orderAssemblyLog(`  ${i+1}. ${item.name} × ${item.quantity}${item.portionsPerItem ? ` (portionsPerItem=${item.portionsPerItem}, всього=${portions})` : ` (всього=${portions})`}`);
  });
  
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
    // softLimit — рекомендована кількість порцій (з distributePortionsAcrossBoxes)
    // hardLimit — фізичний максимум коробки (qntTo з БД)
    // Спочатку алгоритм намагається не перевищувати softLimit.
    // Якщо товар не вміщується ні в одну коробку по softLimit — дозволяємо використати hardLimit.
    const boxStates = boxes.map((box, index) => ({
      index,
      portionsCount: 0,
      currentWeight: Number(box.self_weight || box.weight || 0),
      softLimit: box.portionsPerBox || 0,
      hardLimit: box.qntTo || box.portionsPerBox || 0
    }));
    
    // Сортуємо товари: спочатку ті, що важче розмістити (менша кількість і велика вага),
    // потім великі групи. Це дає пріоритет "важким" позиціям при виборі коробки.
    const sortedItems = [...items].sort((a, b) => {
      const weightA = a.expectedWeight; // загальна вага групи
      const weightB = b.expectedWeight;
      // Спочатку найважчі групи (більший загальний внесок у баланс ваги)
      return weightB - weightA;
    });
    
    // Розподіляємо кожен товар по коробках з двома пріоритетами:
    // 1. Весь товар — в одну коробку (не дробити)
    // 2. Обираємо коробку з найменшою поточною вагою (балансування по вазі)
    for (const item of sortedItems) {
      // Для монолітних комплектів використовуємо portionsPerItem для розподілу
      // але display quantity залишається незміненим
      const quantityForDistribution = item.portionsPerItem ? item.quantity * item.portionsPerItem : item.quantity;
      const itemWeightPerUnit = item.expectedWeight / quantityForDistribution;
      let remaining = quantityForDistribution;
      let partIndex = 0;
      let itemUnallocated = 0;
      
      while (remaining > 0) {
        // Шукаємо коробку, куди поміститься весь залишок товару цілком
        // Спочатку намагаємось в межах softLimit (рекомендований розподіл)
        const boxesWithEnoughRoom = boxStates.filter(box =>
          (box.softLimit - box.portionsCount) >= remaining &&
          (MAX_BOX_WEIGHT - box.currentWeight) >= itemWeightPerUnit * remaining
        );
        
        // Якщо по softLimit не знайшли — пробуємо hardLimit (фізичний максимум qntTo)
        const boxesWithEnoughRoomHard = boxesWithEnoughRoom.length === 0
          ? boxStates.filter(box =>
              (box.hardLimit - box.portionsCount) >= remaining &&
              (MAX_BOX_WEIGHT - box.currentWeight) >= itemWeightPerUnit * remaining
            )
          : [];
        
        const candidatesForWhole = boxesWithEnoughRoom.length > 0 ? boxesWithEnoughRoom : boxesWithEnoughRoomHard;
        
        if (candidatesForWhole.length > 0) {
          // Є коробка де весь залишок поміщається — обираємо найлегшу (балансування по вазі)
          candidatesForWhole.sort((a, b) => a.currentWeight - b.currentWeight);
          const targetBox = candidatesForWhole[0];
          
          // Для монолітних комплектів: розподіл робиться по порціях (remaining),
          // але в productItems зберігаємо оригінальну кількість з portionsPerItem
          // щоб при підрахунку portions не множити подвійно
          const displayQuantity = item.portionsPerItem ? item.quantity : remaining;
          
          productItems.push({
            ...item,
            id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
            type: 'product' as const,
            quantity: displayQuantity,
            expectedWeight: itemWeightPerUnit * remaining,
            boxIndex: targetBox.index
          });
          
          targetBox.portionsCount += remaining;
          targetBox.currentWeight += itemWeightPerUnit * remaining;
          remaining = 0;
        } else {
          // Весь залишок не вміщується цілком — кладемо максимум у найлегшу коробку.
          // Спочатку пробуємо в межах softLimit, потім — hardLimit.
          let availableBoxes = boxStates.filter(box =>
            box.portionsCount < box.softLimit &&
            (MAX_BOX_WEIGHT - box.currentWeight) >= itemWeightPerUnit
          );
          
          // Fallback до hardLimit якщо по softLimit нема місця
          if (availableBoxes.length === 0) {
            availableBoxes = boxStates.filter(box =>
              box.portionsCount < box.hardLimit &&
              (MAX_BOX_WEIGHT - box.currentWeight) >= itemWeightPerUnit
            );
          }
          
          if (availableBoxes.length === 0) {
            console.warn(`⚠️ Не вдалося розподілити ${remaining} порцій товару "${item.name}"`);
            itemUnallocated = remaining;
            totalUnallocated += remaining;
            break;
          }
          
          // Обираємо найлегшу коробку (балансування по вазі)
          availableBoxes.sort((a, b) => a.currentWeight - b.currentWeight);
          const targetBox = availableBoxes[0];
          
          // Вільне місце по активному ліміту (hard, бо softLimit міг бути вичерпаний)
          const freeSpace = targetBox.hardLimit - targetBox.portionsCount;
          const availableWeight = MAX_BOX_WEIGHT - targetBox.currentWeight;
          const maxByWeight = Math.floor(availableWeight / itemWeightPerUnit);
          const toAdd = Math.min(remaining, freeSpace, maxByWeight);
          
          if (toAdd <= 0) {
            console.warn(`⚠️ Не вдалося розподілити ${remaining} порцій товару "${item.name}" - ліміти вичерпані`);
            itemUnallocated = remaining;
            totalUnallocated += remaining;
            break;
          }
          
          // Для монолітних комплектів: розподіл робиться по порціях (toAdd),
          // але в productItems зберігаємо оригінальну кількість з portionsPerItem
          // щоб при підрахунку portions не множити подвійно
          const displayQuantity = item.portionsPerItem ? item.quantity : toAdd;
          
          productItems.push({
            ...item,
            id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
            type: 'product' as const,
            quantity: displayQuantity,
            expectedWeight: itemWeightPerUnit * toAdd,
            boxIndex: targetBox.index
          });
          
          targetBox.portionsCount += toAdd;
          targetBox.currentWeight += itemWeightPerUnit * toAdd;
          remaining -= toAdd;
          partIndex++;
        }
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

