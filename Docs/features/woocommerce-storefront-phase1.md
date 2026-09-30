# WooCommerce Storefront — Фаза 1 (backoffice)

**Дата:** 2026-09-26 (оновлено 2026-09-29, фаза 2–3)  
**Маршрут налаштувань:** `/settings/storefront` (`page.settings.storefront`)  
**API:** `/api/storefront/*`  
**Повʼязаний домен:** [Products 2.0](./products-catalog-2.0.md) — вкладки «Контент» і «Основні дані» у `ProductDrawer`  
**RBAC:** [Користувачі та ролі](./users-and-roles.md) — налаштування в `/settings/users?tab=roles`, група «Операції з товарами»

---

## Огляд

Фаза 1 — **підготовка даних і конструктора опису в backoffice**. Фаза 2 (2026-09-28) — **реальний WooCommerce REST**: pull/push опису, зображень, привʼязка `wooProductId`.

| Що | Фаза 1 | Фаза 2 |
|----|--------|--------|
| Поля товару (маркетинг, склад, КБЖВ…) | ✅ UI + БД | ✅ push/pull |
| Конструктор блоків / preset | ✅ | — |
| Реєстр WC meta-ключів | ✅ CRUD у settings | ✅ запис у `post_meta` |
| WooCommerce REST | заглушка в UI | ✅ credentials, test, pull/push |
| Preview / dry-run | ✅ API | ✅ live sync + bulk push/pull |
| Медіа товару | локально в BO | ✅ upload/pull у WC + `wooMediaId` |
| Категорія WC | — | ✅ група BO → категорія WC (pull/push) |
| Залишки WC | legacy `syncStock.php` | ✅ REST stock sync + режим cutover |

---

## Архітектура

```
Settings (/settings/storefront)
  ├── Meta-ключі (settings_base: storefront.metaKeys)
  ├── Default preset id (storefront.defaultPresetId)
  └── Presets (catalog_storefront_presets.blocksJson)

Product card (ProductDrawer → ProductContentTab)
  ├── Поля товару → catalog_goods.*
  ├── Preset override (storefrontPresetId)
  └── Preview → POST /api/storefront/preview

Assembly (server)
  StorefrontDescriptionBuilder
    ├── preset blocks + resolver
    ├── substitute placeholders
    └── dryRunPush → { descriptionHtml, meta, status, … }
```

### Ключові файли

| Шар | Файли |
|-----|-------|
| Shared types | `shared/types/storefront.ts` |
| Defaults / normalize | `shared/constants/storefrontDefaults.ts` |
| Placeholders / nutrition / gross | `shared/utils/storefrontDescription.ts` |
| Product description editor | `client/pages/Products/components/productDrawer/StorefrontDescriptionEditor.tsx` |
| Editor shared utils | `client/components/editor/editorFormatting.ts`, `HtmlCodeMirror.tsx` |
| Bubble toolbar | `client/pages/Products/components/productDrawer/storefrontEditorBubbleToolbar.lib.ts` |
| WC pull modal | `client/pages/Products/components/productDrawer/StorefrontPullConfirmModal.tsx` |
| Bulk pull wizard | `client/pages/Products/components/StorefrontBulkPullWizard.tsx` |
| Pull field matrix | `client/pages/Products/components/productDrawer/storefrontPullFields.ts` |
| Sync reports | `client/pages/Products/components/StorefrontSyncReportModal.tsx` |
| Conflict tooltip BO↔WC | `client/pages/Products/components/PullFieldConflictTooltip.tsx` |
| WC description parser | `shared/utils/storefrontDescriptionParser.ts` |
| WC category resolver | `server/modules/Storefront/WooCommerceCategoryService.ts` |
| WC stock sync | `server/modules/Storefront/WooCommerceStockService.ts` |
| Kit components template | `shared/utils/kitComponentsTemplate.ts` |
| API routes | `server/routes/storefront.ts` |
| Presets & settings | `server/modules/Storefront/StorefrontService.ts` |
| WC REST client / sync | `server/modules/Storefront/WooCommerceApiClient.ts`, `WooCommerceSyncService.ts` |
| WC media sync | `server/modules/Storefront/WooCommerceMediaService.ts` |
| HTML assembly | `server/modules/Storefront/StorefrontDescriptionBuilder.ts` |
| Catalog fields map | `server/modules/Products/catalogStorefrontFields.ts` |
| Field-level ACL (detect changes) | `shared/utils/catalogProductFieldAccess.ts` |
| Catalog save ACL | `server/modules/Products/catalogProductPermissions.ts` |
| Settings UI | `client/pages/SettingsStorefront.tsx` |
| Product UI | `client/pages/Products/components/productDrawer/ProductContentTab.tsx` |
| Ingredients tags | `client/pages/Products/components/productDrawer/ProductIngredientsTags.tsx` |
| Client API | `client/services/StorefrontService.ts` |
| Prisma | `prisma/migrations/20260925180000_catalog_storefront_phase1/`, `20260927120000_storefront_description_refactor/`, `20260928190000_catalog_main_product_weight/` |

---

## База даних

### `catalog_goods` (storefront-поля)

| Поле | Призначення |
|------|-------------|
| `doNotPublish` | Не публікувати на вітрині → status `draft` |
| `storefrontPresetId` | Override preset (null = default з settings) |
| `storefrontDescriptionDoc` | TipTap JSON повного опису (маркетинг + atom-блоки preset) |
| `productIngredientsJson` | JSON-масив тегів складу (lowercase), редагується через `ProductIngredientsTags` |
| `productNutritionJson` | КБЖВ (JSON) |
| `grossWeight` | Ручна маса брутто, кг |
| `mainProductWeight` | Маса осн. продукту, кг (bound-блок `mainProductWeight`) |
| `weight` | Маса нетто, кг (загальне поле каталогу) |
| `wooProductId` | ID товару WC (Phase 2) |
| `wooLastSyncedAt` | Час останнього sync (Phase 2) |

> **Міграція 20260927120000:** видалено per-field override-и (`productMarketingText`, `productIngredientsText`, `productStorageText`, `productHeatingOverride`, …). Маркетинг і блоки опису тепер у `storefrontDescriptionDoc`; склад — у `productIngredientsJson`.

### `catalog_storefront_presets`

Preset = упорядкований список блоків у `blocksJson` (повний `StorefrontBlockConfig[]`).

### `settings_base`

| Key | Значення |
|-----|----------|
| `storefront.metaKeys` | JSON-масив `StorefrontMetaKeyConfig[]` |
| `storefront.defaultPresetId` | UUID preset за замовчуванням |
| `storefront.sync.autoPushOnSave` | Push на WC після збереження картки товару |
| `storefront.sync.stockViaWc` | Режим синхронізації залишків: `legacy` / `parallel` / `wc_only` |

Seed preset «Стандарт»: `00000000-0000-4000-8000-000000000001`.

---

## Контракти (shared)

### Meta-ключ (`StorefrontMetaKeyConfig`)

```ts
{ id: string; label: string; key: string }  // key = WC meta, напр. _nk_ingredients
```

Глобальний реєстр. Блоки посилаються через `metaKeyId`, не через дубль `key` у блоці.

### Блок preset (`StorefrontBlockConfig`)

```ts
{
  id: string;
  label: string;
  enabled: boolean;
  resolver: StorefrontBlockResolver;
  template: string;
  metaKeyId: string | null;
}
```

### Resolver — звідки береться **значення** для плейсхолдера

| `resolver` | Джерело даних |
|------------|---------------|
| `template` | лише шаблон (вільний текст) |
| `ingredients` | `productIngredientsJson` → plain text |
| `nutrition` | `productNutritionJson` → HTML |
| `storage` | шаблон preset + override у `storefrontDescriptionDoc` |
| `heating` | шаблон preset + override у `storefrontDescriptionDoc` |
| `salt` | шаблон preset + override у `storefrontDescriptionDoc` |
| `netWeight` | `weight` → `{{netWeight}}` |
| `mainProductWeight` | `mainProductWeight` → `{{mainProductWeight}}` |
| `grossWeight` | `grossWeight` або BOM → `{{grossWeight}}` |
| `kitComponents` | HTML `<ul>` з BOM; **лише kits** (`accPolicy` набору) |

> **Маркетинг** більше не окремий resolver-блок у preset. Вільний абзац з класом `storefront-marketing` — перший параграф у `storefrontDescriptionDoc`.

> **Важливо:** dropdown «Meta-ключ» у блоці **не визначає** джерело контенту. Він лише каже, у яке WC meta-поле (Phase 2) дублювати значення блоку. Джерело — `resolver`.

### Плейсхолдери в шаблоні

Усі блоки мають редактор шаблону (TipTap). Підстановка через `substituteStorefrontPlaceholders`:

| Плейсхолдер | Зміст |
|-------------|-------|
| `{{marketing}}` | текст маркетингу |
| `{{ingredients}}` | склад (plain text) |
| `{{nutrition}}` | КБЖВ (HTML) |
| `{{kitComponents}}` | список комплекту (HTML) |
| `{{netWeight}}` | форматована маса нетто |
| `{{grossWeight}}` | форматована маса брутто |
| `{{storage}}`, `{{heating}}`, `{{salt}}` | override або порожньо |

Також підтримуються **аліаси WC meta-ключів** з реєстру, напр. `{{_nk_ingredients}}` ≡ `{{ingredients}}`.

Дефолтні шаблини (seed): `Склад: {{ingredients}}`, `Маса нетто: {{netWeight}}`, тощо — див. `STOREFRONT_BUILTIN_DEFAULTS` у `storefrontDefaults.ts`.

Якщо шаблон порожній — використовується лише основний плейсхолдер resolver (напр. `{{ingredients}}`).

---

## Права доступу (RBAC)

Ключі в `shared/constants/permissions.ts`, UI — drawer ролі, секція **«Операції з товарами»**. Права **незалежні** (можна видати лише read, лише edit тощо).

| Ключ | UI label | Seed (системні ролі) | Призначення |
|------|----------|----------------------|-------------|
| `page.settings.storefront` | Вітрина WooCommerce | лише `admin` | Сторінка `/settings/storefront` у меню |
| `action.storefront.read` | Читання шаблонів вітрини | від `warehouse-manager` | GET `/api/storefront/presets`, `/settings`; preview; селект preset у картці товару |
| `action.storefront.edit` | Редагування контенту вітрини товару | від `warehouse-manager` | Поля вкладки «Контент» + збереження через PUT `/api/catalog/goods/:id` (лише якщо змінились storefront-поля) |
| `action.storefront.manage` | Керування налаштуваннями вітрини (CRUD) | лише `admin` | POST/PUT/DELETE preset, PUT settings, dry-run push, WC credentials, orphan media |
| `action.storefront.pull` | Pull опису з WooCommerce | лише `admin` | `pull-preview` / `pull-apply`, inspect WC |
| `action.storefront.push` | Push опису на WooCommerce | від `warehouse-manager` | `push-preview` / `push-apply`, bulk push, upload media |
| `action.products.editSpec` | Редагування специфікації товару (BOM) | лише `admin` | BOM + `specQty` на «Основні дані»; **не** входить у ACL папки каталогу |

**Storefront-поля для перевірки `edit`** (порівняння зі збереженим товаром, `catalogProductFieldAccess.ts`):

- `doNotPublish`, `storefrontPresetId`, `productIngredientsJson`, `productNutritionJson`, `storefrontDescriptionDoc`, `description` (короткий опис на вкладці «Контент»).

`grossWeight` редагується у блоці «Упаковка» на «Основних даних» і **не** вимагає `storefront.edit` (лише edit ACL папки).

**Spec-поля для перевірки `editSpec`:** `components[]`, `specQty`.

Якщо користувач зберігає картку без змін у цих полях — PUT проходить навіть без відповідного action (решта полів — за ACL папки / `catalog.manage`).

---

## UI: `/settings/storefront`

**Доступ:** `page.settings.storefront`. **Мутації** (preset CRUD, meta-ключі, зберегти) — `action.storefront.manage`.

Layout **1/3 + 2/3**:

| Ліва колонка | Права колонка |
|--------------|---------------|
| WooCommerce API (URL, keys, enable, test connection, media base URL) | Конструктор опису |
| Meta-ключі (CRUD) | Presets, drag-and-drop блоків, шаблони |
| Orphan WC media audit | Налаштування `kitComponents` (категорії BOM) |

### Конструктор блоків

- **Preset:** select, create (клон поточного), delete, «Зберегти дефолт», **«Скинути до типового»** для шаблону блоку
- **Блок:** switch, inline-edit назви (клік → input), meta-ключ, шаблон (WYSIWYG)
- **Кастомні блоки:** `resolver: template`, можна додавати / видаляти (double-click delete)
- **Захищені від видалення** (🔒): `ingredients`, `nutrition`, `kitComponents` — привʼязані до структурованих даних товару; вимкнути можна switch-ем
- **Решта built-in блоків** (маркетинг, сіль, зберігання…) — текстові; видалення дозволене (можна замінити кастомним `template`-блоком)

При видаленні meta-ключа з реєстру — `metaKeyId` у блоках скидається в `null`.

---

## UI: картка товару — «Повний опис»

Вкладка **«Контент»** (`ProductContentTab`):

| Секція | Компонент | Призначення |
|--------|-----------|-------------|
| Склад | `ProductIngredientsTags` | JSON-теги → `productIngredientsJson`; видалення chip — через `ConfirmModal`; ✕ при hover — `text-danger` |
| КБЖВ | `StorefrontNutritionFields` | `productNutritionJson` |
| Публікація | Switch + Select | `doNotPublish`, `storefrontPresetId` |
| **Повний опис** | `StorefrontDescriptionEditor` | `storefrontDescriptionDoc` (TipTap JSON) |
| Короткий опис | `DescriptionEditor` | `description` (HTML, окремо від вітрини) |

### Структура `storefrontDescriptionDoc`

TipTap JSON (`StorefrontDescriptionDoc`):

1. **Маркетинговий абзац** — звичайний `paragraph` з `class: storefront-marketing` (вільний текст).
2. **Atom-блоки** — `storefrontBlock` nodes з attrs `{ blockId, resolver, template, overrideContent? }`, зібрані з preset при першому відкритті або зміні preset (`syncStorefrontDescriptionDocWithPreset` зберігає маркетинговий абзац).

HTML для WC збирає `StorefrontDescriptionBuilder.resolveDescriptionDocHtml()` — той сам pipeline, що preview у редакторі.

### Типи блоків у редакторі

| Тип | Resolver-и | Редагування в drawer |
|-----|------------|----------------------|
| **Bound (template-bound)** | `ingredients`, `nutrition`, `netWeight`, `grossWeight`, `kitComponents` | Лише **обрамлення** (шаблон). Значення плейсхолдера — read-only, live з полів товару. |
| **Overridable** | `storage`, `heating`, `salt`, `template` | Повний WYSIWYG override (`overrideContent`); якщо null — текст з preset `template`. |

Візуально bound-блоки мають жовту смужку зліва (`storefront-block--protected`).

**UX редактора (2026-09-28):**

| Елемент | Поведінка |
|---------|-----------|
| Toolbar | H2–H6 select, bold/italic/strike, lists, link, **очистити форматування** (знімає marks, заголовки, списки, `class` параграфа) |
| Bubble menu | Спільний для основного редактора і bound mini-editor; одночасно активний лише один екземпляр |
| JSON source | CodeMirror для `storefrontDescriptionDoc`; після повернення bound-блоки знову інтерактивні |
| HTML preview | Модалка з фінальним HTML для WC (`StorefrontHtmlPreviewModal`) |
| Списки | `StorefrontListItem` (`inline*`) — `<li>текст</li>` без зайвого `<p>`; коректний HTML у WC |
| Hover на bound / overridable блок | Фон + outline; delete-кнопка; floating tooltip — **лише в preview** (після blur з edit mode) |
| Frozen placeholder atoms | Read-only live-значення; редагуються у полях товару, не в шаблоні |

**Права на вкладці:** завантаження preset — `storefront.read` (без API — fallback `STOREFRONT_DEFAULT_BLOCKS`); редагування полів — `storefront.edit` (`publishLocked` / `storefrontFieldsLocked`).

### Bound-блоки: preview vs edit

**Preview (за замовчуванням):**

- Рендер через `resolveStorefrontBlockPreviewHtml(attrs, boundValues)`.
- Підставляються live-значення з `buildStorefrontBoundValues()` + nutrition HTML.
- Порожні bound-поля → italic-підказка («Дані складу ще не заповнені…»).

**Edit (клік по preview):**

- Mini TipTap editor всередині atom node view.
- У шаблоні плейсхолдери (`{{ingredients}}`, …) показуються як **read-only inline atoms** з **поточним live-текстом** (`templateHtmlForStorefrontEditorLive`), а не як `{{key}}`.
- Порожнє значення → курсивне «немає даних» (`.storefront-ph-atom--empty`).
- При зміні полів товару placeholder-и оновлюються без виходу з edit mode.
- При blur / фокусі основного редактора → назад у preview (`attachMiniEditorBlurHandler`; кліки в scroll-області не вважаються toolbar chrome).
- У JSON зберігається шаблон з `{{placeholders}}` (`templateFromStorefrontEditorHtml`).

**Захист placeholder-ів:** `StorefrontPlaceholderGuard` забороняє видалити atom placeholder з mini-editor.

### TipTap стабільність (2026-09-27)

| Проблема | Рішення |
|----------|---------|
| Зайвий порожній `<p>` після `<ol>` / в кінці doc | `normalizeStorefrontBlockHtml`, `normalizeStorefrontDescriptionDoc`; `trailingNode.notAfter: storefrontBlock, orderedList, bulletList`; CSS hide fallback |
| Backspace у trailing `<p>` видаляв atom «Маса брутто» | `StorefrontAtomBackspaceGuard` — видаляє порожній абзац, не atom |
| Bound edit: blur спрацьовував лише з другого разу | `attachMiniEditorBlurHandler` — deferred check `document.activeElement` |
| Ghost `<p></p>` у збережених override | Нормалізація при load/save + `onChange` якщо doc «брудний» |
| Хибний dirty «Повний опис» при відкритті вкладки | `onInitialSettled` у `StorefrontDescriptionEditor` + `mergeStorefrontFieldsIntoDrawerBaseline` у `ProductDrawer` (не перезаписувати baseline інших вкладок) |

Стилі: `client/global.css` — `.storefront-block*`, `.storefront-ph-atom`, приховання trailing empty `<p>`.

### WooCommerce sync (картка товару + каталог)

| Дія | UI | API |
|-----|-----|-----|
| Pull з WC (один) | `StorefrontPullConfirmModal` — preview полів, вибір що застосувати | `POST /woo/pull-preview`, `/woo/pull-apply` |
| **Pull з WC (bulk)** | `StorefrontBulkPullWizard` — матриця полів, конфлікти, прогрес | `POST /woo/pull-bulk-preview`, `/woo/pull-bulk-apply` |
| Push на WC | Меню drawer / bulk у каталозі | `POST /woo/push-preview`, `/woo/push-apply`, `/woo/push-bulk` |
| Upload/pull зображень | `ProductImageUpload` + push; bulk pull — опція «Замінити існуючі» | `POST /woo/media/upload` |
| Категорія WC | Матриця pull / single pull | push/pull через `WooCommerceCategoryService` |
| Залишки WC | `/settings/storefront` → режим stock sync; cron | `POST /woo/stock/sync` |
| Inspect WC | Admin drawer | `POST /woo/inspect` |
| Звіти sync | `StorefrontSyncReportModal` | після bulk push/pull |

**Bulk pull** — до 50 товарів: матриця полів (`name`, короткий опис, storefront doc, склад, КБЖВ, вага, ціна, не публікувати, **категорія**, **зображення**), tooltip конфліктів BO↔WC, дії `pull` / `skip` / `create_on_wc`.

Pull парсить WC HTML/meta через `storefrontDescriptionParser` → `storefrontDescriptionDoc`, склад, КБЖВ, **назва**, ціни; короткий опис — з `short_description` або маркетингового абзаца. Push відправляє **назву**, опис, meta, status, **категорію** (група BO). Після sync оновлюються `wooProductId`, `wooLastSyncedAt`; зображення — `catalog_good_images.wooMediaId`.

**Typography при pull:** `normalizeWcTypography` замінює довге тире (—) на коротке (–) у текстових вузлах doc, HTML override блоків і template-полях (`normalizeWcTypographyInStorefrontDoc`).

> **Короткий опис при pull:** поле `description` — SoT Dilovod. Після pull значення пишеться в Prisma **і** в Dilovod (`saveObject`), інакше live-pull з ERP затирає імпорт.

**Auto-push:** налаштування `storefront.sync.autoPushOnSave` — після збереження картки товару (якщо є `wooProductId`).

**Stock sync (Phase 3):** `stockViaWc` у settings — `legacy` (лише `syncStock.php`), `parallel` (обидва канали), `wc_only` (лише WooCommerce REST). Cron після SalesDrive export використовує обраний режим.

---

## API

Префікс `/api/storefront`, `authenticateToken` + `requirePermission`.

| Method | Path | Permission | Опис |
|--------|------|------------|------|
| GET | `/presets` | `action.storefront.read` | список preset |
| POST | `/presets` | `action.storefront.manage` | створити |
| PUT | `/presets/:id` | `action.storefront.manage` | оновити blocks / name |
| DELETE | `/presets/:id` | `action.storefront.manage` | видалити (не default) |
| GET | `/settings` | `action.storefront.read` | metaKeys, defaultPresetId, kitComponentSettings, wooCommerce |
| PUT | `/settings` | `action.storefront.manage` | metaKeys, defaultPresetId, kitComponentSettings, wooCommerce |
| POST | `/preview` | `action.storefront.read` | HTML preview для `goodId` |
| POST | `/dry-run-push` | `action.storefront.manage` | payload без HTTP у WC |
| POST | `/woo/test-connection` | `action.storefront.manage` | перевірка credentials |
| POST | `/woo/inspect` | `action.storefront.pull` | summary WC product за SKU |
| POST | `/woo/pull-preview` | `action.storefront.pull` | порівняння local vs WC |
| POST | `/woo/pull-apply` | `action.storefront.pull` | застосувати вибрані поля |
| POST | `/woo/pull-bulk-preview` | `action.storefront.pull` | bulk preview + конфлікти |
| POST | `/woo/pull-bulk-apply` | `action.storefront.pull` | bulk apply (матриця полів) |
| POST | `/woo/push-preview` | `action.storefront.push` | preview push |
| POST | `/woo/stock/sync` | `action.storefront.push` | синхронізація залишків WC REST |
| POST | `/woo/push-apply` | `action.storefront.push` | push одного товару |
| POST | `/woo/push-bulk` | `action.storefront.push` | bulk push |
| POST | `/woo/media/upload` | `action.storefront.push` | upload зображень товару |
| GET | `/woo/media/orphans` | `action.storefront.manage` | audit orphan WC media |
| POST | `/woo/media/orphans/delete` | `action.storefront.manage` | видалити orphan media |

**Збереження товару** (`PUT/POST /api/catalog/goods`): додаткові перевірки в `ProductsController` через `catalogProductPermissions.ts` — див. таблицю RBAC вище.

> Раніше всі `/api/storefront/*` (крім preview) вимагали `action.settings.admin` — через це role preview «Директор» отримував 403 при відкритті вкладки «Контент».

### `dryRunPush` payload (контракт Phase 2)

```ts
{
  goodId: string;
  name: string | null;
  status: 'publish' | 'draft';
  shortDescription: string | null;
  descriptionHtml: string;
  weight: number | null;
  grossWeightKg: number | null;
  meta: Record<string, string>;  // WC meta keys → values
}
```

Status `draft`: `doNotPublish` або товар у папці «Архів – …».

---

## Дефолтні WC meta-ключі (seed)

| id | label | key |
|----|-------|-----|
| meta-marketing | Маркетинг | `_nk_marketing_text` |
| meta-ingredients | Склад | `_nk_ingredients` |
| meta-nutrition | КБЖВ | `_nk_nutrition` |
| meta-storage | Зберігання | `_nk_storage` |
| meta-gross-weight | Маса брутто | `_nk_gross_weight` |

---

## Тести

- `shared/constants/storefrontDefaults.spec.ts` — normalize, protected blocks
- `shared/utils/storefrontDescription.spec.ts` — placeholders, gross, nutrition, inline list items, template editor
- `shared/utils/storefrontDescriptionParser.spec.ts` — парсинг WC HTML/meta при pull
- `shared/utils/kitComponentsTemplate.spec.ts` — шаблон `{{kitComponents}}`
- `server/modules/Storefront/WooCommerceSyncService.spec.ts`, `WooCommerceCategoryService.spec.ts`, `WooCommerceStockService.spec.ts`, `WooCommerceApiClient.spec.ts`
- `shared/utils/catalogProductFieldAccess.spec.ts` — detect spec/storefront field changes
- `shared/constants/permissions.spec.ts` — seed для `storefront.*`, `products.editSpec`

```bash
npm run test -- shared/utils/storefrontDescription.spec.ts shared/utils/storefrontDescriptionParser.spec.ts server/modules/Storefront/WooCommerceSyncService.spec.ts
```

---

## Roadmap

| Етап | Статус |
|------|--------|
| **Фаза 1** — поля БД, preset/meta CRUD, конструктор, preview/dry-run | ✅ |
| **Картка товару** — doc-редактор «Повний опис», bound/overridable блоки | ✅ (2026-09-27) |
| **Картка товару** — UX редактора (hover, tooltips, strike, ingredients confirm) | ✅ (2026-09-27) |
| **RBAC** — storefront read/edit/manage + `products.editSpec` | ✅ (2026-09-27) |
| **Редактор «Повний опис»** — toolbar, bubble menu, JSON source, lists, WC HTML preview | ✅ (2026-09-28) |
| **Фаза 2** — WooCommerce REST pull/push, media, bulk push | ✅ (2026-09-28) |
| **Фаза 2–3** — bulk pull wizard, звіти, auto-push, категорія WC, stock REST | ✅ (2026-09-29) |
