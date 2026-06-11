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

        // 🔑 Рахуємо порції для всіх монолітних комплектів (depth == 0 або depth > 0)
        // Порції = кількість компонентів у комплекті (по одному кожного)
        const portionsPerSet = product.set.reduce((sum, si) => sum + (si.quantity || 0), 0);
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

        addOrUpdateExpandedItem(expandedItems, product, quantity, sku, composition, portionsPerSet, expectedWeightForQuantityKg, weightRatio);
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
  weightRatio?: number
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
      barcode: product.barcode || sku,
      manualOrder: product.manualOrder,
      composition: composition,
      portionsPerItem: portionsPerItem
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
  // Per-request cache to avoid duplicate API calls during one expand operation
  const perRequestCache: Map<string, any> = new Map();

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
      LoggingService.orderAssemblyLog(summaryLines.join('\n'), undefined, true);
    } catch (e) {
      // ignore
    }
  
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
      // Для монолітних комплектів використовуємо `portionsPerItem` разом із `weightRatio`.
      // Для звичайних одиниць або звичайних наборів (включно з тими, що всередині монолітних наборів)
      // застосовуємо `unitRatio` (коли воно присутнє) як кількість порцій на одиницю.
      const rawPortionsPerItem = item.portionsPerItem;
      const weightRatio = (item as any).weightRatio ?? 1;
      const unitRatio = (item as any).unitRatio ?? 1;

      // Якщо це монолітний набір (має portionsPerItem) — використовуємо weightRatio,
      // інакше вважаємо, що одна одиниця відповідає `unitRatio` порціям.
      const effectivePortionsPerItem = rawPortionsPerItem
        ? rawPortionsPerItem * weightRatio
        : unitRatio;

      const quantityForDistribution = effectivePortionsPerItem ? item.quantity * effectivePortionsPerItem : item.quantity;
      const itemWeightPerUnit = (item.expectedWeight / quantityForDistribution);
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
          let displayQuantity: number;
          if (item.portionsPerItem) {
            const perEffective = effectivePortionsPerItem || item.portionsPerItem || 1;
            const setsCount = Math.floor(remaining / perEffective);
            displayQuantity = setsCount;
          } else {
            displayQuantity = remaining;
          }
          
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
          // Якщо товар монолітний (portionsPerItem) — округлюємо додані порції до кратного кількості порцій в одному комплекті
          let toAddAdjusted = toAdd;
          if (item.portionsPerItem) {
            const perEffective = effectivePortionsPerItem || item.portionsPerItem || 1;
            const fullSets = Math.floor(toAdd / perEffective);
            toAddAdjusted = fullSets * perEffective;
            if (toAddAdjusted <= 0) {
              console.warn(`⚠️ Не вдалося розподілити ${remaining} порцій товару "${item.name}" - недостатньо місця для повного комплекту`);
              itemUnallocated = remaining;
              totalUnallocated += remaining;
              break;
            }
          }

          const perEffectiveForDisplay = effectivePortionsPerItem || item.portionsPerItem || 1;
          const displayQuantity = item.portionsPerItem ? Math.floor(toAddAdjusted / perEffectiveForDisplay) : toAddAdjusted;
          
          productItems.push({
            ...item,
            id: `product_${targetBox.index}_${item.id}${partIndex > 0 ? `_part${partIndex}` : ''}`,
            type: 'product' as const,
            quantity: displayQuantity,
            expectedWeight: itemWeightPerUnit * toAdd,
            boxIndex: targetBox.index
          });
          
          targetBox.portionsCount += toAddAdjusted;
          targetBox.currentWeight += itemWeightPerUnit * toAddAdjusted;
          remaining -= toAddAdjusted;
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

    // Normalize boxStates for external consumption: integer portionsCount and fixed weight
    const normalizedBoxStates = boxStates.map(b => ({
      ...b,
      portionsCount: Math.round(b.portionsCount),
      currentWeight: Number((b.currentWeight || 0).toFixed(2)),
      softLimit: Math.round(b.softLimit || 0),
      hardLimit: Math.round(b.hardLimit || 0)
    }));

    // Якщо є нерозподілені порції, виводимо детальне попередження
    if (totalUnallocated > 0) {
      console.error('❌ КРИТИЧНА ПОМИЛКА: Не всі товари поміщаються в коробки!');
      console.error(`Всього нерозподілених порцій: ${totalUnallocated}`);
      console.error('Деталі:', unallocatedItems);
      console.error('Стан коробок:', normalizedBoxStates);
    } else {
      console.log('Стан коробок:', normalizedBoxStates);
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

