import { LoggingService } from '@/services/LoggingService';
import type { OrderChecklistItem } from '../types/orderAssembly';

// Градації для визначення дефолтного `unitRatio` за вагою в грамах
const GRADATIONS = [
  { min: 525, value: 1.5 },
  { min: 420, value: 1.25 },
  { min: 280, value: 1.0 },
  { min: 185, value: 0.75 },
  { min: 90,  value: 0.5 },
  { min: 0,   value: 0.25 }
];

const deriveUnitRatioFromWeight = (weightGrams?: number): number => {
  if (!weightGrams || typeof weightGrams !== 'number') return 1;
  // Normalize: if weight looks like kilograms (e.g. 0.42 or <= 10), convert to grams
  let grams = weightGrams;
  if (grams > 0 && grams <= 10) grams = grams * 1000;
  for (const g of GRADATIONS) {
    if (grams >= g.min) return g.value;
  }
  return 1;
};

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
 * Рекурсивно обчислює для компонента (однієї одиниці) сумарні "порції" та вагу.
 * Повертає значення для ОДНІЄЇ одиниці товару (тобто не множить на зовнішню quantity).
 * Це дозволяє коректно обробляти вкладені набори.
 */
const computeFlattenedComponent = async (
  sku: string,
  apiCall: any,
  visitedSets: Set<string> = new Set(),
  depth: number = 0,
  cache?: Map<string, any>
): Promise<{ sumPortionsOne: number; weightKgOne: number }> => {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.warn(`⚠️ computeFlattenedComponent: max depth reached for ${sku}`);
    return { sumPortionsOne: 1, weightKgOne: 0 };
  }

  if (visitedSets.has(sku)) {
    console.warn(`🔄 computeFlattenedComponent: cyclic reference detected for ${sku}`);
    return { sumPortionsOne: 1, weightKgOne: 0 };
  }

  visitedSets.add(sku);

  // Per-request cache: повертаємо з кешу, якщо є (calculated results under `calc:`)
  if (cache && cache.has(`calc:${sku}`)) {
    const instr = cache?.get('__orderAssemblyInstrumentation');
    if (instr) instr.cacheHitCalcCount = (instr.cacheHitCalcCount || 0) + 1;
    return cache.get(`calc:${sku}`)!;
  }

  try {
    // Try to use cached product payload if available (batch endpoint populates `prod:SKU` with server-side `calc`)
    const cachedProd = cache?.get(`prod:${sku}`);
    let prod: Product & { unitRatio?: number } | undefined = undefined;
    if (cachedProd) {
      const instr = cache?.get('__orderAssemblyInstrumentation');
      if (instr) instr.cacheHitProdCount = (instr.cacheHitProdCount || 0) + 1;
      prod = cachedProd as Product & { unitRatio?: number };
      // If batch returned server-side aggregates under `calc`, use them immediately
      if (prod && (prod as any).calc) {
        const serverCalc = (prod as any).calc;
        const result = { sumPortionsOne: serverCalc.sumPortionsOne ?? 1, weightKgOne: serverCalc.weightKgOne ?? 0 };
        cache?.set(`calc:${sku}`, result);
        return result;
      }
    } else {
      const instr = cache?.get('__orderAssemblyInstrumentation');
      if (instr) instr.cacheMissProdCount = (instr.cacheMissProdCount || 0) + 1;
      const res = await apiCall(`/api/products/${sku}`);
      if (!res.ok) {
        return { sumPortionsOne: 1, weightKgOne: 0 };
      }
      prod = await res.json();
      cache?.set(`prod:${sku}`, prod);
      if (instr) {
        instr.cacheIndividualCachedCount = (instr.cacheIndividualCachedCount || 0) + 1;
        instr.cacheLastFillAt = new Date().toISOString();
        if (!instr.cacheFirstFillAt) instr.cacheFirstFillAt = instr.cacheLastFillAt;
      }
      // If fetched product contains server calc, cache and return it
      if (prod && (prod as any).calc) {
        const serverCalc = (prod as any).calc;
        const result = { sumPortionsOne: serverCalc.sumPortionsOne ?? 1, weightKgOne: serverCalc.weightKgOne ?? 0 };
        cache?.set(`calc:${sku}`, result);
        return result;
      }
    }

    // Якщо компонент також є набором — рекурсивно підраховуємо його внутрішні компоненти
    if (prod.set && Array.isArray(prod.set) && prod.set.length > 0) {
      let sumP = 0;
      let weightKg = 0;
      for (const si of prod.set) {
        if (!si.id) continue;
        try {
          const agg = await computeFlattenedComponent(si.id, apiCall, new Set(visitedSets), depth + 1, cache);
          sumP += agg.sumPortionsOne * (si.quantity || 0);
          weightKg += agg.weightKgOne * (si.quantity || 0);
        } catch (err) {
          console.warn(`Не вдалося обчислити компонент ${si.id} всередині ${sku}:`, err);
          sumP += (si.quantity || 0) * 1;
        }
      }
      const result = { sumPortionsOne: sumP || 1, weightKgOne: weightKg || 0 };
      cache?.set(`calc:${sku}`, result);
      return result;
    }

    // Простий товар — unitRatio або градація по вазі
    const unitRatio = typeof prod['unitRatio'] === 'number' ? prod['unitRatio'] : deriveUnitRatioFromWeight(prod.weight);
    const weightKgOne = calculateExpectedWeight(prod, 1);
    const simpleResult = { sumPortionsOne: unitRatio || 1, weightKgOne };
    cache?.set(`calc:${sku}`, simpleResult);
    return simpleResult;
  } catch (err) {
    console.warn(`Помилка при отриманні продукту ${sku} у computeFlattenedComponent:`, err);
    return { sumPortionsOne: 1, weightKgOne: 0 };
  } finally {
    visitedSets.delete(sku);
  }
};

/**
 * Рекурсивно рахує фактичну кількість порцій у наборі.
 * На відміну від computeFlattenedComponent, тут не беремо unitRatio/weightRatio,
 * а лише структуру набору та кількості компонентів.
 */
const computeActualSetPortions = async (
  sku: string,
  apiCall: any,
  visitedSets: Set<string> = new Set(),
  depth: number = 0,
  cache?: Map<string, any>
): Promise<number> => {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    console.warn(`⚠️ computeActualSetPortions: max depth reached for ${sku}`);
    return 1;
  }

  if (visitedSets.has(sku)) {
    console.warn(`🔄 computeActualSetPortions: cyclic reference detected for ${sku}`);
    return 1;
  }

  visitedSets.add(sku);

  try {
    let product: Product | undefined = cache?.get(`prod:${sku}`);
    if (!product) {
      const res = await apiCall(`/api/products/${sku}`);
      if (!res.ok) {
        return 1;
      }
      product = await res.json();
      cache?.set(`prod:${sku}`, product);
    }

    if (product.set && Array.isArray(product.set) && product.set.length > 0) {
      let total = 0;
      for (const si of product.set) {
        if (!si.id) continue;
        const nestedPortions = await computeActualSetPortions(si.id, apiCall, new Set(visitedSets), depth + 1, cache);
        total += nestedPortions * (si.quantity || 0);
      }
      return total || 1;
    }

    return 1;
  } catch (err) {
    console.warn(`Помилка при обчисленні фактичних порцій для ${sku}:`, err);
    return 1;
  } finally {
    visitedSets.delete(sku);
  }
};

/**
 * Сортує елементи чек-листа по manualOrder -> type -> name
 */
export const sortChecklistItems = (items: OrderChecklistItem[]): OrderChecklistItem[] => {
  return [...items].sort((a, b) => {
    // Коробки завжди першими, незалежно від manualOrder
    if (a.type !== b.type) {
      return a.type === 'box' ? -1 : 1;
    }

    // Серед однакових типів сортуємо по manualOrder, потім по імені
    const aManualOrder = a.manualOrder ?? 999;
    const bManualOrder = b.manualOrder ?? 999;

    if (aManualOrder !== bManualOrder) {
      return aManualOrder - bManualOrder;
    }

    // Для однакового типу і manualOrder сортуємо по імені
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
  monolithicCategories: string[] = [],
  forcedRegularSetSkus: string[] = [],
  shipmentPayloadSkuSet: Set<string> | null = null,
  useShipmentPayloadMode: boolean = false,
  cache?: Map<string, any>
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
    // Try to reuse per-request cache populated by batchFetchProducts
    let product: Product | undefined = cache?.get(`prod:${sku}`);
    if (product) {
      const instr = cache?.get('__orderAssemblyInstrumentation');
      if (instr) instr.cacheHitProdCount = (instr.cacheHitProdCount || 0) + 1;
    } else {
      const instr = cache?.get('__orderAssemblyInstrumentation');
      if (instr) instr.cacheMissProdCount = (instr.cacheMissProdCount || 0) + 1;
      const response = await apiCall(`/api/products/${sku}`);
      if (!response.ok) {
        const errorMessage = `Не вдалося завантажити товар: "${sku}". Можливо товар видалено або синхронізація товарів ще не виконана.`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      product = await response.json();
      cache?.set(`prod:${sku}`, product);
    }

    // Перевіряємо, чи це комплект
    if (product.set && Array.isArray(product.set) && product.set.length > 0) {
      const isForcedRegularSet = forcedRegularSetSkus.includes(sku);
      const shipmentSaysMonolithic = useShipmentPayloadMode && shipmentPayloadSkuSet?.has(sku) === true;
      // 🚀 НОВА ЛОГІКА: Якщо це монолітна категорія, не розгортаємо його далі
      const categoryIdStr = product.categoryId?.toString();
      LoggingService.orderAssemblyLog(`📦 Перевірка комплекту: "${product.name}" (SKU: ${sku}), categoryId: ${product.categoryId}, categoryName: "${product.categoryName}", monolithicCategories: [${monolithicCategories.join(', ')}], depth=${depth}`);
      
      // DYNAMIC-MONOLITHIC: if product has positive authoritative stock (minus optimistic local decrements), treat as monolithic
      let effectiveStockTotal = 0;
      try {
        const rawStock = (product as any).stockBalanceByStock;
        if (rawStock) {
          if (typeof rawStock === 'string') {
            try { const parsed = JSON.parse(rawStock); Object.values(parsed).forEach((v: any) => effectiveStockTotal += Number(v) || 0); } catch { /* ignore */ }
          } else if (typeof rawStock === 'object') {
            Object.values(rawStock).forEach((v: any) => effectiveStockTotal += Number(v) || 0);
          }
        }
      } catch (e) {
        // ignore parsing errors
      }
      const effectiveRemaining = Math.max(0, effectiveStockTotal);
      const isDynamicMonolithic = effectiveRemaining > 0;

      if (isDynamicMonolithic) {
        LoggingService.orderAssemblyLog(`📦 DYNAMIC-MONOLITH detected for "${product.name}" (SKU: ${sku}) — effectiveRemaining=${effectiveRemaining} — treating as monolithic`, undefined, true);
        // treat as monolithic (do not expand)
        LoggingService.orderAssemblyLog(`📦 Перевірка комплекту: "${product.name}" (SKU: ${sku}), categoryId: ${product.categoryId}, categoryName: "${product.categoryName}", monolithicCategories: [${monolithicCategories.join(', ')}], depth=${depth}`);
      }

      const shouldTreatAsMonolithic = useShipmentPayloadMode
        ? shipmentSaysMonolithic
        : (!isForcedRegularSet && (effectiveRemaining > 0 || (categoryIdStr && Array.isArray(monolithicCategories) && monolithicCategories.includes(categoryIdStr))));

      if (shouldTreatAsMonolithic) {
        // If either dynamic detection OR configured monolithic category -> don't expand
        LoggingService.orderAssemblyLog(`📦 Монолітний комплект: "${product.name}" (SKU: ${sku}). Рекурсія зупинена. depth=${depth}`);

        // Збираємо склад комплекту для відображення комірнику
        // ВАЖЛИВО: Показуємо кількість кожного компонента на ОДИН комплект (не множимо на quantity)
        const compositionPromises = product.set
          .filter(si => si.id)
          .map(async si => {
            // Отримаємо назву (якщо є) та обчислимо unitRatio для компонента
            let name = si.name;
            try {
              if (!name) {
                const cachedComp = cache?.get(`prod:${si.id}`);
                if (cachedComp) {
                  name = cachedComp.name || name;
                } else {
                  const componentResponse = await apiCall(`/api/products/${si.id}`);
                  if (componentResponse.ok) {
                    const componentData = await componentResponse.json();
                    name = componentData.name || `Товар ${si.id}`;
                    cache?.set(`prod:${si.id}`, componentData);
                  }
                }
              }
            } catch (error) {
              console.warn(`Не вдалося отримати назву компонента ${si.id}:`, error);
            }

            // Обчислюємо агреговану 'unitRatio' для ОДНІЄЇ одиниці цього компоненту
            let unitRatioForComp = 1;
            try {
              const agg = await computeFlattenedComponent(si.id, apiCall, new Set(visitedSets), depth + 1, cache);
              unitRatioForComp = agg.sumPortionsOne || 1;
            } catch (err) {
              console.warn(`Не вдалося обчислити unitRatio для компоненту ${si.id}:`, err);
            }

            return {
              name: name || `Товар ${si.id}`,
              quantity: si.quantity || 1,
              unitRatio: unitRatioForComp,
              sku: si.id
            };
          });

        const composition = await Promise.all(compositionPromises);

        // 🔑 Рахуємо фактичні порції для всіх монолітних комплектів (depth == 0 або depth > 0)
        // Це рекурсивна сума всіх вкладених компонентів, без unitRatio/weightRatio.
        let portionsPerSet = 0;
        for (const si of product.set) {
          if (!si.id) continue;
          try {
            const nestedPortions = await computeActualSetPortions(si.id, apiCall, new Set(visitedSets), depth + 1, cache);
            portionsPerSet += nestedPortions * (si.quantity || 0);
          } catch (err) {
            console.warn(`Не вдалося обчислити фактичні порції для компоненту ${si.id}:`, err);
            portionsPerSet += (si.quantity || 0);
          }
        }
        const totalPortions = portionsPerSet * quantity;
        LoggingService.orderAssemblyLog(`📊 Монолітний комплект "${product.name}" (depth=${depth}): ${quantity} × ${portionsPerSet} = ${totalPortions} порцій`);

        // Спробуємо обчислити реальну вагу комплекту як суму ваг компонентів (у кг)
        // та обчислити сумарні 'ефективні порції' на основі unitRatio компонентів
        let totalSetWeightKg = 0;
        let sumComponentPortions = 0;
        try {
          for (const si of product.set) {
            if (!si.id) continue;
            try {
              // Використовуємо рекурсивний агрегатор, щоб коректно працювати з вкладеними наборами
              const agg = await computeFlattenedComponent(si.id, apiCall, new Set(visitedSets), depth + 1, cache);
              // agg дає значення для ОДНІЄЇ одиниці компоненту — множимо на кількість у наборі
              totalSetWeightKg += agg.weightKgOne * (si.quantity || 0);
              sumComponentPortions += agg.sumPortionsOne * (si.quantity || 0);
            } catch (err) {
              console.warn(`Не вдалося обчислити агрегат для компоненту ${si.id}:`, err);
              sumComponentPortions += (si.quantity || 0) * 1;
            }
          }
        } catch (err) {
          console.warn('Помилка під час обчислення ваги комплекту:', err);
        }

        // Якщо не вдалося визначити складну вагу (==0), використаємо fallback через calculateExpectedWeight на батьківському продукті
        if (totalSetWeightKg === 0) {
          totalSetWeightKg = calculateExpectedWeight(product, 1);
        }

        // Очікувана вага для всіх quantity комплектів
        const expectedWeightForQuantityKg = totalSetWeightKg * quantity;

        // Обчислюємо weightRatio = sumComponentPortions / nominal portionsPerSet
        const weightRatio = portionsPerSet > 0 ? (sumComponentPortions / portionsPerSet) : 1;

        // dynamicMonolithic = поточний stock; shippedAsMonolithic = історичне відвантаження з payload
        addOrUpdateExpandedItem(
          expandedItems,
          product,
          quantity,
          sku,
          composition,
          portionsPerSet,
          expectedWeightForQuantityKg,
          weightRatio,
          isDynamicMonolithic,
          shipmentSaysMonolithic,
        );
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
          monolithicCategories,
          forcedRegularSetSkus,
          shipmentPayloadSkuSet,
          useShipmentPayloadMode,
          cache
        );
      }

      // Видаляємо з відвіданих після обробки (для незалежних гілок)
      visitedSets.delete(sku);

    } else {
      // Це звичайний товар (не комплект) - додаємо до результату
      addOrUpdateExpandedItem(expandedItems, product, quantity, sku, undefined);
    }

  } catch (error) {
    // Викидаємо помилку вгору — не ловимо її тут!
    // Це дозволяє expandProductSets поймати помилку і показати критичну модалку
    console.error(`❌ Помилка розгортання товару ${sku}:`, error);
    throw error;
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
  composition?: Array<string | { name: string; quantity?: number; unitRatio?: number; sku?: string }>,
  portionsPerItem?: number,
  expectedWeightKg?: number,
  weightRatio?: number,
  dynamicMonolithic: boolean = false,
  shippedAsMonolithic: boolean = false,
): void => {
  const itemName = product.name;

  // Ключ для об'єднання товарів:
  // - Звичайні товари: itemName (об'єднуються за назвою)
  // - Монолітні товари: itemName + sku (щоб розрізняти одну й ту саму назву з різних контекстів)
  const key = portionsPerItem !== undefined ? `${itemName}:::${sku}` : itemName;

  if (expandedItems[key]) {
    // Товар вже є - збільшуємо кількість
    expandedItems[key].quantity += quantity;

    // Якщо передано expectedWeightKg — додаємо його до існуючої ваги,
    // інакше перераховуємо вагу через calculateExpectedWeight
    if (expectedWeightKg !== undefined) {
      expandedItems[key].expectedWeight = (expandedItems[key].expectedWeight || 0) + expectedWeightKg;
    } else {
      expandedItems[key].expectedWeight = calculateExpectedWeight(product, expandedItems[key].quantity);
    }

    // Оновлюємо склад, якщо він ще не був доданий
    if (composition && (!expandedItems[key].composition || expandedItems[key].composition!.length === 0)) {
      expandedItems[key].composition = composition;
    }
    // Оновлюємо weightRatio, якщо передано
    if (typeof weightRatio === 'number') {
      (expandedItems[key] as any).weightRatio = weightRatio;
    }
    // Проксіюємо server-side calc, якщо є
    if ((product as any) && (product as any).calc) {
      (expandedItems[key] as any).calc = (product as any).calc;
    }
    if ((product as any) && typeof (product as any).unitRatio === 'number') {
      (expandedItems[key] as any).unitRatio = (product as any).unitRatio;
    }
    if (dynamicMonolithic) {
      expandedItems[key].dynamicMonolithic = true;
    }
    if (shippedAsMonolithic) {
      expandedItems[key].shippedAsMonolithic = true;
    }
  } else {
    // Додаємо новий товар
    expandedItems[key] = {
      id: sku,
      name: itemName,
      quantity: quantity,
      expectedWeight: expectedWeightKg !== undefined ? expectedWeightKg : calculateExpectedWeight(product, quantity),
      status: 'default' as const,
      type: 'product',
      sku: sku,
      // Лише справжній ШК, відмінний від SKU (інакше UI/сканер плутають fallback із barcode)
      barcode: (product.barcode && product.barcode !== sku) ? product.barcode : undefined,
      manualOrder: product.manualOrder,
      composition: composition,
      portionsPerItem: portionsPerItem,
      dynamicMonolithic: dynamicMonolithic || undefined,
      shippedAsMonolithic: shippedAsMonolithic || undefined,
    };
    if (typeof weightRatio === 'number') {
      (expandedItems[key] as any).weightRatio = weightRatio;
    }
    // Зберігаємо server-side calc та unitRatio для UI
    if ((product as any) && (product as any).calc) {
      (expandedItems[key] as any).calc = (product as any).calc;
    }
    if ((product as any) && typeof (product as any).unitRatio === 'number') {
      (expandedItems[key] as any).unitRatio = (product as any).unitRatio;
    }
    if (dynamicMonolithic) {
      expandedItems[key].dynamicMonolithic = true;
    }
    if (shippedAsMonolithic) {
      expandedItems[key].shippedAsMonolithic = true;
    }
  }

  LoggingService.orderAssemblyLog(
    `  ✅ Додано: ${itemName} × ${quantity} (SKU: ${sku})${composition ? ' [M]' : ''}${portionsPerItem ? ` [portionsPerItem=${portionsPerItem}]` : ''}${shippedAsMonolithic ? ' [shipped]' : ''}`,
  );
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
  monolithicCategoryIds: number[] = [],
  forcedRegularSetSkus: string[] = [],
  shipmentPayloadBySku: Record<string, { accGood: string; quantity: number }> | null = null,
  useShipmentPayloadMode: boolean = false
): Promise<OrderChecklistItem[]> => {
  const expandedItems: { [key: string]: OrderChecklistItem } = {};
  // Per-request cache to avoid duplicate API calls during one expand operation
  const perRequestCache: Map<string, any> = new Map();
  const shipmentPayloadSkuSet = useShipmentPayloadMode && shipmentPayloadBySku
    ? new Set(Object.keys(shipmentPayloadBySku).map((sku) => String(sku).trim()).filter(Boolean))
    : null;

  // --- Instrumentation for diagnostics ---
  const instrumentation: any = {
    fallbackGetCount: 0, // direct /api/products/:sku calls
    individualFetchCount: 0, // individual fetches performed inside batch fallback
    batchCalls: 0, // number of POST /api/expand/flatten calls
    batchFoundCount: 0,
    batchNotFoundCount: 0,
    totalNetworkMs: 0
  };

    // expose instrumentation to helper functions via cache special key
    // will be attached to perRequestCache after it's created

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const cpuStart = now();

  // Wrap apiCall to count fallback GETs and batch calls
  const instrumentedApiCall = async (url: string, opts?: any) => {
    try {
      const isProductsGet = typeof url === 'string' && url.startsWith('/api/products/');
      const isFlattenPost = typeof url === 'string' && url === '/api/expand/flatten' && (opts?.method ?? 'POST') === 'POST';
      if (isProductsGet) instrumentation.fallbackGetCount++;
      if (isFlattenPost) instrumentation.batchCalls++;

      const before = now();
      const res = await apiCall(url, opts);
      const after = now();
      instrumentation.totalNetworkMs = (instrumentation.totalNetworkMs || 0) + (after - before);

      // Try to read batch metadata without consuming original body (use clone if available)
      if (isFlattenPost && res && (res as any).clone) {
        try {
          const clone = await (res as any).clone().json().catch(() => null);
          if (clone) {
            if (typeof clone.foundCount === 'number') instrumentation.batchFoundCount += clone.foundCount;
            if (Array.isArray(clone.notFound)) instrumentation.batchNotFoundCount += clone.notFound.length;
          }
        } catch (e) {
          // ignore
        }
      }

      return res;
    } catch (err) {
      throw err;
    }
  };

  LoggingService.orderAssemblyLog(`🚀 Початок розгортання ${orderItems.length} товарів замовлення... (Монолітні категорії ID: [${monolithicCategoryIds.join(', ') || 'немає'}])`);
  LoggingService.orderAssemblyLog(`📋 Вхідні товари: ${JSON.stringify(orderItems.map(item => ({ name: item.productName, sku: item.sku, quantity: item.quantity })))}`);

  // --- Batch fetch products (iterative) to populate perRequestCache ---
  const batchFetchProducts = async (initialSkus: string[]) => {
    const toFetch = new Set(initialSkus.filter(s => !!s));
    const fetched = new Set<string>();
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS && toFetch.size > 0; round++) {
      const skusBatch = Array.from(toFetch).filter(s => !fetched.has(s));
      if (skusBatch.length === 0) break;

      try {
        // Try batch endpoint first — increment round counter
        instrumentation.batchRounds = (instrumentation.batchRounds || 0) + 1;
        const res = await instrumentedApiCall('/api/expand/flatten', { method: 'POST', body: JSON.stringify({ skus: skusBatch }), headers: { 'Content-Type': 'application/json' } });
        if (res && res.ok) {
          const json = await res.json();
          const productsObj = (json && json.products) ? json.products : json;
          if (json) {
            instrumentation.batchLastDurationMs = json.durationMs;
            instrumentation.batchLastFound = json.foundCount || 0;
            instrumentation.batchLastNotFound = Array.isArray(json.notFound) ? json.notFound.length : 0;
          }
          for (const sku of Object.keys(productsObj || {})) {
            if (productsObj[sku]) {
              perRequestCache.set(`prod:${sku}`, productsObj[sku]);
                // increment aggregated counters instead of noisy per-SKU debug
                instrumentation.cacheBatchCachedCount = (instrumentation.cacheBatchCachedCount || 0) + 1;
                instrumentation.cacheLastFillAt = new Date().toISOString();
                if (!instrumentation.cacheFirstFillAt) instrumentation.cacheFirstFillAt = instrumentation.cacheLastFillAt;
              fetched.add(sku);
              // enqueue inner components if present
              if (productsObj[sku].set && Array.isArray(productsObj[sku].set)) {
                for (const s of productsObj[sku].set) {
                  if (s && s.id && !perRequestCache.has(`prod:${s.id}`)) toFetch.add(s.id);
                }
              }
            }
          }
          // remove processed
          skusBatch.forEach(s => toFetch.delete(s));
          continue;
        }
      } catch (e) {
        instrumentation.batchFailures = (instrumentation.batchFailures || 0) + 1;
        LoggingService.orderAssemblyLog(`[orderAssembly] batch endpoint failed, falling back to individual fetch (round ${instrumentation.batchRounds || 0})`);
        // fallthrough to individual fetch
      }

      // Fallback: fetch individually
      for (const sku of skusBatch) {
        try {
            const r = await instrumentedApiCall(`/api/products/${sku}`);
          instrumentation.individualFetchCount++;
          if (r && r.ok) {
            const p = await r.json();
            perRequestCache.set(`prod:${sku}`, p);
            instrumentation.cacheIndividualCachedCount = (instrumentation.cacheIndividualCachedCount || 0) + 1;
            instrumentation.cacheLastFillAt = new Date().toISOString();
            if (!instrumentation.cacheFirstFillAt) instrumentation.cacheFirstFillAt = instrumentation.cacheLastFillAt;
            fetched.add(sku);
            if (p.set && Array.isArray(p.set)) {
              for (const s of p.set) {
                if (s && s.id && !perRequestCache.has(`prod:${s.id}`)) toFetch.add(s.id);
              }
            }
          }
        } catch (err) {
          // ignore single fetch errors; compute will fallback later
        } finally {
          toFetch.delete(sku);
        }
      }
    }
  };

  // Collect initial SKUs from order items
  const initialSkus: string[] = [];
  for (const item of orderItems) if (item && item.sku) initialSkus.push(item.sku);
  // Run batch fetch in background (await it to ensure cache warm)
    // attach instrumentation to cache so nested helpers can update counters
    perRequestCache.set('__orderAssemblyInstrumentation', instrumentation);
    await batchFetchProducts(initialSkus);

  for (const item of orderItems) {
    LoggingService.orderAssemblyLog(`\n📦 Обробка: ${item.productName} (SKU: ${item.sku}) × ${item.quantity}`);

    // Рекурсивно розгортаємо кожен товар замовлення
    // Помилка буде викинута вгору до OrderView.tsx для обробки
    await expandProductRecursively(
      item.sku,
      item.quantity,
      apiCall,
      expandedItems,
      new Set(), // Новий Set для кожного товару замовлення
      0, // Починаємо з глибини 0
      monolithicCategoryIds.map(id => id.toString()), // Конвертуємо ID категорій в строки для порівняння
      forcedRegularSetSkus,
      shipmentPayloadSkuSet,
      useShipmentPayloadMode,
      perRequestCache
    );
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

    // Aggregated instrumentation summary (replace noisy per-SKU debug lines)
    try {
      const instr = instrumentation;
      const summaryLines: string[] = [];
      summaryLines.push(`🔍 Instrumentation summary:`);
      summaryLines.push(`  - batchCalls: ${instr.batchCalls || 0}`);
      summaryLines.push(`  - fallbackGetCount: ${instr.fallbackGetCount || 0}`);
      summaryLines.push(`  - individualFetchCount: ${instr.individualFetchCount || 0}`);
      summaryLines.push(`  - cacheBatchCachedCount: ${instr.cacheBatchCachedCount || 0}`);
      summaryLines.push(`  - cacheIndividualCachedCount: ${instr.cacheIndividualCachedCount || 0}`);
      summaryLines.push(`  - batchFoundCount: ${instr.batchFoundCount || 0}`);
      summaryLines.push(`  - batchNotFoundCount: ${instr.batchNotFoundCount || 0}`);
      summaryLines.push(`  - totalNetworkMs: ${Math.round(instr.totalNetworkMs || 0)} ms`);
      if (instr.cacheFirstFillAt) summaryLines.push(`  - cacheFirstFillAt: ${instr.cacheFirstFillAt}`);
      if (instr.cacheLastFillAt) summaryLines.push(`  - cacheLastFillAt: ${instr.cacheLastFillAt}`);
      // Force output of instrumentation summary regardless of user logging settings
      LoggingService.orderAssemblyLog(summaryLines.join('\n'), undefined);
    } catch (e) {
      // ignore
    }
  
  return result;
};

type PackingBoxState = {
  index: number;
  portionsCount: number;
  portionsCalc: number;
  currentWeight: number;
  softLimit: number;
  hardLimit: number;
};

/** Чи вміщується цілий монолітний комплект у коробку (hardLimit + вага). */
const canFitWholeMonolithicUnit = (
  box: PackingBoxState,
  portionsPerItem: number,
  weightPerUnit: number,
  maxBoxWeight: number
): boolean => {
  const freeHard = box.hardLimit - (box.portionsCount || 0);
  const freeCalc = Math.ceil(box.hardLimit - (box.portionsCalc || 0));
  const freeWeight = maxBoxWeight - box.currentWeight;
  return freeHard >= portionsPerItem && freeCalc >= portionsPerItem && freeWeight >= weightPerUnit;
};

/**
 * Умовне розділення одного oversized-монолітного комплекту по коробках за місткістю.
 * Облік (bySku) не змінюється — лише packing UI: N рядків з частковим portionsPerItem.
 */
const splitMonolithicUnitAcrossBoxes = (
  item: OrderChecklistItem,
  unitIndex: number,
  fullPortionsPerItem: number,
  weightPerUnit: number,
  boxStates: PackingBoxState[],
  maxBoxWeight: number
): { parts: OrderChecklistItem[]; unallocatedPortions: number } => {
  let remainingPortions = fullPortionsPerItem;
  let remainingWeight = weightPerUnit;
  const weightPerPortion = fullPortionsPerItem > 0 ? weightPerUnit / fullPortionsPerItem : 0;
  const draftParts: Array<{
    boxIndex: number;
    takePortions: number;
    takeWeight: number;
  }> = [];

  const pickCandidates = (preferSoft: boolean): PackingBoxState[] => {
    const filtered = boxStates.filter((box) => {
      const limit = preferSoft ? box.softLimit : box.hardLimit;
      const freeSpace = limit - (box.portionsCount || 0);
      const freeWeight = maxBoxWeight - box.currentWeight;
      return freeSpace > 0 && freeWeight > 0;
    });
    return filtered.sort((a, b) => a.currentWeight - b.currentWeight);
  };

  while (remainingPortions > 0) {
    let preferSoft = true;
    let candidates = pickCandidates(true);
    if (candidates.length === 0) {
      preferSoft = false;
      candidates = pickCandidates(false);
    }
    if (candidates.length === 0) {
      break;
    }

    const targetBox = candidates[0];
    const limit = preferSoft ? targetBox.softLimit : targetBox.hardLimit;
    const freeSpace = Math.max(0, limit - (targetBox.portionsCount || 0));
    const availableWeight = Math.max(0, maxBoxWeight - targetBox.currentWeight);
    const maxByWeight = weightPerPortion > 0
      ? Math.floor(availableWeight / weightPerPortion + 1e-9)
      : freeSpace;

    let takePortions = Math.min(remainingPortions, freeSpace, maxByWeight);

    // Фінальний залишок: якщо порції й вага вміщуються — кладемо все
    if (
      takePortions < remainingPortions &&
      freeSpace >= remainingPortions &&
      availableWeight + 1e-9 >= remainingWeight
    ) {
      takePortions = remainingPortions;
    }

    if (takePortions <= 0) {
      if (!preferSoft) break;
      const hardOnly = pickCandidates(false);
      const alt = hardOnly.find((b) => {
        const free = b.hardLimit - (b.portionsCount || 0);
        const wFree = maxBoxWeight - b.currentWeight;
        const maxW = weightPerPortion > 0 ? Math.floor(wFree / weightPerPortion + 1e-9) : free;
        return Math.min(remainingPortions, free, maxW) > 0
          || (free >= remainingPortions && wFree + 1e-9 >= remainingWeight);
      });
      if (!alt) break;
      const free = alt.hardLimit - (alt.portionsCount || 0);
      const wFree = maxBoxWeight - alt.currentWeight;
      const maxW = weightPerPortion > 0 ? Math.floor(wFree / weightPerPortion + 1e-9) : free;
      takePortions = Math.min(remainingPortions, free, maxW);
      if (
        takePortions < remainingPortions &&
        free >= remainingPortions &&
        wFree + 1e-9 >= remainingWeight
      ) {
        takePortions = remainingPortions;
      }
      if (takePortions <= 0) break;

      const takeWeight = remainingPortions === takePortions
        ? remainingWeight
        : weightPerPortion * takePortions;
      draftParts.push({ boxIndex: alt.index, takePortions, takeWeight });
      alt.portionsCount = (alt.portionsCount || 0) + takePortions;
      alt.portionsCalc = (alt.portionsCalc || 0) + takePortions;
      alt.currentWeight += takeWeight;
      remainingPortions -= takePortions;
      remainingWeight = Math.max(0, remainingWeight - takeWeight);
      continue;
    }

    const takeWeight = remainingPortions === takePortions
      ? remainingWeight
      : weightPerPortion * takePortions;

    draftParts.push({ boxIndex: targetBox.index, takePortions, takeWeight });
    targetBox.portionsCount = (targetBox.portionsCount || 0) + takePortions;
    targetBox.portionsCalc = (targetBox.portionsCalc || 0) + takePortions;
    targetBox.currentWeight += takeWeight;
    remainingPortions -= takePortions;
    remainingWeight = Math.max(0, remainingWeight - takeWeight);
  }

  const splitTotal = draftParts.length;
  const groupId = `${item.sku || item.id}_unit${unitIndex}_${fullPortionsPerItem}`;
  const parts: OrderChecklistItem[] = draftParts.map((part, splitIndex) => ({
    ...item,
    id: `product_${part.boxIndex}_${item.sku || item.id}_u${unitIndex}_split${splitIndex}`,
    type: 'product' as const,
    quantity: 1,
    portionsPerItem: part.takePortions,
    expectedWeight: Number(part.takeWeight.toFixed(3)),
    boxIndex: part.boxIndex,
    monolithicSplitGroupId: groupId,
    monolithicSplitIndex: splitIndex,
    monolithicSplitTotal: splitTotal,
    monolithicFullPortionsPerItem: fullPortionsPerItem,
  }));

  return { parts, unallocatedPortions: Math.max(0, remainingPortions) };
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
  boxInitialStatus: 'default' | 'pending' | 'awaiting_confirmation' | 'done' = 'default'
): { checklistItems: OrderChecklistItem[]; unallocatedPortions: number; unallocatedItems: Array<{ name: string; quantity: number }>; boxStates?: any[] } => {
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
      portionsCalc: 0,
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
    const maxBoxHardLimit = Math.max(...boxStates.map(box => Number(box.hardLimit || 0)), 0);

    for (const item of sortedItems) {
      const isMonolithicItem = typeof item.portionsPerItem === 'number' && item.portionsPerItem > 0;

      // Для монолітних комплектів рахуємо місткість по фізичних порціях у комплекті.
      // `weightRatio` лишаємо для балансування та відображення, але не даємо йому блокувати
      // розміщення цілісного монолітного набору в коробці.
      // Для звичайних одиниць або звичайних наборів (включно з тими, що всередині монолітних наборів)
      // застосовуємо `unitRatio` (коли воно присутнє) як кількість порцій на одиницю.
      const rawPortionsPerItem = item.portionsPerItem;
      const weightRatio = (item as any).weightRatio ?? 1;
      const unitRatio = (item as any).unitRatio ?? 1;

      // Якщо це монолітний набір — беремо raw portionsPerItem.
      // Для звичайних товарів залишаємо розрахунок через unitRatio.
      const effectivePortionsPerItem = isMonolithicItem
        ? Number(rawPortionsPerItem || 1)
        : unitRatio;

      // Distribute by physical units (sets or items). We'll track two measures on boxes:
      // - portionsCount: integer capacity units used (for limits). For monolithic sets this equals units * portionsPerItem, for ordinary items it's units.
      // - portionsCalc: calculated portions taking `unitRatio`/`weightRatio` into account (may be fractional)
      const unitsTotal = Math.max(0, Math.floor(item.quantity)); // number of physical units (sets or items)
      const weightPerUnit = unitsTotal > 0 ? (item.expectedWeight / unitsTotal) : 0;
      let remainingUnits = unitsTotal;
      let partIndex = 0;
      let itemUnallocated = 0;

      // Oversized monolithic: жодна коробка не приймає цілий комплект → capacity-split по порціях
      const fullPortionsPerItem = Number(item.portionsPerItem || 0);
      if (
        isMonolithicItem &&
        unitsTotal >= 1 &&
        fullPortionsPerItem > 0 &&
        !boxStates.some((box) =>
          canFitWholeMonolithicUnit(box, fullPortionsPerItem, weightPerUnit, MAX_BOX_WEIGHT)
        )
      ) {
        LoggingService.orderAssemblyLog(
          `📦 Capacity-split моноліту "${item.name}": ${fullPortionsPerItem} порцій / ${weightPerUnit.toFixed(3)} кг не вміщується цілком`
        );
        for (let unitIndex = 0; unitIndex < unitsTotal; unitIndex++) {
          const { parts, unallocatedPortions } = splitMonolithicUnitAcrossBoxes(
            item,
            unitIndex,
            fullPortionsPerItem,
            weightPerUnit,
            boxStates,
            MAX_BOX_WEIGHT
          );
          productItems.push(...parts);
          if (unallocatedPortions > 0) {
            itemUnallocated += unallocatedPortions;
            totalUnallocated += unallocatedPortions;
            console.warn(
              `⚠️ Capacity-split: не розміщено ${unallocatedPortions} порцій "${item.name}" (unit ${unitIndex + 1}/${unitsTotal})`
            );
          }
        }
        if (itemUnallocated > 0) {
          unallocatedItems.push({
            name: item.name,
            quantity: itemUnallocated
          });
        }
        continue;
      }
          
      while (remainingUnits > 0) {
        // Шукаємо коробку, куди поміститься весь залишок товару цілком
        // Спочатку намагаємось в межах softLimit (рекомендований розподіл)
        // Compute required capacity in "portions" terms for the remaining units
        const capacityNeededForRemaining = remainingUnits * (isMonolithicItem ? Number(item.portionsPerItem || 1) : 1);
        const calcNeededForRemaining = remainingUnits * (effectivePortionsPerItem || (isMonolithicItem ? Number(item.portionsPerItem || 1) : 1));
        // Перевіряємо, чи коробка має достатньо місця
        // Math.ceil для вільного простору у portionsCalc — стандартні математичні правила округлення
        const boxesWithEnoughRoom = boxStates.filter(box =>
          (box.softLimit - (box.portionsCount || 0)) >= capacityNeededForRemaining &&
          (MAX_BOX_WEIGHT - box.currentWeight) >= weightPerUnit * remainingUnits &&
          (Math.ceil(box.hardLimit - (box.portionsCalc || 0)) >= calcNeededForRemaining)
        );
        
        // Якщо по softLimit не знайшли — пробуємо hardLimit (фізичний максимум qntTo)
        const boxesWithEnoughRoomHard = boxesWithEnoughRoom.length === 0
          ? boxStates.filter(box =>
              (box.hardLimit - (box.portionsCount || 0)) >= capacityNeededForRemaining &&
              (MAX_BOX_WEIGHT - box.currentWeight) >= weightPerUnit * remainingUnits &&
              (Math.ceil(box.hardLimit - (box.portionsCalc || 0)) >= calcNeededForRemaining)
            )
          : [];
        
        const candidatesForWhole = boxesWithEnoughRoom.length > 0 ? boxesWithEnoughRoom : boxesWithEnoughRoomHard;
        
        if (candidatesForWhole.length > 0) {
          // Є коробка де весь залишок поміщається — обираємо найлегшу (балансування по вазі)
          candidatesForWhole.sort((a, b) => a.currentWeight - b.currentWeight);
          const targetBox = candidatesForWhole[0];
          
          // We can place all remaining UNITS into this box
          const unitsToPlace = remainingUnits;
          // displayQuantity: how many item rows we push (for monolithic it's units/sets, for ordinary items it's units)
          const displayQuantity = unitsToPlace;

          productItems.push({
            ...item,
            id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
            type: 'product' as const,
            quantity: displayQuantity,
            expectedWeight: weightPerUnit * unitsToPlace,
            boxIndex: targetBox.index
          });

          // Update box capacity: portionsCount uses physical portions (sets*portionsPerItem or units)
          const capacityAdded = unitsToPlace * (isMonolithicItem ? Number(item.portionsPerItem || 1) : 1);
          // portionsCalc accumulates computed portions; for monolithic items we keep raw portions
          const calcAdded = unitsToPlace * (effectivePortionsPerItem || (item.portionsPerItem || 1));

          targetBox.portionsCount = (targetBox.portionsCount || 0) + capacityAdded;
          targetBox.portionsCalc = (targetBox.portionsCalc || 0) + calcAdded;
          targetBox.currentWeight += weightPerUnit * unitsToPlace;
          remainingUnits = 0;
        } else {
          // Весь залишок не вміщується цілком — кладемо максимум у найлегшу коробку.
          // Спочатку пробуємо в межах softLimit, потім — hardLimit.
          let availableBoxes = boxStates.filter(box =>
            box.portionsCount < box.softLimit &&
            (MAX_BOX_WEIGHT - box.currentWeight) >= weightPerUnit
          );
          
          // Fallback до hardLimit якщо по softLimit нема місця
          if (availableBoxes.length === 0) {
            availableBoxes = boxStates.filter(box =>
              box.portionsCount < box.hardLimit &&
              (MAX_BOX_WEIGHT - box.currentWeight) >= weightPerUnit
            );
          }
          
          if (availableBoxes.length === 0) {
            console.warn(`⚠️ Не вдалося розподілити ${remainingUnits} одиниць товару "${item.name}"`);
            itemUnallocated = remainingUnits;
            totalUnallocated += remainingUnits;
            break;
          }
          
          // Обираємо найлегшу коробку (балансування по вазі)
          availableBoxes.sort((a, b) => a.currentWeight - b.currentWeight);
          const targetBox = availableBoxes[0];
          
          // Вільне місце по активному ліміту (hard, бо softLimit міг бути вичерпаний)
          const freeSpace = targetBox.hardLimit - (targetBox.portionsCount || 0);
          const availableWeight = MAX_BOX_WEIGHT - targetBox.currentWeight;
          // maxByUnits by weight
          const maxByUnitsWeight = weightPerUnit > 0 ? Math.floor(availableWeight / weightPerUnit) : freeSpace;
          // toAdd is capacity in portions; convert freeSpace (portions) to possible units to add based on item type
          // For monolithic sets, 1 unit consumes item.portionsPerItem portions; for ordinary item 1 unit consumes 1 portion.
          const maxUnitsBySpace = isMonolithicItem ? Math.floor(freeSpace / Number(item.portionsPerItem || 1)) : freeSpace;
          // also cap by remaining *computed portions* vs remaining calc capacity
          // Math.ceil для вільного простору у portionsCalc — стандартні математичні правила округлення
          const calcAvailable = Math.max(0, Math.ceil(targetBox.hardLimit - (targetBox.portionsCalc || 0)));
          const maxUnitsByCalc = (effectivePortionsPerItem > 0) ? Math.floor(calcAvailable / effectivePortionsPerItem) : maxUnitsBySpace;
          const toAddUnits = Math.min(remainingUnits, maxUnitsBySpace, maxByUnitsWeight, maxUnitsByCalc);

          const toAdd = toAddUnits * (isMonolithicItem ? Number(item.portionsPerItem || 1) : 1);
          
          if (toAdd <= 0) {
            console.warn(`⚠️ Не вдалося розподілити ${remainingUnits} одиниць товару "${item.name}" - ліміти вичерпані`);
            itemUnallocated = remainingUnits;
            totalUnallocated += remainingUnits;
            break;
          }
          
          // Для монолітних комплектів: розподіл робиться по порціях (toAdd),
          // але в productItems зберігаємо оригінальну кількість з portionsPerItem
          // щоб при підрахунку portions не множити подвійно
          // Якщо товар монолітний (portionsPerItem) — округлюємо додані порції до кратного кількості порцій в одному комплекті
          // If monolithic, ensure we only add whole sets (units). toAddUnits already respects that.
          const unitsToPlace = toAddUnits;
          if (unitsToPlace <= 0) {
            console.warn(`⚠️ Не вдалося розподілити ${remainingUnits} одиниць товару "${item.name}" - ліміти вичерпані`);
            itemUnallocated = remainingUnits;
            totalUnallocated += remainingUnits;
            break;
          }

          const perEffectiveForDisplay = effectivePortionsPerItem || item.portionsPerItem || 1;
          const displayQuantityUnits = unitsToPlace;
          const capacityAddedUnits = unitsToPlace * (isMonolithicItem ? Number(item.portionsPerItem || 1) : 1);
          const calcAdded = unitsToPlace * (effectivePortionsPerItem || (item.portionsPerItem || 1));

          productItems.push({
            ...item,
            id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
            type: 'product' as const,
            quantity: displayQuantityUnits,
            expectedWeight: weightPerUnit * unitsToPlace,
            boxIndex: targetBox.index
          });

          targetBox.portionsCount = (targetBox.portionsCount || 0) + capacityAddedUnits;
          targetBox.portionsCalc = (targetBox.portionsCalc || 0) + calcAdded;
          targetBox.currentWeight += weightPerUnit * unitsToPlace;
          remainingUnits -= unitsToPlace;
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
    
    // Merge productItems that ended up in the same box and have the same name
    // Не зливаємо capacity-split частини (різний groupId / portionsPerItem)
    const mergedInBoxes: OrderChecklistItem[] = [];
    for (const pi of productItems) {
      const existing = mergedInBoxes.find((m) =>
        m.name === pi.name &&
        m.boxIndex === pi.boxIndex &&
        m.portionsPerItem === pi.portionsPerItem &&
        m.monolithicSplitGroupId === pi.monolithicSplitGroupId &&
        m.monolithicSplitIndex === pi.monolithicSplitIndex
      );
      if (existing) {
        existing.quantity += pi.quantity;
        existing.expectedWeight = Number((existing.expectedWeight + (pi.expectedWeight || 0)).toFixed(2));
      } else {
        mergedInBoxes.push({ ...pi });
      }
    }

    const result = [...boxItems, ...mergedInBoxes];

    // Normalize boxStates for external consumption: integer portionsCount and fixed weight
    const normalizedBoxStates = boxStates.map(b => {
      const rawCalc = Number(b.portionsCalc || 0);
      const hard = Math.round(b.hardLimit || 0);

      return {
        ...b,
        portionsCount: Math.round(b.portionsCount || 0),
        portionsCalc: Number(rawCalc.toFixed ? rawCalc.toFixed(2) : rawCalc),
        currentWeight: Number((b.currentWeight || 0).toFixed ? (b.currentWeight || 0).toFixed(2) : (b.currentWeight || 0)),
        softLimit: Math.round(b.softLimit || 0),
        hardLimit: hard
      };
    });

    // Якщо є нерозподілені порції, виводимо детальне попередження
    const compactBoxView = (boxes: any[]) => boxes.map(b => {
      const rawCalcVal = Number((b.portionsCalc ?? b.portCalc ?? 0));
      const hard = Math.round(b.hardLimit ?? 0);

      return {
        idx: b.index,
        pCount: Math.round(b.portionsCount ?? b.portCount ?? 0),
        pCalc: Number(rawCalcVal.toFixed ? rawCalcVal.toFixed(2) : rawCalcVal),
        curWeight: Number((b.currentWeight ?? b.curWeight ?? 0).toFixed ? (b.currentWeight ?? b.curWeight ?? 0).toFixed(2) : (b.currentWeight ?? b.curWeight ?? 0)),
        // sLimit: Math.round(b.softLimit ?? 0),
        hLimit: hard
      };
    });

    const compact = compactBoxView(normalizedBoxStates);
    let compactWithTotals = compact;
    if (compact.length > 1) {
      const sums = compact.reduce((acc, b) => {
        acc.pCount += Number(b.pCount || 0);
        acc.pCalc += Number(b.pCalc || 0);
        acc.wKg += Number(b.curWeight || 0);
        return acc;
      }, { pCount: 0, pCalc: 0, wKg: 0 });

      const totalsRow = {
        idx: 'Σ',
        pCount: sums.pCount,
        pCalc: Number(sums.pCalc.toFixed ? sums.pCalc.toFixed(2) : Number(sums.pCalc)),
        curWeight: Number(sums.wKg.toFixed ? sums.wKg.toFixed(2) : Number(sums.wKg)),
        sLimit: 0,
        hLimit: 0
      };

      compactWithTotals = [...compact, totalsRow];
    }

    if (totalUnallocated > 0) {
      console.error('❌ КРИТИЧНА ПОМИЛКА: Не всі товари поміщаються в коробки!');
      console.error(`Всього нерозподілених порцій: ${totalUnallocated}`);
      console.error('Деталі:', unallocatedItems);
      console.error('Стан коробок:', compactWithTotals);
    } else {
      console.log('Стан коробок:', compactWithTotals);
    }
    
    return {
      checklistItems: result,
      unallocatedPortions: totalUnallocated,
      unallocatedItems,
      boxStates: normalizedBoxStates
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
    unallocatedItems: [],
    boxStates: boxes.map((box, index) => ({
      index,
      portionsCount: 0,
      currentWeight: Number(box.self_weight || box.weight || 0),
      softLimit: Math.round(box.portionsPerBox || 0),
      hardLimit: Math.round(box.qntTo || box.portionsPerBox || 0)
    }))
  };
};

