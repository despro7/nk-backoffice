# WooCommerce Storefront — Фаза 1 (backoffice)

**Дата:** 2026-09-26 (оновлено 2026-09-27)  
**Маршрут налаштувань:** `/settings/storefront` (`page.settings.storefront`)  
**API:** `/api/storefront/*`  
**Повʼязаний домен:** [Products 2.0](./products-catalog-2.0.md) — вкладки «Контент» і «Основні дані» у `ProductDrawer`  
**RBAC:** [Користувачі та ролі](./users-and-roles.md) — налаштування в `/settings/users?tab=roles`, група «Операції з товарами»

---

## Огляд

Фаза 1 — **підготовка даних і конструктора опису в backoffice** без реального push у WooCommerce REST. Мета: зібрати на рівні товару всі поля для опису вітрини, дозволити адміну налаштувати preset блоків і meta-ключів, збирати HTML опис + payload для Phase 2.

| Що | Фаза 1 | Фаза 2 (заплановано) |
|----|--------|----------------------|
| Поля товару (маркетинг, склад, КБЖВ…) | ✅ UI + БД | sync у WC |
| Конструктор блоків / preset | ✅ | — |
| Реєстр WC meta-ключів | ✅ CRUD у settings | запис у `post_meta` |
| WooCommerce REST | заглушка в UI | реальне підключення + push |
| Preview / dry-run | ✅ API | live sync |

**Наступний крок після Фази 1:** Phase 2 (WooCommerce REST sync). Решта UX картки товару — за потреби.

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
| API routes | `server/routes/storefront.ts` |
| Presets & settings | `server/modules/Storefront/StorefrontService.ts` |
| HTML assembly | `server/modules/Storefront/StorefrontDescriptionBuilder.ts` |
| Catalog fields map | `server/modules/Products/catalogStorefrontFields.ts` |
| Field-level ACL (detect changes) | `shared/utils/catalogProductFieldAccess.ts` |
| Catalog save ACL | `server/modules/Products/catalogProductPermissions.ts` |
| Settings UI | `client/pages/SettingsStorefront.tsx` |
| Product UI | `client/pages/Products/components/productDrawer/ProductContentTab.tsx` |
| Ingredients tags | `client/pages/Products/components/productDrawer/ProductIngredientsTags.tsx` |
| Client API | `client/services/StorefrontService.ts` |
| Prisma | `prisma/migrations/20260925180000_catalog_storefront_phase1/`, `20260927120000_storefront_description_refactor/` |

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
| `netWeight` | `weight` / `grossWeight` → `{{netWeight}}`, `{{grossWeight}}` |
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
| `action.storefront.manage` | Керування налаштуваннями вітрини (CRUD) | лише `admin` | POST/PUT/DELETE preset, PUT settings, dry-run push; кнопки збереження на `/settings/storefront` |
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
| WooCommerce API (заглушка Phase 2) | Конструктор опису |
| Meta-ключі (CRUD) | Presets, drag-and-drop блоків, шаблони |

### Конструктор блоків

- **Preset:** select, create, delete, «Зберегти дефолт»
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
2. **Atom-блоки** — `storefrontBlock` nodes з attrs `{ blockId, resolver, template, overrideContent? }`, зібрані з preset при першому відкритті або зміні preset.

HTML для WC збирає `StorefrontDescriptionBuilder.resolveDescriptionDocHtml()` — той сам pipeline, що preview у редакторі.

### Типи блоків у редакторі

| Тип | Resolver-и | Редагування в drawer |
|-----|------------|----------------------|
| **Bound (template-bound)** | `ingredients`, `nutrition`, `netWeight`, `grossWeight`, `kitComponents` | Лише **обрамлення** (шаблон). Значення плейсхолдера — read-only, live з полів товару. |
| **Overridable** | `storage`, `heating`, `salt`, `template` | Повний WYSIWYG override (`overrideContent`); якщо null — текст з preset `template`. |

Візуально bound-блоки мають жовту смужку зліва (`storefront-block--protected`).

**UX редактора (2026-09-27):**

| Елемент | Поведінка |
|---------|-----------|
| Hover на bound / overridable блок | Легкий фон + outline (`global.css`); курсор pointer на preview — «клікніть, щоб редагувати блок» |
| Frozen placeholder atoms (`.storefront-ph-atom`) | `cursor: not-allowed`; HeroUI Tooltip — значення змінюється у «Склад», «КБЖВ» тощо, не в редакторі |
| Hover на bound/overridable preview | Floating Tooltip (event delegation) з підказкою про клік і bound-поля |
| Toolbar | Bold, italic, **strike**, lists, link — паритет з `DescriptionEditor` |
| TypeScript | `ignoreMutation` — `globalThis.Node`; `STOREFRONT_TRAILING_NODE_OPTIONS` без `as const` на `notAfter` |

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
- При blur → назад у preview (одразу, через перевірку `document.activeElement`).
- У JSON зберігається шаблон з `{{placeholders}}` (`templateFromStorefrontEditorHtml`).

**Захист placeholder-ів:** `StorefrontPlaceholderGuard` забороняє видалити atom placeholder з mini-editor.

### TipTap стабільність (2026-09-27)

| Проблема | Рішення |
|----------|---------|
| Зайвий порожній `<p>` після `<ol>` / в кінці doc | `normalizeStorefrontBlockHtml`, `normalizeStorefrontDescriptionDoc`; `trailingNode.notAfter: storefrontBlock, orderedList, bulletList`; CSS hide fallback |
| Backspace у trailing `<p>` видаляв atom «Маса брутто» | `StorefrontAtomBackspaceGuard` — видаляє порожній абзац, не atom |
| Bound edit: blur спрацьовував лише з другого разу | `attachMiniEditorBlurHandler` — deferred check `document.activeElement` |
| Ghost `<p></p>` у збережених override | Нормалізація при load/save + `onChange` якщо doc «брудний» |

Стилі: `client/global.css` — `.storefront-block*`, `.storefront-ph-atom`, приховання trailing empty `<p>`.

---

## API

Префікс `/api/storefront`, `authenticateToken` + `requirePermission`.

| Method | Path | Permission | Опис |
|--------|------|------------|------|
| GET | `/presets` | `action.storefront.read` | список preset |
| POST | `/presets` | `action.storefront.manage` | створити |
| PUT | `/presets/:id` | `action.storefront.manage` | оновити blocks / name |
| DELETE | `/presets/:id` | `action.storefront.manage` | видалити (не default) |
| GET | `/settings` | `action.storefront.read` | metaKeys + defaultPresetId + woo stub |
| PUT | `/settings` | `action.storefront.manage` | metaKeys, defaultPresetId |
| POST | `/preview` | `action.storefront.read` | HTML preview для `goodId` |
| POST | `/dry-run-push` | `action.storefront.manage` | payload Phase 2 без HTTP у WC |

**Збереження товару** (`PUT/POST /api/catalog/goods`): додаткові перевірки в `ProductsController` через `catalogProductPermissions.ts` — див. таблицю RBAC вище.

> Раніше всі `/api/storefront/*` (крім preview) вимагали `action.settings.admin` — через це role preview «Директор» отримував 403 при відкритті вкладки «Контент».

### `dryRunPush` payload (контракт Phase 2)

```ts
{
  goodId: string;
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
- `shared/utils/storefrontDescription.spec.ts` — placeholders, gross, nutrition, template editor live/normalize
- `shared/utils/catalogProductFieldAccess.spec.ts` — detect spec/storefront field changes
- `shared/constants/permissions.spec.ts` — seed для `storefront.*`, `products.editSpec`

```bash
npm run test -- shared/constants/storefrontDefaults.spec.ts shared/utils/storefrontDescription.spec.ts shared/utils/catalogProductFieldAccess.spec.ts shared/constants/permissions.spec.ts
```

---

## Roadmap

| Етап | Статус |
|------|--------|
| **Фаза 1** — поля БД, preset/meta CRUD, конструктор, preview/dry-run | ✅ |
| **Картка товару** — doc-редактор «Повний опис», bound/overridable блоки | ✅ (2026-09-27) |
| **Картка товару** — UX редактора (hover, tooltips, strike, ingredients confirm) | ✅ (2026-09-27) |
| **RBAC** — storefront read/edit/manage + `products.editSpec` | ✅ (2026-09-27) |
| **Картка товару** — решта UX/полів вітрини | 🔜 |
| **Фаза 2** — WooCommerce REST, credentials, push/sync, `wooProductId` | заплановано |
