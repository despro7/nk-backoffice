# Наліпки для друку (Products 2.0)

**Дата:** 2026-09-16  
**UI:** `ProductDrawer` → вкладка **«Наліпки»**  
**API:** `/api/products/:goodId/labels/*`  
**Доступ:** permission `catalog.manage` (мін. роль `WAREHOUSE_MANAGER`)

---

## Огляд

Модуль генерації PDF-етикеток **100×100 мм** для партій готової продукції. Макет за Figma (node `2062:1676`, Auto Layout → Flexbox). Перший тип — **«Порція»** (`portion`); **«Коробка»** (`box`) — заглушка в UI (наступний етап).

| Що | Рішення |
| --- | --- |
| Чернетка | Спільна для всіх користувачів (без `userId`); ключ `(goodId, batchId, labelKind)` |
| Опубліковані версії | Кожна генерація PDF — новий запис `version` + файл на диску |
| Автор ревізії | `publishedBy` + `publishedByName` при генерації PDF |
| Превʼю | HTML Canvas з inline-редагуванням; масштаб адаптивний |
| PDF | `@react-pdf/renderer`, той самий flex-макет що й Canvas |
| Штрихкод EAN-13 | Шрифт `CodeEAN13.woff` (без растру в PDF) |
| Графіка в PDF | SVG з `/public` (не PNG) |

---

## Схема БД

Міграція: `prisma/migrations/20260916010000_add_catalog_product_labels/`

| Таблиця | Призначення |
| --- | --- |
| `catalog_product_label_drafts` | Чернетка payload для пари товар + партія + тип |
| `catalog_product_labels` | Історія згенерованих PDF (`version`, `pdfFileName`, `payloadJson`, `publishedBy`) |

PDF зберігаються в `uploads/catalog-labels/{goodId}/`.

---

## Payload (`ProductLabelPayload`)

Тип: `shared/types/productLabel.ts`.

| Поле | Джерело / редагування |
| --- | --- |
| `title` | Авто-розбиття назви (`splitProductTitle`); inline + toolbar (вирівнювання, ± шрифт) |
| `ingredientsText` | BOM → назви компонентів через кому; **редагований** |
| `nutritionText` | Шаблон з плейсхолдерами; **4 числові інпути**; валідація перед генерацією |
| `nutritionEnergyManual` | `true` якщо ккал задані вручну (інакше Atwater: б×4 + ж×9 + в×4) |
| `storageText` | Статичний текст за замовчуванням; **редагований** |
| `batchNumber` | З обраної партії Dilovod |
| `expiresAt` | З `goodParts.expiration` → формат `MM.YYYY`; **редагований** |
| `netWeightLabel` | З ваги товару (`weight` кг → `400г`); **редагований** |
| `barcode` | ШК партії з `catalog_good_barcodes` або дефолтний активний |

Чернетка може зберігатися **без штрихкоду** (поле порожнє). Генерація PDF вимагає заповненої поживної цінності.

---

## API

Підключення: `server/routes/products.ts` → `ProductLabelsController`.

| Method | Path | Опис |
| --- | --- | --- |
| GET | `/api/products/:goodId/labels/draft?batchId=&labelKind=` | Чернетка; якщо `expiresAt` порожній — сервер добирає з Dilovod |
| PUT | `/api/products/:goodId/labels/draft` | Зберегти чернетку |
| POST | `/api/products/:goodId/labels/seed` | Створити чернетку з BOM/ваги/ШК; body: `batchId`, `batchNumber`, `labelKind`, `expiration?` |
| GET | `/api/products/:goodId/labels/published?batchId=&labelKind=` | Список версій (desc за `version`) |
| GET | `/api/products/:goodId/labels/published/latest?labelKind=` | Остання згенерована версія по товару (без `batchId`) |
| POST | `/api/products/:goodId/labels/published/generate` | Зберегти PDF + новий запис версії |
| GET | `/api/products/:goodId/labels/published/:id/pdf` | Скачати / inline PDF |
| DELETE | `/api/products/:goodId/labels/published/:id` | Видалити версію + PDF (**лише ADMIN**) |

Клієнт: `client/services/ProductLabelService.ts`.

---

## UI (`ProductLabelsTab`)

Файл: `client/pages/Products/components/productDrawer/ProductLabelsTab.tsx`.

1. **Tabs** `Порція | Коробка` (`labelKind`).
2. **Select партії** — `BatchNumbersAutocomplete` + `useBatchNumbers` (`includeSmallStorage: true`). Якщо для товару вже є PDF — **партія і остання версія підставляються автоматично** (`GET …/published/latest`).
3. **Select версії** — якщо є опубліковані PDF; **видалення** (🗑) — лише **ADMIN**.
4. **Превʼю** — `ProductLabelPreview` → `PortionLabelCanvas`; під макетом — **аналітика** (дата, автор, партія).
5. **Дії:** Зберегти чернетку · Згенерувати PDF · Скачати · **Друк** (dropdown: браузер / QZ Tray + к-сть) · Копіювати версію в чернетку.

Режим перегляду версії (`viewingVersion`) — поля read-only.

### Превʼю та межі наліпки

`ProductLabelPreview.tsx`:

- Canvas масштабується від ширини контейнера (`PREVIEW_MIN_SCALE` … `PREVIEW_MAX_SCALE`).
- Зверху — слот для toolbar заголовка (`PREVIEW_TOOLBAR_OVERFLOW_PX`).
- Canvas прив’язаний до **нижнього краю** (`transformOrigin: bottom left`), щоб панель керування не виходила за рамку.
- Рамка наліпки — overlay `border-2` (лише візуальний контроль, не впливає на PDF).

### Inline-редагування (Canvas)

| Компонент | Призначення |
| --- | --- |
| `LabelEditableZone` | `contentEditable`; outline: `LABEL_EDITABLE_OUTLINE_CLASSES` (`ring-primary`) |
| `LabelEditableBlock` | Суцільний outline для блоків з префіксом («Склад:», умови зберігання) |
| `LabelTitleBlock` | Заголовок + toolbar (align, font ±) при фокусі |
| `NutritionValueFields` | Readonly labels + 4 числові інпути динамічної ширини |
| `Ean13BarcodeText` | EAN-13 через `CodeEAN13.woff` + `encodeEan13ForFont` |

Макет і розміри: `shared/utils/productLabelPortionLayout.ts`, статичні тексти: `shared/constants/productLabelPortionStatic.ts`.

---

## PDF

| Файл | Роль |
| --- | --- |
| `server/modules/Products/ProductLabelPdfDocument.tsx` | React-PDF документ (flex-макет) |
| `server/modules/Products/productLabelPdfFonts.ts` | Реєстрація шрифтів (Days One, Open Sans Condensed, CodeEAN13) |
| `server/modules/Products/CatalogLabelService.ts` | CRUD, seed, `renderToBuffer` |

Шрифти: `public/fonts/`, `public/CodeEAN13.woff`.  
Ассети: `nk-food-logo.svg`, `portion-instruction.svg`, `qr-code-nkfood.svg`, `estimated.svg`, `icon-warning.svg`.

Перед рендером PDF payload проходить **`prepareProductLabelForRender`** (типографіка текстових полів).

---

## Типографіка текстів

Бібліотека: **[typograf](https://github.com/typograf/typograf)** (`npm`, locale `uk`).  
Утиліти: `shared/utils/typograph.ts` (+ `typograph.spec.ts`).

| Функція | Призначення |
| --- | --- |
| `typographUk(text)` | Типографує довільний український рядок |
| `typographProductLabelPayload(payload)` | Типографує `title`, `ingredientsText`, `nutritionText`, `storageText` |
| `prepareProductLabelForRender(payload)` | Обгортка в `shared/utils/productLabel.ts` для превʼю / PDF |

### Що робить

- Неразривні пробіли після коротких слів (`за`, `до`, `не`, `в`, `У` …).
- Неразривний пробіл перед `%` (`75%`).
- Лапки «ёлочки» (`"Нова Кухня"` → `«Нова Кухня»`).
- Додаткове правило для одиниць виміру на етикетках: `24 годин`, `68,3 ккал`, `300 г` (число + одиниця не розриваються при переносі рядка).

Приклад (умови зберігання, `PORTION_LABEL_STATIC.storageText`):

```
…не більше 75%. …не більше 24 годин.
         ↑ nbsp              ↑ nbsp перед %    ↑ nbsp перед «годин»
```

### Коли застосовується

| Момент | Де |
| --- | --- |
| Завантаження чернетки | `ensureStorageText` (дефолт + збережений текст) |
| Blur у Canvas | `LabelEditableZone` / `LabelEditableBlock` з `typographOnBlur` («Склад», умови зберігання) |
| Збереження / генерація PDF | `ProductLabelsTab` → `prepareProductLabelForRender` перед API |
| Превʼю Canvas | Статичні блоки (`warning`, адреса, виробник, заголовок поживної цінності) — `typographUk` при рендері |
| PDF | `ProductLabelPdfDocument` → `prepareProductLabelForRender` + статичні тексти |

Редагування: користувач вводить звичайний текст; після blur або збереження в payload зберігається вже типографована версія (операція ідемпотентна).

### Використання в коді

```typescript
import { typographUk } from '@shared/utils/typograph';
import { prepareProductLabelForRender } from '@shared/utils/productLabel';

const storage = typographUk(PORTION_LABEL_STATIC.storageText);
const forPdf = prepareProductLabelForRender(draftPayload);
```

Залежність: `typograf` у `package.json` (dependencies).

---

## Поживна цінність

Утиліти: `shared/utils/productLabelNutrition.ts` (+ `productLabelNutrition.spec.ts`).

- Стартовий шаблон: `PRODUCT_LABEL_NUTRITION_TEMPLATE` (плейсхолдери `__`).
- `getNutritionValidationErrors` / `isNutritionTextComplete` — блокують генерацію PDF.
- `patchNutritionWithAutoEnergy` — автоперерахунок ккал при зміні Б/Ж/В, якщо не `nutritionEnergyManual`.
- Ручна ккал: підкреслення dotted на Canvas.

---

## Термін придатності («Вжити до»)

### Формат

`formatLabelExpiryDate` (`shared/utils/productLabel.ts`): Dilovod `YYYY-MM-DD …` → **`MM.YYYY`** (напр. `2027-08-15` → `08.2027`).  
Ігнорує «нульові» дати Dilovod (`0000-00-00`) через `isMissingDilovodDate`.

### Ланцюжок даних

```
Dilovod goodPart (expiration)
  → GET /api/warehouse/batch-numbers/:sku  (поле expiration)
  → ProductLabelsTab (batch.expiration)
  → resolveLabelExpiryDate (клієнт, якщо в чернетці порожньо)
  → CatalogLabelService.getDraft / seedDraft (серверний fallback через getObject)
```

### Відома особливість Dilovod API

Запит `catalogs.goodParts` з фільтром `id IN (...)` **повертає expiration лише для частини партій**.  
Тому в `DilovodApiClient.enrichBatchExpirationsFromGoodParts`:

1. Спочатку bulk-запит до `catalogs.goodParts`.
2. Для id без дати — **`getObject(batchId)`** → `header.expiration` (надійний шлях).

Хелпер: `extractBatchExpirationFromGoodPartHeader` (`DilovodUtils.ts`).

Серверний кеш партій (`WarehouseController`, TTL 5 хв) може тимчасово віддавати записи без `expiration` — після оновлення коду потрібен **force refresh** (`?force=true`) або очікування TTL.

---

## Backend-файли

```
server/modules/Products/
  ProductLabelsController.ts    # Express routes
  CatalogLabelService.ts        # чернетки, версії, PDF, seed, resolve expiration
  ProductLabelPdfDocument.tsx   # PDF layout
  productLabelPdfFonts.ts

shared/
  types/productLabel.ts
  utils/productLabel.ts
  utils/productLabelNutrition.ts
  utils/productLabelPortionLayout.ts
  utils/splitProductTitle.ts
  utils/encodeEan13Font.ts
  utils/typograph.ts              # typograf (uk) + одиниці виміру
  constants/productLabelPortionStatic.ts

client/pages/Products/components/productDrawer/
  ProductLabelsTab.tsx
  ProductLabelPreview.tsx
  label/
    PortionLabelCanvas.tsx
    LabelEditableZone.tsx
    LabelEditableBlock.tsx
    LabelTitleBlock.tsx
    NutritionValueFields.tsx
    Ean13BarcodeText.tsx
```

---

## Тести

- `shared/utils/productLabelNutrition.spec.ts` — парсинг, Atwater, `patchNutritionWithAutoEnergy`.
- `shared/utils/splitProductTitle.spec.ts` — розбиття назви на 2 рядки.
- `shared/utils/typograph.spec.ts` — неразривні пробіли, лапки, payload наліпки.

---

## Майбутнє (не реалізовано)

- Тип наліпки **«Коробка»** (окремий макет).
- AI-генерація блоку «Склад».
- Головний шаблон наліпок (спільні статичні блоки для всіх товарів).

---

## Пов’язана документація

- `Docs/features/products-catalog-2.0.md` — каталог, Drawer, штрихкоди з партіями.
- `Docs/features/warehouse-movement-mob.md` — `useBatchNumbers`, резолв назв партій.
- `Docs/integrations/dilovod-metadata.md` — `goodParts`, `getObject`.
