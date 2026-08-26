# Bank Statement Import — Завантаження банківських виписок

**Дата:** 2026-08-26  
**Маршрут:** `/accounting/bank-statements` (Бухгалтерія)  
**Дозвіл:** `page.accounting.bankStatements`  
**API:** `/api/dilovod/bank-statement/*`

## Призначення

Сторінка дозволяє завантажити Excel-виписку (типово NovaPay), рознести рядки на **Витрати** (`documents.cashOut`) і **Надходження** (`documents.cashIn`) та послідовно відправити документи в Dilovod.

На відміну від [імпорту реєстру переказів НП](./cash-in-import.md):

- немає прив’язки до замовлень (`person` порожній, `content` = призначення платежу);
- напрям береться з колонок дебет/кредит (U / W за замовчуванням), не з типу файлу;
- у payload ідуть лише рядки, позначені чекбоксами (за замовчуванням усі витрати увімкнені, надходження вимкнені).

---

## Архітектура

```
ParseSettingsPanel + FileUploadZone
        → POST /api/dilovod/bank-statement/preview  (multipart: file + mapping JSON)
BankStatementPreviewTable
        ← рядки + довідники Dilovod (corAccount, settlementsKind, cashItem)
BankStatementSummary
        → POST /api/dilovod/bank-statement/export?dryRun=true | export
```

**Сервіси:**

| Файл | Роль |
|---|---|
| `BankStatementImportService` | Парсинг Excel за шаблоном колонок, напрям U/W, сирий sample для debug |
| `BankStatementExportBuilder` | Payload `cashOut` / `cashIn`, каса з IBAN шапки, sequential `saveObject` |
| `BankStatementTemplateService` | Шаблони парсингу + словник ключових слів + inline-колонки в `settings_base` (`bank_statement_templates`) |

**Спільні типи:** `shared/types/bankStatement.ts`.

**UI-кроки:** `client/components/Timeline.tsx`, пресет `sky`. Реєстр НП лишається на `amber`.

---

## Парсинг Excel

Вбудований шаблон **NovaPay** (`id: novapay`):

| Параметр | Значення |
|---|---|
| Початок даних | рядок 17 (1-based) |
| Шапка | 16 рядків |
| № операції | A |
| Дата | B |
| IBAN кореспондента | C |
| Найменування | D |
| ЄДРПОУ | E |
| Призначення | G |
| Дебет / витрати | U |
| Кредит / надходження | W |

IBAN власника рахунку читається з шапки файлу і мапиться на `catalogs.cashAccounts` (каса в header). Рядок без валідної суми пропускається.

Мапінг можна змінити в акордеоні налаштувань, зберегти як шаблон і зробити активним. Вбудований шаблон не видаляється.

---

## Напрямок і payload

- Якщо є сума в дебеті — **витрата** (`cashOut`); у кредиті — **надходження** (`cashIn`); неоднозначність → витрата.
- Таби Витрати (червоний) / Надходження (зелений). Перенесення і видалення — з підтвердженням (рядкові кнопки, bulk, ПКМ).
- Чекбокси = склад експорту, не «видимість у табі».
- `corAccount`, `settlementsKind`, `cashItem` — id довідників Dilovod; у таблиці й модалці показуються назви. Дефолти — `BANK_STATEMENT_DEFAULTS` у `shared/types/bankStatement.ts`.
- Inline-edit колонок вмикається в налаштуваннях (зберігається разом із шаблонами).

### Словник видів розрахунків

При ручній зміні `settlementsKind` унікальне слово з призначення (не stop-word, немає в інших рядках) додається до словника цього виду. Далі такі рядки підхоплюють вид автоматично. Теги редагуються в акордеоні. Логіка: `shared/utils/settlementsKindKeywords.ts`.

---

## Payload (окремий документ)

```json
{
  "saveType": 1,
  "header": {
    "id": "documents.cashOut | documents.cashIn",
    "date": "YYYY-MM-DD 12:00:00",
    "firm": "<dilovod_default_firm_id>",
    "cashAccount": "<каса з IBAN шапки або fallback>",
    "person": "",
    "currency": "1101200000001001",
    "content": "<призначення>",
    "presentation": "<призначення> від YYYY-MM-DD",
    "cashItem": "<catalogs.cashItems>",
    "amountCur": 100.00,
    "department": "1101900000000001",
    "business": "1115000000000001",
    "account": "1119000000001089",
    "corAccount": "<catalogs.accounts>",
    "settlementsKind": "<catalogs.settlementsKinds>",
    "taxAccount": 1,
    "author": "<dilovodUserId>",
    "remark": "Автоматично додано через Backoffice (виписка №…)"
  },
  "tableParts": {
    "tpAnalytics": [{ "rowNum": 1, "amountCur": 100.00 }]
  }
}
```

Dilovod блокує паралельні запити однієї сесії — експорт іде послідовно (`for`, не `Promise.all`). Помилка `{"error":"..."}` у відповіді не ковтається.

---

## API

Усі маршрути: `authenticateToken` + `page.accounting.bankStatements`. Файл до 10 МБ (`xlsx` / `xls` / `csv`).

| Метод | Шлях | Опис |
|---|---|---|
| `POST` | `/api/dilovod/bank-statement/preview` | Парсинг (`file` + опційно `mapping`) |
| `POST` | `/api/dilovod/bank-statement/export?dryRun=true` | Зібрати payload без відправки |
| `POST` | `/api/dilovod/bank-statement/export` | Відправка в Dilovod |
| `GET` | `/api/dilovod/bank-statement/templates` | Шаблони + `kindKeywords` + `inlineEditColumns` |
| `PUT` | `/api/dilovod/bank-statement/templates` | Upsert шаблону або patch extras |
| `POST` | `/api/dilovod/bank-statement/templates/active` | Активний шаблон `{ id }` |
| `DELETE` | `/api/dilovod/bank-statement/templates/:id` | Видалити (не вбудований) |

Довідники для UI: `GET /api/dilovod/directories` — додатково `settlementsKinds`, `cashItems`, `ledgerAccounts`.

`catalogs.cashItems` інколи закритий роллю API: тоді статті збираються з існуючих документів (унікальні id).

---

## Кеш і БД

Нові типи кешу Dilovod: `settlementsKinds`, `cashItems`, `ledgerAccounts` (`DilovodCacheService` / Settings Dilovod).

План рахунків (~300+ записів) не вміщається в `TEXT` (64 KB). Міграція:

`prisma/migrations/20260826120000_settings_base_value_longtext/` — `settings_base.value` → `LONGTEXT`.

Після деплою: `npx prisma migrate deploy`.

---

## Супутні UI-компоненти

- `Timeline` — кроки імпорту, пресети кольору + окремі metrics для моб/десктоп.
- `useTableSelection`, `RowContextMenu`, `IconActionButton` — вибір, ПКМ, іконки дій (як у каталозі).
- `DilovodDictAutocomplete` — пошук по довіднику (фільтр HeroUI, сортування uk).
