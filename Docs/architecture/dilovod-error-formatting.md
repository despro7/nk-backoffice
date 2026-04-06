# Dilovod Error Formatting — Очищення помилок для NotificationBell

**Дата оновлення:** 2026-04-06  
**Файли:** `server/services/dilovod/DilovodUtils.ts`, `server/services/dilovod/DilovodAutoExportService.ts`, `server/routes/dilovod.ts`

## Проблема

Помилки експорту/відвантаження в Dilovod часто містять непотрібну HTML-розмітку та JavaScript:

```
"applicationLayerError Документ не збережено. Недостатня кількість. 
<span style='color: #006699' onclick='openForm({object : makeLink(1100300000001562), target: \"mini\"})'>Квасоля варена, 250г</span> 
| Код: 0000000527 | Артикул: 02009 | ... 
<span style='color: #006699' onclick='...'>Гречана Каша</span> 
| Код: 0000000609 | Артикул: 03017 | ..."
```

При записуванні в `meta_log.message` (обмежена довжина) та відображенні в NotificationBell такий текст:
- **Нечитабельний** (HTML + спецсимволи)
- **Надмірно довгий** (з деталями, які не потрібні користувачу)
- **Без структури** (товари не розділені на рядки)

## Рішення

Реалізовано **дві нові функції** для двохрівневого форматування помилок:

### 1. `cleanDilovodErrorMessageShort(errorStr: string): string`

**Призначення:** Коротка версія для UI (`meta_log.message`).

**Логіка:**
- Видаляє HTML-теги (`<span...>`, `onclick` і т.д.)
- Видаляє префікс помилки (`applicationLayerError`, `multithreadApiSession`)
- Витягує **тільки** назву товару та артикул (через regex)
- Формує список з дефісами для читабельності

**Приклад:**

**Вхід (553 символи):**
```
applicationLayerError Документ не збережено. Недостатня кількість. <span style='color: #006699' onclick='openForm({...})'>Квасоля варена, 250г</span> | Код: 0000000527 | Артикул: 02009 | Рахунок <>. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт. <span style='color: #006699' onclick='...'>Гречана Каша</span> | Код: 0000000609 | Артикул: 03017 | Рахунок Готова продукція. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
```

**Вихід (75 символи = 14% оригіналу):**
```
Недостатня кількість:
- Квасоля варена, 250г (02009)
- Гречана Каша (03017)
```

**Використання в коді:**
```typescript
import { cleanDilovodErrorMessageShort } from './DilovodUtils.js';

const metaLogMessage = `[Авто] Помилка export: ${cleanDilovodErrorMessageShort(exportResult.error)}`;
// → "[Авто] Помилка export: Недостатня кількість:\n- Квасоля варена, 250г (02009)\n- Гречана Каша (03017)"
```

### 2. `cleanDilovodErrorMessageFull(errorStr: string): string`

**Призначення:** Повна версія для логів (`meta_log.data.error`).

**Логіка:**
- Видаляє HTML-теги (зберігає текст)
- Видаляє префікси помилок
- **Розділяє товари на рядки** за паттерном: " шт." + велика буква (нов товар)
- Зберігає всі деталі: код, артикул, рахунок, залишки, потребу

**Приклад:**

**Вхід (552 символи):**
```
applicationLayerError Документ не збережено. Недостатня кількість. <span...>Квасоля варена, 250г</span> | Код: 0000000527 | Артикул: 02009 | Рахунок <>. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт. <span...>Гречана Каша</span> | Код: 0000000609 | Артикул: 03017 | Рахунок Готова продукція. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
```

**Вихід (312 символи = 56% оригіналу):**
```
Документ не збережено. Недостатня кількість. Квасоля варена, 250г
- Код: 0000000527 | Артикул: 02009 | Рахунок <>. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
- Гречана Каша | Код: 0000000609 | Артикул: 03017 | Рахунок Готова продукція. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
```

**Використання в коді:**
```typescript
import { cleanDilovodErrorMessageFull } from './DilovodUtils.js';

const metaLogData = {
  error: cleanDilovodErrorMessageFull(exportResult.error),
  // Можна потім користати в детальному аналізі помилок
};
```
// Результат можна записати в meta_log.message
```

### 2. `cleanDilovodErrorMessageFull(errorStr: string): string`

**Призначення:** Форматування для `meta_log.data[error]` (повна версія для логів).

**Що робить:**

---

## Деталі реалізації

### Regex паттерни у `cleanDilovodErrorMessageFull()`

Розділення товарів відбувається за паттерном: " шт." + пробіл + **велика українська буква** (новий товар).

```typescript
// Замінити паттерн " шт. " + велика буква на спеціальний розділювач
const separator = '|||ITEM_SEPARATOR|||';
let processed = content.replace(/(\d+\s+шт\.)\s+(?=[А-Яа-я])/g, `$1${separator}`);

// Розділити по розділювачу й добавити "-" перед кожним товаром
const parts = processed.split(separator);
return `${header}\n- ${parts.join('\n- ')}`;
```

**Результат:**
- Перший товар залишається в оригінальній позиції (після заголовка)
- Наступні товари розділяються дефісом і переносом рядка
- Зберігаються всі деталі (код, артикул, залишки тощо)

### Інтеграція в основний код

#### DilovodAutoExportService.ts — Експорт замовлення

```typescript
import { cleanDilovodErrorMessageShort, cleanDilovodErrorMessageFull } from './DilovodUtils.js';

// ...

const exportResult = await this.dilovodService.exportOrderToDilovod(payload);
const isExportError = isDilovodExportError(exportResult);

if (isExportError && exportResult?.error) {
  // Коротка версія для UI (message поле)
  const errorMessageShort = cleanDilovodErrorMessageShort(String(exportResult.error));
  const metaLogMessage = `[Авто] Помилка export замовлення ${orderNumber}: ${errorMessageShort}`;
  
  // Повна версія для логів (data.error поле)
  const errorMessageFull = cleanDilovodErrorMessageFull(String(exportResult.error));
  
  const metaLogData = {
    orderId,
    orderNumber,
    exportResult,
    error: errorMessageFull  // ← Повна версія тут
  };
  
  await dilovodService.logMetaDilovodExport({
    title: 'Auto export result (saleOrder)',
    status: 'error',
    message: metaLogMessage,  // ← Коротка версія тут
    initiatedBy: 'cron:order_sync',
    data: metaLogData
  });
}
```

#### server/routes/dilovod.ts — Маршрути експорту/відвантаження

Той же паттерн у маршрутах:

```typescript
// Маршрут POST /api/dilovod/export-order
if (isDilovodExportError(exportResult)) {
  const metaLogMessage = `[Користувач] Помилка export: ${cleanDilovodErrorMessageShort(...)}`;
  const metaLogData = {
    error: cleanDilovodErrorMessageFull(String(exportResult.error))
  };
  // ...
}

// Маршрут POST /api/dilovod/shipment
if (isDilovodExportError(shipmentResult)) {
  const metaLogMessage = `[Користувач] Помилка shipment: ${cleanDilovodErrorMessageShort(...)}`;
  const metaLogData = {
    error: cleanDilovodErrorMessageFull(String(shipmentResult.error))
  };
  // ...
}
```

## Приклади результатів

### Однієї помилки з 2 товарами

**message (NotificationBell):**
```
Недостатня кількість:
- Квасоля варена, 250г (02009)
- Гречана Каша (03017)
```

**data.error (логи):**
```
Документ не збережено. Недостатня кількість. Квасоля варена, 250г
- Код: 0000000527 | Артикул: 02009 | Рахунок <>. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
- Гречана Каша | Код: 0000000609 | Артикул: 03017 | Рахунок Готова продукція. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.
```

### Розмірність порівняння

| Версія | Розмір | Відсоток |
|--------|--------|---------|
| Оригінал (з HTML) | 553 символи | 100% |
| Коротка (message) | 75 символи | **14%** |
| Повна (data.error) | 312 символи | **56%** |

## Обробка граничних випадків

### 1. Помилка без товарів

**Вхід:**
```
applicationLayerError Документ не збережено. Невідома помилка конфігурації.
```

**Вихід (обидві функції):**
```
Документ не збережено. Невідома помилка конфігурації.
```

### 2. multithreadApiSession помилка

**Вхід:**
```
multithreadApiSession — заблоковано паралельний запит, повторіть спробу пізніше
```

**Вихід (обидві функції):**
```
— заблоковано паралельний запит, повторіть спробу пізніше
```

### 3. Помилка з 10+ товарами

Обидві функції автоматично масштабуються:
- **Коротка:** залишає ~13% від оригіналу (розміри товарів скорочені)
- **Повна:** залишає ~70% від оригіналу (всі деталі збережені)

## JSON приклад у meta_logs

```json
{
  "title": "Auto export result (saleOrder)",
  "status": "error",
  "message": "[Авто] Помилка export замовлення 14362: Недостатня кількість:\n- Квасоля варена, 250г (02009)\n- Гречана Каша (03017)",
  "initiatedBy": "cron:order_sync",
  "orderNumber": 14362,
  "data": {
    "orderId": 12345,
    "orderNumber": 14362,
    "triggerStatus": "assembled",
    "exportResult": {
      "error": "applicationLayerError Документ не збережено. Недостатня кількість. <span style='color: #006699' onclick='...'>Квасоля варена, 250г</span> | Код: 0000000527 | Артикул: 02009 | ... <span>Гречана Каша</span> | Код: 0000000609 | Артикул: 03017 | ...",
      "status": "error",
      "id": null
    },
    "error": "Документ не збережено. Недостатня кількість. Квасоля варена, 250г\n- Код: 0000000527 | Артикул: 02009 | Рахунок <>. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт.\n- Гречана Каша | Код: 0000000609 | Артикул: 03017 | Рахунок Готова продукція. Потрібно: 1 шт | Вільний залишок: 0 шт | Недостатньо: 1 шт."
  }
}
```

## Рекомендації

1. **Завжди використовуйте `cleanDilovodErrorMessageShort()`** для `meta_log.message` (UI)
2. **Завжди використовуйте `cleanDilovodErrorMessageFull()`** для `meta_log.data.error` (детальні логи)
3. **Fallback:** якщо функція повернула пустий рядок, використовуйте оригінальну помилку
4. **Мониторинг:** перевіряйте структуру помилок від Dilovod API регулярно (можуть змінитися)

---


Для детального аналізу оператор може розглянути повну версію в логах через `/api/meta-logs/:id` (в полі `data.error`).

## Типи помилок, які обробляються

### 1. `applicationLayerError`

Найбільш частий тип помилки при експорті замовлень. Приклади:
- Недостатня кількість товару на складі
- Товар на складі не знайдено
- Деякі параметри товару невалідні

```
"applicationLayerError Документ не збережено. Недостатня кількість. <span>Товар1</span> | ... <span>Товар2</span> | ..."
```

### 2. `multithreadApiSession`

Помилка блокування паралельних запитів до Dilovod API. Обробляється як硬помилка (не форматується, просто показується стандартне повідомлення).

```
"multithreadApiSession — заблоковано паралельний запит, повторіть спробу пізніше"
```

### 3. Інші помилки

Помилки без специфічних префіксів форматуються як звичайні рядки без видозмін.

## Рекомендації

1. **При додаванні нових типів помилок** — додайте обробку в `cleanDilovodErrorMessageShort()` та `cleanDilovodErrorMessageFull()`
2. **При логуванні помилок** — завжди використовуйте обидві функції:
   - Коротку для `meta_log.message`
   - Повну для `meta_log.data[error]`
3. **При отриманні помилок від Dilovod** — перевірте наявність HTML-тегів перед форматуванням

## Див. також

- `Docs/CHANGELOG.md` — історія змін
- `Docs/integrations/` — документація Dilovod інтеграції
- `Docs/api/meta-logs-api.md` — API для отримання логів
