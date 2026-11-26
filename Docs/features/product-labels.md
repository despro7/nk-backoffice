# Наліпки для друку (Products 2.0)

**Оновлено:** 2026-10-28  
**UI:** `ProductDrawer` → вкладка **«Наліпки»**; **Налаштування** → **Шаблони наліпок** (`/settings/label-templates`)  
**API:** `/api/products/:goodId/labels/*`, `/api/label-templates/*`  
**Доступ:** `catalog.manage` (мін. `WAREHOUSE_MANAGER`); шаблони — permission `labelTemplates` (BOSS, ADMIN)

---

## Огляд

PDF-етикетки **100×100 мм** для партій готової продукції. Макет задається **pdfme**-шаблонами (Designer у налаштуваннях). Типи: **«Порція»** (`portion`) та **«Коробка»** (`box`) — **лише для звичайної продукції** (`audience: good`). У **комплектів** (`kit`) є лише порція (окремих коробкових наліпок немає).

| Що | Рішення |
| --- | --- |
| Шаблон | `catalog_label_templates` + матриця дефолтів: **продукція** — portion + box; **комплекти** — portion; override на `catalog_goods` (`labelTemplateDefaultSlots` у `shared/utils/labelTemplateDefaults.ts`) |
| Дані на наліпці | `LabelInputMap` (`shared/constants/labelInputKeys.ts`), резолвер `LabelInputResolver` |
| Чернетка | **Одна активна** на `(goodId, labelKind)` — при збереженні інші партії видаляються; у БД ключ `(goodId, batchId, labelKind)`; `updatedBy` + `updatedAt`; спільна для всіх користувачів до генерації PDF |
| Опубліковані PDF | Кожна генерація — `version`, файл у `uploads/catalog-labels/{goodId}/`, `publishedBy` |
| Історія в UI | `GET …/labels/history` — чернетка + PDF; у Select **«Версії»** чернетка показується лише якщо зміст **не збігається** з останнім PDF або є **незбережені** локальні правки |
| Превʼю | `LabelPdfmeViewer` (pdfme Viewer, масштаб 125%): чернетка – рендер шаблону з `inputs`; опублікована версія – **збережений PDF**; підпис під превʼю (дата, автор, партія) |
| PDF | `@pdfme/generator` + `labelPdfmeRuntime.ts`, шрифти Arial з assets Designer |
| ШК порції | `catalog_good_barcodes` (`barcodeKind: portion`), привʼязка до `goodPart` (партія) |
| ШК коробки | `barcodeKind: box`, один EAN-13 на пару good+batch (`CatalogBoxBarcodeService`), окрема серія `225…` (порції – `220…`); старі коди коробок `220…` перевидано 06.11.2026. Скан на моб. переміщенні → +1 «Коробок» |

---

## Схема БД

| Міграція / таблиця | Призначення |
| --- | --- |
| `20260916010000_add_catalog_product_labels` | `catalog_product_label_drafts`, `catalog_product_labels` |
| `20261021150000_catalog_label_templates` | Шаблони, дефолти, `portionLabelTemplateId` / `boxLabelTemplateId` на товарі |
| `20261026140000_catalog_barcode_kind_box` | `catalog_good_barcodes.barcodeKind` |
| `20261026150000_label_draft_updated_by` | `catalog_product_label_drafts.updatedBy` |

| Таблиця | Поля (ключові) |
| --- | --- |
| `catalog_product_label_drafts` | `payloadJson` (v2), `updatedBy`, `updatedAt` |
| `catalog_product_labels` | `version`, `pdfFileName`, `payloadJson`, `publishedBy`, `publishedAt` |
| `catalog_label_templates` | `templateJson`, `labelKind`, `audience`, `slug`, `isArchived` |
| `catalog_label_template_defaults` | `(audience, labelKind)` → `templateId` |

---

## Payload v2 (`ProductLabelPayloadV2`)

Типи: `shared/types/labelTemplate.ts`, `shared/types/productLabel.ts`.

| Поле | Зміст |
| --- | --- |
| `version` | `LABEL_INPUTS_SCHEMA_VERSION` |
| `templateId` | UUID пресета pdfme або `null` (дефолт з матриці) |
| `inputs` | Повний `LabelInputMap` після merge |
| `overrides` | Локальні правки чернетки відносно бази з картки |
| `nutritionEnergyManual` | Ручна енергетична цінність (ккал) |

### Джерела полів (`LabelInputResolver`)

- Назва, вага, ШК, партія, термін, BOM, nutrition JSON — картка товару + Dilovod.
- **Склад і зберігання** — спочатку override-блоки `storefrontDescriptionDoc` (`resolver: ingredients` / `storage`), інакше картка/BOM (`labelStorefrontOverrides.ts`).
- **Коробка** — окремий box-штрихкод; порційний ШК не змішується з box (`barcodeKind`).

Генерація PDF вимагає валідної поживної цінності (`getLabelNutritionErrors`), **крім** комплектів і наліпок коробки (КБЖВ не перевіряється).

---

## API (товар)

`ProductLabelsController` → `server/routes/products.ts`.

| Method | Path | Опис |
| --- | --- | --- |
| GET | `…/labels/draft?batchId=&labelKind=` | Чернетка для партії |
| GET | `…/labels/draft/latest?labelKind=` | Остання збережена чернетка по товару (`updatedAt` desc) |
| PUT | `…/labels/draft` | Зберегти чернетку (`updatedBy` = поточний user); інші чернетки цього `labelKind` для інших партій — видаляються |
| POST | `…/labels/seed` | Перестворити чернетку з картки |
| DELETE | `…/labels/draft?batchId=&labelKind=` | Видалити збережену чернетку (**ADMIN**); опубліковані PDF без змін |
| GET | `…/labels/history?batchId=&labelKind=` | **Чернетка + опубліковані** (для UI) |
| GET | `…/labels/published?batchId=&labelKind=` | Лише PDF-версії |
| GET | `…/labels/published/latest?labelKind=` | Останній PDF по товару |
| GET | `…/labels/resolve-template?labelKind=` | Який шаблон застосується |
| PATCH | `…/labels/template` | Override пресета на товарі |
| POST | `…/labels/published/generate` | Новий PDF + версія; після успіху **чернетка синхронізується** з опублікованим payload |
| GET | `…/labels/published/:id/pdf` | Файл PDF |
| DELETE | `…/labels/published/:id` | Видалити версію (**ADMIN**) |

Клієнт: `client/services/ProductLabelService.ts`.

### API шаблонів

`server/routes/label-templates.ts` — CRUD, дефолти, preview PDF, `preview-inputs`, override по товарах.  
Клієнт: `client/services/LabelTemplateService.ts`.

| Метод | Шлях | Опис |
|-------|------|------|
| GET / PUT | `/api/label-templates/weight-spacing` | Спільні пробіли в масі нетто (PUT – ADMIN / BOSS) |
| POST | `/api/label-templates/apply-field` | Перенести поле (геометрія / шрифт / вміст / усе) в обрані шаблони однією транзакцією, за потреби видалити `estimated_svg` |

Деталі шаблону (`GET /:id`) повертають `weightSpacingOverride` і фінальні `weightSpacing`; `POST` / `PUT` приймають `weightSpacingOverride` (`null` – успадковувати). `resolve-template` товару теж віддає `weightSpacing`.

---

## UI — картка товару (`ProductLabelsTab`)

1. **Tabs** `Порція | Коробка` (для комплектів — лише порція, без вкладки коробки).
2. **Пресет** — override або «За замовчуванням (Settings)» (`setTemplateOverride` → `null`, далі дефолт з матриці Settings); після resolve UI показує **ім’я** дефолтного пресета (напр. «Звичайна порція»), бо `templateId` стає UUID шаблону. Якщо override уже збігається з дефолтом, пункт «Settings» виглядає як повторний вибір того самого пресета — це скидання override, а не інший макет.
3. **Партія** — `BatchNumbersAutocomplete`; автопідстановка: спочатку партія з `draft/latest`, інакше з `published/latest`. Авто-**seed** чернетки лише якщо **немає** ні чернетки, ні опублікованих PDF для партії.
4. **Версії** — Select (`w-fit`): чернетка (`Чернетка · дата · автор`) і `vN · дата · автор`. Чернетка **ховається**, якщо її `inputs` збігаються з останнім PDF (`productLabelDraftMatchesPublished`). Після відкриття: чернетка з неопублікованими змінами, інакше — останній PDF; після **«Згенерувати PDF»** — нова версія + синхронізована чернетка (пункт «Чернетка» зникає зі списку). **Кошик (ADMIN):** видалити PDF-версію або збережену чернетку.
5. Під превʼю — `formatProductLabelHistoryCaption` (збережено / згенеровано, автор, партія); accordion **«Текстові поля»** автоматично **розгортається** лише в режимі редагування (`!readOnly && !viewingVersion`).
6. **Дії:** зберегти чернетку · синхронізувати з картки (`seed`) · **згенерувати PDF** (активна, якщо немає PDF або поточний зміст **≠** останній PDF — не плутати з «незбережені зміни в формі») · завантажити / друк (браузер) лише для обраного **PDF** · «Редагувати як чернетку» (клон з PDF). Під час дії кнопки з іконкою: `isLoading` + `startContent={loading ? null : icon}` (спінер замість іконки, не між іконкою й текстом).

**Локальні правки чернетки** (`LABEL_EDITABLE_KEYS`): заголовок (2 рядки), **маса нетто** (`net_weight`). На порції під масою вкладки «℮ Без похибки / ± Похибка» (`label/LabelNetWeightField.tsx`): похибка зберігається в `net_weight_tolerance`. Жовте попередження про БЖВ стоїть над спойлером «Текстові поля». Текст маси в картці (`formatNetWeightLabel`) лишається без пробілу (`400г`); на друк пробіли ставляться за налаштуваннями, див. **Маса нетто: ℮, похибка, пробіли**.

Превʼю: `label/LabelPdfmeViewer.tsx` — шаблон з БД проходить `hydrateLabelTemplateContent`, потім `resolvePdfmeInputs` (див. **SVG і pdfme inputs** нижче).

- **Опублікована версія** (обрано `vN`, не «Редагувати як чернетку»): `ProductLabelService.fetchPdfBase64` → PDF іде в Viewer як `basePdf` (без schemas), тобто превʼю = файл, що друкується, навіть якщо пресет змінили після генерації. Поки PDF вантажиться – спінер; помилка завантаження → фолбек на рендер з `payload.inputs` версії.
- Контейнер `aspect-[5/5.6]`, панель масштабу pdfme притиснута до низу (`bottom-2!` поверх inline `bottom: 6%`), стартовий масштаб `zoomLevel: 1.25`.

---

## Маса нетто: ℮, похибка, пробіли

- **Лише порція** (`labelKind === 'portion'`, продукція й комплекти): до `net_weight` дописується «℮» або похибка – «380 г ℮», «380 г ± 8%». Коробка друкує лише масу. Ознака передається як `netWeightSuffix` у `resolvePdfmeInputs` / `generateLabelPdfBuffer` / `LabelPdfmeViewer`.
- **Знак ℮** друкується текстом (U+212E) у тому самому полі, тож стоїть на одній лінії з вагою. Старе SVG-поле `estimated_svg` під час рендера порції ховається порожнім SVG (`prepareLabelTemplateForRender` знімає `readOnly`); його можна прибрати з шаблонів. Ширину поля `net_weight` задають у Designer, автопідбір шрифту – `dynamicFontSize`.
- **Похибка** – ключ `net_weight_tolerance`: `5%` або `20г`, друкується в тих самих одиницях (`formatNetWeightToleranceLabel`).
- **Пробіли** (`shared/utils/labelWeightSpacing.ts`): вага–одиниця, вага–℮/±, ±–похибка. Варіанти: без, волосяний U+200A, тонкий U+2009, звичайний U+00A0, широкий U+2002 (лише вага–℮/±). Дефолт: волосяний · звичайний · волосяний. Пробіл у старих чернетках («300 г») нормалізується під час друку (`tightenWeightUnitSpacing`). У DaysOne немає U+200A.
- **Зберігання:** `settings_base` ключ `label_weight_spacing` (`{ defaults, overrides: { [templateId]: часткові } }`), сервіс `LabelWeightSpacingService`. Перевизначення копіюється при дублюванні шаблону.

---

## SVG і pdfme inputs

Слоти `logo_svg`, `instruction_svg`, `estimated_svg`, `warning_icon`, `qr_url` (`LABEL_TEMPLATE_SVG_FIELD_NAMES` у `shared/pdfme/labelTemplateSvgAssets.ts`):

| Джерело | Поведінка |
| --- | --- |
| `templateJson` у БД | Часто **порожній** `content` або **URL-плейсхолдер** (`/nk-food-logo.svg`) — не тіло SVG |
| `hydrateLabelTemplateContent` | Підставляє SVG з `public/` (клієнт: `loadLabelDesignerAssets`, сервер: `loadLabelSvgInputs`), якщо content порожній або виглядає як URL; **збережений `<svg…>` не перезаписується** |
| `resolvePdfmeInputs` | **Не** передає порожні ключі SVG з `LabelInputMap`; для полів `svg`/`image` у pdfme inputs потрапляє лише **inline SVG з шаблону** після hydrate |
| Префікси дат/партії | `expires_at` / `batch_number` у pdfme inputs — **без** повтору «Вжити до:» / «Номер партії:», якщо префікс уже в `content` поля шаблону (`stripLabelTextPrefix`) |

**Картка товару:** `ProductLabelsTab` → `hydrateLabelTemplateContent` + `LabelPdfmeViewer`.  
**PDF:** `generateLabelPdfBuffer` hydrate-ить шаблон перед `@pdfme/generator`.

---

## UI — налаштування шаблонів

`client/pages/SettingsLabelTemplates.tsx` — список пресетів, pdfme Designer (100×100 мм), матриця дефолтів (3 комірки: good×portion/box, kit×portion), overrides по товарах, живий preview.

**Живі дані в Designer:** `LabelTemplatePreviewProductPicker` — пошук лише **активних** товарів ГП (без архіву / `delMark`, як `isWarehouseProductArchived`); партія → `GET …/preview-inputs`. Підстановка в макет: `resolvePdfmeInputs` + `applyLabelPreviewInputsToTemplate` — **статичні** поля (кастомне ім’я, `readOnly`, текст без MVT) не затираються; SVG-слоти — через `labelTemplateSvgAssets` (див. секцію **SVG і pdfme inputs**); toast про невідомі імена — лише для **динамічних** слотів (`unknownDynamicSchemaNames`).

**Mock-дані:** значення змінних MVT, змінені в Designer, зберігаються в шаблоні (`hydrateLabelTemplateContent` бере збережені, дефолт лише для нових). Поки обрано живий товар, mock-вміст перекритих полів тримається окремо й повертається при збереженні та очищенні вибору.

**Маса в макеті:** `net_weight` показується так, як друкується (`labelNetWeightPreview.ts`), поки в макеті немає окремого поля ℮. Перемикач «℮ Без похибки / ± Похибка» в рядку з товаром і партією (`LabelMockNetWeightControl`) зберігається в `template.sampledata[0]` (`net_weight_suffix_mode`, `net_weight_tolerance`); у шаблон пишеться чистий mock маси без суфікса.

**Пробіли в масі нетто:** розділ акордеону – спільні значення (кнопка «Зберегти пробіли») і перемикач «Власні» для шаблону (зберігається з шаблоном), превʼю «380 г ℮ / 380 г ± 8%».

**Застосувати поле до інших шаблонів:** виділити одне поле → модалка `LabelApplyFieldModal`: що переносити, які шаблони (фільтри аудиторія / слот), опційно видалити `estimated_svg`, превʼю «замінено / додано / видалено ℮». Логіка – `shared/pdfme/applyLabelFieldToTemplate.ts`.

Допоміжні модулі: `client/pages/Settings/labelTemplates/*`, `shared/pdfme/*`, `shared/utils/labelTemplateInputs.ts`.

Сервер при старті списку шаблонів: `retireKitBoxLabelSlot` — видаляє дефолт `kit/box`, архівує вбудований `box-kit`.

---

## PDF (сервер)

| Файл | Роль |
| --- | --- |
| `server/modules/Products/pdfme/labelPdfmeRuntime.ts` | `generateLabelPdfBuffer` |
| `server/modules/Products/CatalogLabelService.ts` | Чернетки, history, generate, файли |
| `server/modules/Products/LabelTemplateService.ts` | CRUD шаблонів, resolve для товару |

Legacy `@react-pdf/renderer` для наліпок **знято**; react-pdf лишається для інших документів (техкарта тощо), якщо використовується.

### Client build (Vite)

`@pdfme/ui` тягне `@pdfme/converter` → `clawpdf` (pdfium, Node API) — без обхідного шляху production build падає з OOM. У Vite alias `@pdfme/converter` → `client/shims/pdfmeConverterBrowserStub.ts`. Перед Rollup `scripts/vite/pdfmeClientPrebundle.ts` збирає `@pdfme/ui` і `@pdfme/schemas` одним esbuild-бандлом (кеш `node_modules/.cache/pdfme-client-bundle`), щоб не парсити zod і не ловити жовті `INVALID_ANNOTATION`. `build:client` — heap 8 GB, без gzip-звіту. Імпорт стороннього PDF у Designer у браузері не підтримується.

**Рендер PDF як `basePdf`** (превʼю опублікованої наліпки): shim без імпортів (потрапляє у prebundle `@pdfme/ui`), `pdf2img` / `pdf2size` делегують реалізації, зареєстрованій через `registerPdfmeConverter` (`globalThis`). Реалізація – `productDrawer/label/pdfjsPdfmeConverter.ts` на `pdfjs-dist` (lazy chunk + `pdf.worker.min.mjs?url`, один спільний `PDFWorker`). Без реєстрації shim поводиться як раніше (100×100 мм, без фону). Після зміни shim у dev потрібен перезапуск з переоптимізацією deps (prebundle кешує старий код).

---

## Склад і термін придатності

- Термін: `formatLabelExpiryDate` → `MM.YYYY`; fallback з Dilovod `goodParts` / `getObject` (див. попередні нотатки в git-історії docs).
- Повна дата: `formatLabelExpiryFullDate` → `DD.MM.YYYY`, input `expires_full`, MVT-змінна **`{expires_full}`** (напр. `Вжити до: {expires_full}`). `LabelInputResolver` бере її з підказки, якщо там є день, інакше з Dilovod `getObject`. Чернетки, збережені до появи ключа, мають порожнє значення до синхронізації з картки.
- Поживна цінність: `shared/utils/labelInputs.ts`, `getLabelNutritionErrors`, auto energy (Atwater).

---

## Backend / shared (актуальні шляхи)

```
server/modules/Products/
  ProductLabelsController.ts
  CatalogLabelService.ts
  LabelInputResolver.ts
  LabelTemplateService.ts
  CatalogBoxBarcodeService.ts
  pdfme/labelPdfmeRuntime.ts

server/routes/label-templates.ts

shared/
  types/productLabel.ts, labelTemplate.ts
  constants/labelInputKeys.ts
  utils/labelInputs.ts, productLabelHistory.ts, labelStorefrontOverrides.ts
  # productLabelHistory: productLabelPayloadInputsKey, productLabelDraftMatchesPublished
  pdfme/   # merge template, plugins, built-in presets, labelTemplateSvgAssets

client/
  pages/Products/components/productDrawer/ProductLabelsTab.tsx
  pages/Products/components/productDrawer/label/LabelPdfmeViewer.tsx
  pages/SettingsLabelTemplates.tsx
  pages/Settings/labelTemplates/
  services/ProductLabelService.ts, LabelTemplateService.ts
```

---

## Тести

- `shared/utils/labelInputs.spec.ts`
- `shared/utils/productLabel.spec.ts`
- `shared/utils/productLabelHistory.spec.ts`
- `shared/utils/labelTemplateDefaults.spec.ts`
- `shared/utils/labelTemplateInputs.spec.ts`
- `shared/pdfme/labelTemplateSvgAssets.spec.ts`
- `server/modules/Products/CatalogBoxBarcodeService.spec.ts`
- `server/modules/Products/pdfme/labelPdfmeRuntime.spec.ts`
- `shared/pdfme/*.spec.ts`

---

## Пов’язана документація

- `Docs/features/products-catalog-2.0.md` — каталог, штрихкоди, опис вітрини.
- `Docs/features/warehouse-movement-mob.md` — скан box-ШК, партії.
