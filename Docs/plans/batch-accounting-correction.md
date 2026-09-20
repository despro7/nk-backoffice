# Коригування партійного обліку

> Вирівнювання партій через комплектацію/розукомплектування.  
> Двофазна реалізація: спочатку доопрацювання `/warehouse/releases`, потім окремий розділ.

## Контекст

- Партії з мінусами та «віртуальні» партії (номер = документ Dilovod, немає в `catalogs.goodParts`) створюють плутанину в обліку.
- Механізм kit → unkit дозволяє зібрати всі залишки SKU в технічний набір і розкласти їх по реальних партіях.
- Зараз `SetReleaseController` **не передає `goodPart`** у `tpGoods` — Dilovod підставляє віртуальні партії самостійно. Списання (`WriteOffController`) і переміщення (`WarehousePayloadBuilder`) партії передають коректно.

## Статус

| Фаза | Опис | Статус |
|------|------|--------|
| 1 | Партії в `/warehouse/releases` (kit/unkit) | ⏳ |
| 2 | Розділ «Коригування партійного обліку» | ⏳ |
| 3 | Допоміжні API та автоматизація | ⏳ |

---

## Фаза 1 — Партії в `/warehouse/releases`

### Backend — `SetReleaseController.ts`

**Розширити контракт** `POST /api/warehouse/releases/send`:

```typescript
// Рядок компонента (у items або expanded components)
{
  sku: string;
  quantity: number;
  batches: Array<{
    batchId: string;       // goodPart
    batchNumber?: string;  // для UI/історії
    quantity: number;
  }>;
}
```

**Зміни в побудові `tpGoods`:**
- Один рядок на SKU → **N рядків по партіях** (як у `WarehousePayloadBuilder`).
- Кожен рядок: `goodPart: Number(batch.batchId)`.
- Валідація: `isUsableDilovodBatchId`, `qty > 0`, сума `batches[].quantity` = потрібна кількість компонента.

**Валідація `validateReleaseBatches`:**
- **kit:** кожен компонент BOM покритий партіями; сума qty = `kitQty × qty_у_BOM`.
- **unkit:** сума qty по цільових партіях = `kitQty × qty_у_BOM`.
- Попередження, якщо `batchId` відсутній у `catalogs.goodParts` (віртуальна партія).

**Історія:** зберігати `batches` у `components_snapshot` / `warehouseReleaseSet.items` для аудиту.

**dryRun:** повертати повний payload з `goodPart` (існуючий Payload Preview).

### Frontend — `WarehouseReleaseSets/`

| Файл | Зміни |
|------|-------|
| `ReleaseItemsPanel.tsx` | Колонка «Партія»; кілька рядків на один SKU |
| `useReleaseSets.ts` | Передавати `batches[]` у body `/send` |
| `useBatchNumbers.ts` | Переиспользовати з Movement (`/api/warehouse/batch-numbers`) |
| `BatchNumbersAutocomplete.tsx` | Drawer вибору партії (еталон — Movement / WriteOff) |

**UX kit:**
- Кнопка «Додати партію» на компонент.
- Індикатор `обрано X / потрібно Y`.
- Опційно: автопідбір FIFO за `expiration`.

**UX unkit:**
- Ті самі контроли; партії — **цільові** (куди повертаємо товар).
- v2: кнопка «Створити нову партію».

**Еталони UI:** `WriteOffItemRow.tsx`, `BatchNumbersAutocomplete.tsx`.

### Перевірка в Dilovod (до/паралельно з кодом)

1. `documents.goodWriteOff` + `docMode` kit (`1004000000000305`) / unkit (`1004000000000306`) — чи приймає `goodPart` у `tpGoods`.
2. Чи потрібен `goodPart` на **наборі** при unkit (партія, з якої списується набір).
3. Чи можна в unkit вказати **існуючу** партію як ціль.
4. Поведінка з мінусовими партіями при kit.

### Тести фази 1

1. dryRun на тестовому SKU — перевірка payload.
2. Реальна kit/unkit на 1 SKU, 2–3 партії.
3. Balance до/після; розділ «Партії».
4. Regression: звичайна комплектація наборів — або вимагати партії, або fallback з warning.

---

## Фаза 2 — Розділ «Коригування партійного обліку»

**Маршрут:** `/warehouse/batch-correction` (назва TBD)  
**Опис:** вирівнювання партій через комплектацію/розукомплектування.  
**Базується на:** логіка та UI фази 1; окремий wizard поверх готового kit/unkit.

### Підготовка каталогу (на SKU)

1. Технічний набір `комплект_{SKU}` (або `REBATCH_{SKU}`).
2. BOM: `1 × {оригінальний товар}`.
3. Тег «технічний / для вирівнювання» у каталозі.

### Wizard (2 кроки)

**Крок 1 — Комплектація**
- Обрати SKU (з підказкою проблемних партій з `/warehouse/batches`).
- Автопідставити технічний набір `комплект_{SKU}`.
- Показати всі партії з залишком (реальні + віртуальні); редагувати кількості.
- Відправити kit з явними `goodPart`.

**Крок 2 — Розукомплектування**
- Розкласти ту ж кількість по цільових партіях.
- Відправити unkit з явними `goodPart`.

**Звіт:** snapshot до/після (партії, qty, dilovodDocId обох документів).

### Backend фази 2

- `POST /api/warehouse/batch-correction/preview` — зріз партій по SKU + пропозиція kit/unkit payload.
- Зв'язок двох документів у локальній історії (пара kit + unkit на один SKU).

### Frontend фази 2

- Нова сторінка в групі «Склад»; permission `PAGE_WAREHOUSE_BATCH_CORRECTION`.
- Реєстрація в `routes.config.tsx`.
- Переиспользовати компоненти вибору партій з фази 1.

---

## Фаза 3 — Допоміжні API та автоматизація

| Endpoint | Призначення |
|----------|-------------|
| `POST /api/warehouse/batches/create` | Створення нової партії в Dilovod (для unkit) |
| `POST /api/warehouse/releases/validate-batches` | Перевірка покриття партіями перед send |
| Автопідбір FIFO | «Заповнити всі партії» за `expiration` |

---

## Бізнес-процес вирівнювання (операційний чеклист)

### Аудит (перед кожною сесією)

1. Зріз у `/warehouse/batches`: мінуси, віртуальні партії, порожній `code` (`DilovodGoodPartsSerialService`).
2. Групування: **SKU + склад (ГП/МС) + фірма** — одна операція на групу.
3. Перевірка `catalog_good_barcodes.goodPart` для SKU.

### Kit — збір усіх партій у набір

| Поле | Значення |
|------|----------|
| `docMode` | `1004000000000305` |
| `header.kitGood` | dilovodId `комплект_{SKU}` |
| `header.kitQty` | сума збираємої кількості |
| `tpGoods[]` | один рядок на партію з `goodPart` |

### Unkit — розкладка по реальних партіях

| Поле | Значення |
|------|----------|
| `docMode` | `1004000000000306` |
| `header.kitGood` | той самий набір |
| `header.kitQty` | та сама кількість |
| `tpGoods[]` | цільові `goodPart` |

### Верифікація

1. Balance Dilovod по SKU.
2. Sync stocks у бекофісі.
3. `/warehouse/batches` — без мінусів і віртуальних партій на цьому SKU.
4. ШК → партія в каталозі.

---

## Ризики

| Ризик | Мітигація |
|-------|-----------|
| ШК відв'язані від партії | Перевірка `catalog_good_barcodes` після unkit |
| Змішування ГП/МС | Одна операція = один склад; переміщення окремо |
| Віртуальні партії не включені в kit | Явно додавати в `tpGoods`; валідація «покриття залишку» |
| Відкат | Snapshot у історії; видалення в Dilovod лише без наступних рухів |

---

## Ключові файли

| Область | Файли |
|---------|-------|
| Backend kit/unkit | `server/modules/Warehouse/SetReleaseController.ts` |
| Еталон goodPart | `server/modules/Warehouse/WarehousePayloadBuilder.ts`, `WriteOffController.ts` |
| Frontend releases | `client/pages/Warehouse/WarehouseReleaseSets/` |
| Партії (довідник) | `server/modules/Warehouse/WarehouseBatchesService.ts`, `/warehouse/batches` |
| UI вибору партій | `client/pages/Warehouse/WarehouseMovement/components/BatchNumbersAutocomplete.tsx` |
| Валідація batchId | `shared/utils/dilovodBatchId.ts` |
