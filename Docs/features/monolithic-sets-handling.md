# Обробка монолітних комплектів при розподілі

**Монолітний комплект** — комплект товарів (categoryId=20, напр. "Вінегрет", "Салат Ситний"), який:
- НЕ розгортається рекурсивно (лишається цілісним для комірника)
- Рахується як одиниця на екрані (× 1, × 2)
- Має внутрішню структуру з компонентів, які враховуються при розрахунку порцій

**Приклад:** 1 × "Вінегрет" (склад: 4 компоненти) → на екрані "× 1", у порціях = 4 порції.

## Проблема

Раніше при розподілі по коробках система:
- Множила `quantity` на `portionsPerItem` для розподілу (правильно)
- Але потім зберігала цей помножений результат у `productItems` і множила ще раз при розрахунку `totalPackedPortions`
- Результат: "63/37" замість "37/37", "Вінегрет × 4" замість "× 1"

## Рішення

### 1. Поле `portionsPerItem`

Додано до `OrderChecklistItem`:
```typescript
portionsPerItem?: number; // Для монолітних: кількість порцій в одному комплекті
```

### 2. Розширення товарів

При виявленні монолітного комплекту (категорія в списку `monolithicCategories`):
```typescript
const portionsPerSet = product.set.reduce((sum, si) => sum + (si.quantity || 0), 0);
addOrUpdateExpandedItem(expandedItems, product, quantity, sku, composition, portionsPerSet);
```

### 3. Розподіл по коробках

Алгоритм обраховує розподіл на основі **порцій**, але **зберігає оригінальну кількість комплектів**:

```typescript
const quantityForDistribution = item.portionsPerItem 
  ? item.quantity * item.portionsPerItem  // Для розподілу: 1 × 4 = 4 порції
  : item.quantity;

// При додаванні до коробки:
const displayQuantity = item.portionsPerItem 
  ? item.quantity        // Монолітний: зберегти 1 (оригінальну)
  : remaining;           // Звичайний: розподілену кількість

productItems.push({
  ...item,
  quantity: displayQuantity,  // ← Ключ: зберегти оригінальну!
  boxIndex: targetBox.index
});
```

### 4. Розрахунок порцій

На будь-якому етапі:
```typescript
const portions = item.portionsPerItem 
  ? item.quantity * item.portionsPerItem  // Монолітний: 1 × 4 = 4
  : item.quantity;                        // Звичайний: 3 × 1 = 3
```

## Результат

- ✅ На екрані: "Вінегрет × **1**" (зберігається оригінальна кількість)
- ✅ У порціях: **4** порції (множиться на `portionsPerItem`)
- ✅ Прогрес-бар: "37/37" (правильна загальна кількість)

## Файли

- `client/lib/orderAssemblyUtils.ts` — `expandProductRecursively()`, `combineBoxesWithItems()`
- `client/types/orderAssembly.ts` — тип `OrderChecklistItem` з `portionsPerItem`
- `client/pages/OrderView.tsx` — розрахунок `totalPortions`
- `client/components/OrderChecklist.tsx` — розрахунок `totalPackedPortions`
