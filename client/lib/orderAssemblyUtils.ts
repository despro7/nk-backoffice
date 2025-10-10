import type { OrderChecklistItem } from '../types/orderAssembly';

// Інтерфейс для товару з бази даних
export interface Product {
  id: number;
  sku: string;
  name: string;
  weight?: number; // Вага в грамах
  categoryId?: number; // ID категорії для визначення ваги за замовчуванням
  manualOrder?: number; // Ручне сортування
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
                barcode: item.sku,
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
                    barcode: setItem.id,
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
              barcode: item.sku,
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
  return Object.values(expandedItems).map((item, index) => ({
    ...item,
    id: (index + 1).toString()
  }));
};

/**
 * Об'єднує коробки з товарами в один чек-ліст
 */
export const combineBoxesWithItems = (boxes: any[], items: OrderChecklistItem[], isReadyToShip: boolean = false): OrderChecklistItem[] => {
  // Перевіряємо, що у нас є валідні коробки
  if (!boxes || boxes.length === 0) {
    return items;
  }

  // Створюємо унікальні коробки, уникаючи дублювання
  const boxItems: OrderChecklistItem[] = boxes.map((box, index) => ({
    id: `box_${index + 1}`,
    name: box.name || `Коробка ${index + 1}`,
    quantity: 1,
    expectedWeight: Number(box.self_weight || box.weight || 0),
    status: isReadyToShip ? 'done' : 'awaiting_confirmation' as const,
    type: 'box' as const,
    boxSettings: box,
    boxCount: 1,
    boxIndex: index,
    portionsRange: box.portionsRange || { start: 0, end: 0 },
    portionsPerBox: box.portionsPerBox || 0
  }));

  // Якщо є коробки, розділяємо товари по коробках
  if (boxes.length > 1 && boxes[0].portionsPerBox && boxes[0].portionsPerBox > 0) {
    // Розділяємо товари по коробках згідно portionsPerBox
    const portionsPerBox = boxes[0].portionsPerBox;

    const productItems: OrderChecklistItem[] = [];

    let currentBoxIndex = 0;
    let currentBoxPortions = 0;

    for (const item of items) {
      let remaining = item.quantity;
      let partIndex = 0; // Для унікальності id при розділенні товару

      while (remaining > 0) {
        const freeSpace = portionsPerBox - currentBoxPortions;
        
        // Якщо немає вільного місця в поточній коробці, переходимо до наступної
        if (freeSpace === 0) {
          if (currentBoxIndex < boxes.length - 1) {
            currentBoxIndex++;
            currentBoxPortions = 0;
            continue;
          } else {
            // Остання коробка заповнена, додаємо решту в неї
            break;
          }
        }
        
        const toAdd = Math.min(remaining, freeSpace);

        // Додаємо частину товару (або весь товар, якщо він поміщається)
        productItems.push({
          ...item,
          id: `product_${currentBoxIndex}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
          type: 'product' as const,
          quantity: toAdd,
          expectedWeight: (item.expectedWeight / item.quantity) * toAdd, // Пропорційно розподіляємо вагу
          boxIndex: currentBoxIndex
        });

        currentBoxPortions += toAdd;
        remaining -= toAdd;
        partIndex++;

        // Якщо коробка заповнилась — переходимо до наступної
        if (currentBoxPortions >= portionsPerBox && currentBoxIndex < boxes.length - 1 && remaining > 0) {
          currentBoxIndex++;
          currentBoxPortions = 0;
        }
      }
    }

    const result = [...boxItems, ...productItems];
    return result;
  }

  // Якщо коробка одна або немає коробок, або замовлення готове до відправки, додаємо товари як зазвичай
  const productItems = items.map((item, index) => ({
    ...item,
    id: `product_${index + 1}`,
    type: 'product' as const,
    boxIndex: 0
  }));

  const result = [...boxItems, ...productItems];
  return result;
};

