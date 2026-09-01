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

Усі виклики йдуть через існуючу чергу `DilovodApiClient.makeRequest` (ліміт потоків, retry `multithreadApiSession`). Мова метаданих — `uk`.

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

## Приклад для звіту BAT (агент / наступний таск)

Не підставляти імена полів з голови. Перед `request` з `balanceAndTurnover`:

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

## Правило для агентів

У тасках зі звітами / регістрами Dilovod:

1. Структура регістру — `dilovodMetadataService.getRegisterShape`, не константи в коді.
2. Віртуальні колонки BAT — лише `virtualBatFields(resourceName)`.
3. Якщо потрібен live-опис у середовищі — `GET /api/dilovod/metadata?q=…` або `?objectName=…` (після логіну).
