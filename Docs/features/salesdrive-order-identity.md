# SalesDrive: identity замовлення (`id` / `externalId` / `orderNumber`)

## Модель

| Поле | Джерело | Роль |
|------|---------|------|
| `orders.id` | SalesDrive `id` | PK, ключ sync і webhook |
| `orders.externalId` | `generateExternalId(raw)` | унікальний бізнес-ключ, URL `/orders/:externalId`, кеш |
| `orders.orderNumber` | те саме, що `externalId` | відображуваний номер (дзеркало) |

`generateExternalId` (`server/services/salesdrive/externalIdHelper.ts`):

- **sajt 31 / 38 / порожній:** канон `SD{id}` (навіть якщо SD прислав голий `externalId === id` — інакше колізія зі старими рядками).
- **інші канали (напр. sajt 19 = сайт):** оригінальний SD `externalId`.

Lookup існуючого замовлення завжди по **`id`**, не по `externalId`.

## Інцидент 2026-09-07

Після атаки / простою SalesDrive sync оновив контент і `rawData` по `id`, але **не оновлював** `externalId` / `orderNumber` (`detectOrderChanges` їх ігнорував; webhook зберігав старий номер).

Симптом: `id` = SD.id, а колонки `externalId`/`orderNumber` ≠ `rawData.externalId`.

Уражено **10** замовлень сайту (sajt=19), наприклад `16090`: `22960` → `22966`. Виправлено two-phase reconcile + міграція `orders_cache`.

## Захист у коді

1. `detectOrderChanges` порівнює `externalId` і `orderNumber`.
2. Batch sync / single sync / webhook оновлюють identity і мігрують `orders_cache`.
3. Якщо цільовий `externalId` зайнятий іншим `id` (масовий swap) — batch **skip** identity з warn; потрібен reconcile-скрипт.
4. `generateExternalId` зберігає `SD{id}` для каналів 31/38.

## Reconciliation

```bash
# dry-run
npm run orders:reconcile-external-ids
npx tsx server/scripts/reconcile-order-external-ids.ts --since=2026-09-07
npx tsx server/scripts/reconcile-order-external-ids.ts --sajt=19

# apply (two-phase через тимчасові ключі через @unique)
npm run orders:reconcile-external-ids:apply
```

Скрипт: `server/scripts/reconcile-order-external-ids.ts`

- очікуване значення = `generateExternalId(rawData)` при `rawData.id === orders.id`;
- abort при duplicate expected або ключі, зайнятому рядком поза mismatch-набором;
- apply: temp keys → фінальні значення + `orders_history` (`source: reconcile:external-id`) + migrate `orders_cache`.

## Діагностика SQL

```sql
SELECT
  id,
  externalId,
  orderNumber,
  JSON_UNQUOTE(JSON_EXTRACT(rawData, '$.externalId')) AS sd_externalId_in_raw,
  JSON_UNQUOTE(JSON_EXTRACT(rawData, '$.id')) AS sd_id_in_raw,
  sajt,
  lastSynced
FROM orders
WHERE externalId <> orderNumber
   OR (
     JSON_EXTRACT(rawData, '$.externalId') IS NOT NULL
     AND JSON_UNQUOTE(JSON_EXTRACT(rawData, '$.externalId')) <> ''
     AND externalId NOT LIKE CONCAT('%', JSON_UNQUOTE(JSON_EXTRACT(rawData, '$.externalId')), '%')
     AND orderNumber NOT LIKE 'SD%'
   )
ORDER BY lastSynced DESC
LIMIT 100;
```

## Після outage SalesDrive

1. Дочекатися стабільного API.
2. Dry-run reconcile (`--since` = дата інциденту).
3. Apply лише якщо немає occupied/duplicate.
4. Звірити Dilovod-документи, експортовані зі **старими** номерами (скрипт не перейменовує зовнішні docs).
