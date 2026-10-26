# Наліпки для друку (Products 2.0)

**Оновлено:** 2026-10-26  
**UI:** `ProductDrawer` → вкладка **«Наліпки»**; **Налаштування** → **Шаблони наліпок** (`/settings/label-templates`)  
**API:** `/api/products/:goodId/labels/*`, `/api/label-templates/*`  
**Доступ:** `catalog.manage` (мін. `WAREHOUSE_MANAGER`); шаблони — permission `labelTemplates` (BOSS, ADMIN)

---

## Огляд

PDF-етикетки **100×100 мм** для партій готової продукції. Макет задається **pdfme**-шаблонами (Designer у налаштуваннях). Типи: **«Порція»** (`portion`) та **«Коробка»** (`box`).

| Що | Рішення |
| --- | --- |
| Шаблон | `catalog_label_templates` + матриця дефолтів (good/kit × portion/box); override на `catalog_goods` |
| Дані на наліпці | `LabelInputMap` (`shared/constants/labelInputKeys.ts`), резолвер `LabelInputResolver` |
| Чернетка | Одна на `(goodId, batchId, labelKind)`; `updatedBy` + `updatedAt` |
| Опубліковані PDF | Кожна генерація — `version`, файл у `uploads/catalog-labels/{goodId}/`, `publishedBy` |
| Історія в UI | `GET …/labels/history` — **чернетка + PDF** в одному списку «Версії» |
| Превʼю | `LabelPdfmeViewer` (pdfme Form); підпис під превʼю (дата, автор, партія) |
| PDF | `@pdfme/generator` + `labelPdfmeRuntime.ts`, шрифти Arial з assets Designer |
| ШК порції | `catalog_good_barcodes` (`barcodeKind: portion`), привʼязка до `goodPart` (партія) |
| ШК коробки | `barcodeKind: box`, один EAN-13 на пару good+batch (`CatalogBoxBarcodeService`); скан на моб. переміщенні → +1 «Коробок» |

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

Генерація PDF вимагає валідної поживної цінності (`getLabelNutritionErrors`).

---

## API (товар)

`ProductLabelsController` → `server/routes/products.ts`.

| Method | Path | Опис |
| --- | --- | --- |
| GET | `…/labels/draft?batchId=&labelKind=` | Чернетка |
| PUT | `…/labels/draft` | Зберегти чернетку (`updatedBy` = поточний user) |
| POST | `…/labels/seed` | Перестворити чернетку з картки |
| GET | `…/labels/history?batchId=&labelKind=` | **Чернетка + опубліковані** (для UI) |
| GET | `…/labels/published?batchId=&labelKind=` | Лише PDF-версії |
| GET | `…/labels/published/latest?labelKind=` | Останній PDF по товару |
| GET | `…/labels/resolve-template?labelKind=` | Який шаблон застосується |
| PATCH | `…/labels/template` | Override пресета на товарі |
| POST | `…/labels/published/generate` | Новий PDF + версія |
| GET | `…/labels/published/:id/pdf` | Файл PDF |
| DELETE | `…/labels/published/:id` | Видалити версію (**ADMIN**) |

Клієнт: `client/services/ProductLabelService.ts`.

### API шаблонів

`server/routes/label-templates.ts` — CRUD, дефолти, preview PDF, `preview-inputs`, override по товарах.  
Клієнт: `client/services/LabelTemplateService.ts`.

---

## UI — картка товару (`ProductLabelsTab`)

1. **Tabs** `Порція | Коробка`.
2. **Пресет** — override або «За замовчуванням (Settings)»; при `templateId === null` підвантажується дефолт через `resolveTemplate`.
3. **Партія** — `BatchNumbersAutocomplete`; автопідстановка з `published/latest`.
4. **Версії** — один Select: чернетка (`Чернетка · дата · автор`) і `vN · дата · автор`; перемикання завантажує payload; PDF — режим перегляду, чернетка — редагування.
5. Під превʼю — `formatProductLabelHistoryCaption` (збережено / згенеровано, автор, партія).
6. **Дії:** зберегти чернетку · синхронізувати з картки (`seed`) · згенерувати PDF · завантажити / друк (браузер) лише для обраного **PDF** · «Редагувати як чернетку» (клон з PDF).

Превʼю: `label/LabelPdfmeViewer.tsx`. Текстові поля — accordion з `LABEL_EDITABLE_KEYS`.

---

## UI — налаштування шаблонів

`client/pages/SettingsLabelTemplates.tsx` — список пресетів, pdfme Designer (100×100 мм), матриця дефолтів, overrides по товарах, живий preview (індекс ГП `warehouse-search-index` + партія, `GET …/preview-inputs`).

Допоміжні модулі: `client/pages/Settings/labelTemplates/*`, `shared/pdfme/*`.

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

---

## Склад і термін придатності

- Термін: `formatLabelExpiryDate` → `MM.YYYY`; fallback з Dilovod `goodParts` / `getObject` (див. попередні нотатки в git-історії docs).
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
  pdfme/   # merge template, plugins, built-in presets

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
- `shared/utils/productLabelHistory.spec.ts`
- `shared/utils/labelTemplateDefaults.spec.ts`
- `server/modules/Products/CatalogBoxBarcodeService.spec.ts`
- `server/modules/Products/pdfme/labelPdfmeRuntime.spec.ts`
- `shared/pdfme/*.spec.ts`

---

## Пов’язана документація

- `Docs/features/products-catalog-2.0.md` — каталог, штрихкоди, опис вітрини.
- `Docs/features/warehouse-movement-mob.md` — скан box-ШК, партії.
