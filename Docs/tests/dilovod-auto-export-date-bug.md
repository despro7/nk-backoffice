# Тестування: Bug — dilovodSaleExportDate записується при помилці відвантаження

**Статус:** 🔍 Під дослідженням  
**Дата виявлення:** 2026-04-06  
**Проблема:** Іноді `dilovodSaleExportDate` записується в БД **навіть при помилці від Dilovod API**

---

## Суть проблеми 🔴

Під час автоматичного відвантаження замовлень в Dilovod (`DilovodAutoExportService`), інколи записується дата **навіть при помилці від Dilovod API**. Це призводить до того, що замовлення позначається як "відвантажено", хоча насправді документ не було успішно створено.

### Проблемний сценарій
```
Auto shipment намагається відвантажити замовлення
    ↓
Dilovod повертає помилку: "applicationLayerError: Документ не збережено. Недостатня кількість..."
    ↓
Помилка логується в meta_logs ✅
    ↓
⚠️ dilovodSaleExportDate все одно записується в БД ❌
    ↓
Замовлення виглядає як "успішно відвантажено", хоча це не так
```

### Приклад з логів
```json
{
  "title": "Auto shipment export result (sale)",
  "status": "error",
  "message": "[Авто] Помилка відвантаження замовлення 14445: Dilovod: документ не збережено (applicationLayerError) — Недостатня кількість...",
  "data": {
    "orderId": "7964",
    "orderNumber": "14445",
    "exportResult": {
      "error": "applicationLayerError Документ не збережено. Недостатня кількість..."
    }
  }
}
```

---

## Що було перевірено ✅

### 1️⃣ Синхронізація при periodic cron sync
- ❌ **Виключено** — відвантаження записуються тільки через скрипти застосунку

### 2️⃣ Race condition в `tryAutoShipment`
- ❌ **Не підходить** — умова `if (existingSaleDocs.length > 0)` одразу викидає помилку й не буде писати дату

### 3️⃣ Запис вручну в Dilovod іншим користувачем
- ❌ **Виключено** — вже описано раніше

### 4️⃣ Crash/HMR при асинхронній обробці
- ❌ **Маловірогідно**

---

## Додане логування 🔍

Детальне логування було додано у `server/services/dilovod/DilovodAutoExportService.ts` в наступних місцях:

### Крок 4 — основний запис при успіху (`tryAutoShipment`)
```typescript
📝 [AutoExport/sale] ПЕРЕД записом дати: orderId=..., isError=..., exportResult.id=...
✅ [AutoExport/sale] ПІСЛЯ запису дати успішно: orderId=..., dilovodSaleExportDate=...
❌ [AutoExport/sale] ПОМИЛКА відвантаження замовлення ...: isError=..., exportResult?.id=..., errorMessage=...
```

### Early-exit 3 — синхронізація існуючих документів (`tryAutoShipment`)
```typescript
📝 [AutoExport/sale] EARLY-EXIT 3: ПЕРЕД записом дати від Dilovod API: saleDoc.date=..., saleCount=...
✅ [AutoExport/sale] EARLY-EXIT 3: ПІСЛЯ запису дати від Dilovod API: dilovodSaleExportDate=...
```

### Аналогічне логування у `tryAutoExport`
- **Early-exit 2** — синхронізація saleOrder від Dilovod API
- **Крок 4** — основний запис при успіху export

### Meta logs — індикатори
```typescript
{
  "data": {
    "dbUpdateAttempted": true/false,  // true = дата записана, false = не записана
    "isError": true/false              // true = помилка, false = успіх
  }
}
```

---

## Як тестувати 🧪

### 1️⃣ Знайти замовлення з помилкою на складі
Дата: 2026-04-06, замовлення #14445 має помилку "Недостатня кількість" для товарів 01654 (Квасоля в томатному соусі) та 01562 (Квасоля варена).

### 2️⃣ Спостерігати за логами при повторному відвантаженні
Запустити повторне відвантаження (manuel або webhook) й слідкувати за консоллю:
```bash
npm run dev
# Або перевірити логи запущеного сервера
```

### 3️⃣ Перевірити серверні логи
Шукати лог-повідомлення:
- ✅ Якщо в логах видна **`✅ ПІСЛЯ запису дати успішно`** при `isError=false` — все нормально
- ⚠️ Якщо видна **`✅ ПІСЛЯ запису дати успішно`** при `isError=true` — **БАГИ!**
- ℹ️ Якщо видна **`❌ ПОМИЛКА відвантаження`** без `✅ ПІСЛЯ запису` — логіка коректна

### 4️⃣ Перевірити meta_logs у базі
Запит у `meta_logs` таблиці для замовлення #14445:
```sql
SELECT 
  id, 
  datetime, 
  title, 
  status, 
  message,
  JSON_EXTRACT(data, '$.dbUpdateAttempted') AS dbUpdateAttempted,
  JSON_EXTRACT(data, '$.isError') AS isError
FROM meta_logs
WHERE 
  category = 'dilovod' 
  AND JSON_EXTRACT(data, '$.orderNumber') = '14445'
ORDER BY datetime DESC
LIMIT 10;
```

**Інтерпретація результатів:**
- ✅ `status='error'` & `dbUpdateAttempted=false` — коректна поведінка
- ❌ `status='error'` & `dbUpdateAttempted=true` — **гарантований баг!**
- ✅ `status='success'` & `dbUpdateAttempted=true` — коректна поведінка

### 5️⃣ Перевірити `dilovodSaleExportDate` в таблиці `orders`
```sql
SELECT 
  id,
  orderNumber,
  dilovodSaleExportDate,
  dilovodSaleDocsCount,
  status
FROM orders
WHERE orderNumber = '14445';
```

**Очікуваний результат при помилці:**
- `dilovodSaleExportDate` = NULL або старе значення (НЕ оновлена дата)
- `dilovodSaleDocsCount` = 0 або NULL

---

## Файли для перевірки 📄

- `server/services/dilovod/DilovodAutoExportService.ts` — основна логіка (методи `tryAutoShipment`, `tryAutoExport`)
- `server/services/dilovod/DilovodService.ts` — синхронізація з Dilovod API (метод `logMetaDilovodExport`)
- `Docs/CHANGELOG.md` — запис про додане логування (дата: 2026-04-06)

---

## Наступні кроки 📋

1. ✅ Додано детальне логування — **ЗРОБЛЕНО (2026-04-06)**
2. ⏳ **Чекаємо на дані з production** — спостерігати за логами протягом кількох днів
3. 🔧 На основі логів — визначити точне джерело проблеми й виправити
4. 🧪 Додати unit тести для покриття цього сценарію

---

## Посилання

- **Issue:** dilovodSaleExportDate записується при помилці відвантаження
- **Service:** `DilovodAutoExportService`
- **Related:** `DilovodService`, `DilovodExportBuilder`
- **Changelog:** `/Docs/CHANGELOG.md` (2026-04-06)
