# Метадані Dilovod (`listMetadata` / `getMetadata`)

Джерело правди про структуру об'єктів Dilovod API: довідники, документи, регістри. Не хардкодити виміри, ресурси й імена полів регістрів у звітах і payload — брати їх з цього модуля.

Офіційна довідка: [API Dilovod — getMetadata](https://help.dilovod.ua/uk/article/api-dilovod-1gwt3m0/#2-getmetadata-otrimannya-informaciyi-pro-obyekt-metadanih), [request / balanceAndTurnover](https://help.dilovod.ua/uk/article/api-dilovod-1gwt3m0/#2-requestbalanceandturnover-zapit-oborotiv-ta-zalishkiv-za-period).

## Коли використовувати

- Звіти по регістрах (`balanceAndTurnover`, `sliceLast`, `sliceFirst`): виміри, ресурси, віртуальні поля BAT.
- Побудова фільтрів і колонок конструктора звітів.
- Нові інтеграції, де агент або розробник не знає точних імен полів у *цій* базі Dilovod.

Не використовувати для бізнес-даних (залишки, документи, ціни) — лише для опису схеми.

## Модулі

| Файл | Роль |
|---|---|
| `DilovodApiClient.ts` | Сирі виклики `listMetadata`, `getMetadata` (`objectName` / `objectId`) через чергу `makeRequest` |
| `DilovodMetadataService.ts` | Кеш, резолв імені, `getRegisterShape`, `virtualBatFields` |
| `DilovodTypes.ts` | Типи списку, об'єкта, форми регістру |
| `server/routes/dilovod.ts` | HTTP: `GET /api/dilovod/metadata` |

Експорт: `dilovodMetadataService` з `server/services/dilovod`.

## API клієнта

Усі виклики йдуть через глобальну чергу `DilovodApiClient.makeRequest` (одна на процес, retry `multithreadApiSession`). Деталі: `server/services/dilovod/README.md` → «Глобальна черга запитів». Мова метаданих — `uk`.

```typescript
await api.listMetadata('uk');
await api.getMetadataByName('balanceRegisters.goods', 'uk');
await api.getMetadataById(objectId, 'uk');
```

`getMetadataByName` нормалізує `reqs` (масив або об'єкт) у `Record<string, DilovodMetadataReq>`.

`getSettlementsKinds` більше не робить fallback `getMetadata` з `params.id` — лише `objectName`.

## Сервіс

```typescript
import { dilovodMetadataService } from '../services/dilovod/index.js';

const list = await dilovodMetadataService.getList({ q: 'goods' });
const meta = await dilovodMetadataService.getObject('goods');
const shape = await dilovodMetadataService.getRegisterShape('goods');
const bat = dilovodMetadataService.virtualBatFields('qty');
// { start: 'qtyStart', receipt: 'qtyReceipt', expense: 'qtyExpense', final: 'qtyFinal' }
```

### Резолв `objectName`

- Повне ім'я з крапкою (`balanceRegisters.goods`) — без змін.
- Коротке (`goods`): спочатку ключі з `listMetadata`, пріоритет `balanceRegisters.*` → `accumulationRegisters.*` → не `catalogs.*` → перший збіг.
- Для `goods` додаткові кандидати: `balanceRegisters.goods`, `accumulationRegisters.goods`.
- Якщо нічого немає — пошук за `presentation`.

На перевірці dev: `getObject('goods')` → `balanceRegisters.goods`, а не каталог товарів.

### Форма регістру (`getRegisterShape`)

1. Якщо Dilovod віддав `dimensions` / `resources` — вони стають вимірами й ресурсами; решта `reqs` — атрибути.
2. Інакше класифікація з `reqs`: підказки `kind` / `use` / `role` / `purpose` / `type`, потім ім'я (`qty`, `amount`, `cost`…) і `valueType` (`catalogs.*` → вимір, числові типи → ресурс).
3. `null` у `reqs` ігнорується (не падає). `valueType` може бути рядком, об'єктом або масивом (масив склеюється через `|`).

### Кеш

TTL **24 години**. Два шари:

1. In-memory (`Map` у singleton).
2. `settings_base`:
   - `dilovod.meta.list` + `dilovod.meta.list.lastUpdate`
   - `dilovod.meta.obj.{objectName}` + `….lastUpdate`
   - `category`: `dilovod`

`forceRefresh: true` або HTTP `refresh=1` обходить кеш і перезаписує обидва шари. Помилка запису в БД лише логується — відповідь API все одно віддається.

## HTTP

Права: `authenticateToken` + `dilovodRead`.

### `GET /api/dilovod/metadata`

Query:

| Параметр | Дія |
|---|---|
| `q` | Фільтр списку за ім'ям, presentation, id, idPrefix |
| `objectName` | Один об'єкт + shape (як `/:objectName`) |
| `refresh` | `1` / `true` / `yes` — без кешу |

Список:

```json
{ "success": true, "data": { "balanceRegisters.goods": { "id": "…", "presentation": "…" } }, "count": 1 }
```

Один об'єкт (`?objectName=goods` або path):

```json
{
  "success": true,
  "data": {
    "object": { "name": "balanceRegisters.goods", "reqs": {}, "dimensions": {}, "resources": {} },
    "shape": {
      "objectName": "balanceRegisters.goods",
      "registerName": "goods",
      "dimensions": [{ "name": "good", "kind": "dimension", "valueType": "catalogs.goods" }],
      "resources": [{ "name": "qty", "kind": "resource" }],
      "attributes": []
    }
  }
}
```

Path-параметр треба URL-encode: `/api/dilovod/metadata/balanceRegisters.goods`.

## Приклад для звіту BAT

Реалізований звіт: `Docs/features/warehouse-statement.md` (`WarehouseStatementService`). Не підставляти імена полів з голови. Перед `request` з `balanceAndTurnover`:

```typescript
const shape = await dilovodMetadataService.getRegisterShape('goods');
const qty = shape.resources.find((f) => f.name === 'qty') ?? shape.resources[0];
if (!qty) throw new Error('Регістр goods без ресурсу кількості');

const bat = dilovodMetadataService.virtualBatFields(qty.name);
const dimensions = shape.dimensions.map((d) => d.name);

await api.makeRequest({
  action: 'request',
  params: {
    from: {
      type: 'balanceAndTurnover',
      register: shape.registerName,
      startDate,
      endDate,
    },
    fields: [...dimensions, bat.start, bat.receipt, bat.expense, bat.final],
  },
});
```

Фільтри UI (склад, товар, фірма) будувати з `shape.dimensions` і їх `valueType` (посилання на `catalogs.*`).

## `catalogs.users` — користувачі Dilovod (поле `author`)

Для привʼязки локального користувача backoffice до автора документів у Dilovod (`users.dilovodUserId` → `header.author` у payload складу / cash-in / bank-statement).

| Поле метаданих | Призначення |
|---|---|
| `id` / `idPrefix` `10002` | Dilovod user ID (напр. `1000200000001021`) |
| `name` / `id__pr` | Відображуване імʼя |
| `code` | Email користувача в Dilovod |
| `disabled` | Вимкнений користувач |
| `person` | Посилання на `catalogs.persons` (фізична особа) |
| `role` | Роль у Dilovod (`catalogs.roles`) |

**Запит списку** (як інші довідники, через `request`):

```typescript
await api.makeRequest({
  action: 'request',
  params: {
    from: 'catalogs.users',
    fields: { id: 'id', name: 'name', code: 'code', disabled: 'disabled', delMark: 'delMark' },
    filters: [{ alias: 'delMark', operator: '=', value: false }],
  },
});
```

У dev-базі NK Food — ~22 записи (невеликий довідник, зручний для Autocomplete у UI).

**Рекомендація для backoffice:** додати `getUsers()` у `DilovodApiClient` (за зразком `getStorages`), кеш у `settings_base` або розширити `GET /api/dilovod/directories` ключем `users`, на клієнті — `DilovodDictAutocomplete` (`client/pages/BankStatementImport/components/DilovodDictAutocomplete.tsx`) у `CreateUserDrawer` і `UserRegistrationManager` замість ручного Input. Опційно: при створенні користувача з картки HR — автопідбір за email (`code`).

> **Не плутати** з `catalogs.employees` («Працівники») — це кадровий довідник для полів на кшталт `manager` у документах, не системні користувачі API/автори.

## `catalogs.goodParts` — партія товару

Офіційний шаблон `saveObject`: [API Dilovod — saveObject](https://help.dilovod.ua/uk/article/api-dilovod-1gwt3m0/#1-saveobject-zberezhennya-danih-okremogo-obyektu).

- **Новий запис:** `header.id = "catalogs.goodParts"` (ім'я метаданих).
- **Оновлення:** `header.id = <числовий id>` (напр. `1112200000002148`).
- **Мультимовний рядок:** `name: { uk: "…", ru: "…" }` — працює для довідників на кшталт `catalogs.units`, але **не** для `catalogs.goodParts` у базі NK Food.

Приклад робочого створення kit-партії (перевірено live, 2026-10-03):

```json
{
  "action": "saveObject",
  "params": {
    "header": {
      "id": "catalogs.goodParts",
      "owner": "1100300000001542",
      "code": "K61003",
      "date": "2026-10-03 00:00:00",
      "expiration": "2027-10-03 00:00:00"
    }
  }
}
```

Після збереження: `id__pr` у списку = `code`; `getObject` не повертає `name`/`number` навіть для ручних партій (напр. `61002`).

У довіднику Dilovod (UI) є три окремі поля: **Найменування** (`name`), **Серійний №** (`code`), **Номер партії** (`number`).  
У **live `getMetadata` NK Food** (перевірено 2026-10-03) через API доступні лише:

| Поле UI (довідник) | Ключ API | У live `getMetadata` NK Food | `saveObject` |
|---|---|---|---|
| Серійний № | `code` | ✅ | ✅ Kit: `K` + YMMDD (`K61003`) |
| Номер партії | `number` | ❌ | ❌ `cant set value of header.number` |
| Найменування партії | `name` | ❌ | ❌ `cant set value of header.name` |
| Термін придатності | `expiration` | ✅ | ✅ datetime `YYYY-MM-DD 00:00:00` |
| Дата надходження | `date` | ✅ | ✅ datetime `YYYY-MM-DD HH:mm:ss` |
| Товар | `owner` | ✅ | ✅ обовʼязковий |

Відображення в списку Dilovod: `id.pr` = `code`. Ручні партії в UI можуть мати `name.uk` у JSON експорту, але `getObject` / `request` у цій базі поля `name`/`number` не повертають.

Створення партій у backoffice: `DilovodGoodPartsService` — `resolveGoodPartWritableFields()` + `buildGoodPartCreateHeader()` (додає `name`/`number` лише якщо зʼявляться в метаданих). Утиліти: `formatGoodPartCodeForDilovod`, `formatGoodPartNumberForDilovod`, `formatBatchExpirationForDilovod` (`shared/utils/kitBatchName.ts`).

| Ситуація | Джерело людської назви |
|---|---|
| `code` заповнений | `code` (канон) |
| `code` порожній, є `name.uk` / `number` у `getObject` | `pickHumanBatchLabel` / `extractBatchLabelFromGoodPartHeader` (лише читання) |
| Усе порожнє | Альтернативи в balance / barcodes / documents **немає** — треба заповнити `code` |

Аудит порожніх `code` (папка «Готова продукція»): Settings → Dilovod → `DilovodGoodPartsSerialAudit`.  
API: `GET /api/dilovod/good-parts/missing-serial?folderId=…`, `POST /api/dilovod/good-parts/:id/serial` `{ "code": "60905" }`.  
Генерація номера: YMMDD з `header.date` (`2026-09-05` → `60905`).

Утиліти: `shared/utils/dilovodBatchId.ts` (`sanitizeStoredBatchName`, `generateBatchSerialFromDate`, …).

## Складські документи goodWriteOff / goodWriteOn

Перед payload перевіряйте `getObject('documents.goodWriteOff')` vs `getObject('documents.goodWriteOn')`: у **списанні** є обов’язковий `docMode` (`enumerates.docModeGoodWriteOff`); у **оприбуткуванні** — `incomeItem` + `accIncomes`, поля `docMode` немає. Деталі backoffice: [`Docs/features/warehouse-writeoff-surplus.md`](../features/warehouse-writeoff-surplus.md).

## Правило для агентів

У тасках зі звітами / регістрами Dilovod:

1. Структура регістру — `dilovodMetadataService.getRegisterShape`, не константи в коді.
2. Віртуальні колонки BAT — лише `virtualBatFields(resourceName)`.
3. Якщо потрібен live-опис у середовищі — `GET /api/dilovod/metadata?q=…` або `?objectName=…` (після логіну).
4. Назва партії: канон `catalogs.goodParts.code`; не зберігати raw `goodPart` id як `goodPartName`.
