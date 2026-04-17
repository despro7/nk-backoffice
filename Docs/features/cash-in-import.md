# Cash-In Import — Імпорт реєстру переказів (Надходження грошей)

## Призначення

Сторінка `/cash-in-import` дозволяє завантажити Excel-реєстр переказів від НП та вивантажити документи **"Надходження грошей" (`documents.cashIn`)** у Діловод.

---

## Архітектура

```
FileUploadZone         → POST /api/dilovod/cash-in/preview
CashInPreviewTable     ← відображення результатів з inline-редагуванням
CashInSummary          → POST /api/dilovod/cash-in/export
```

**Сервіси:**
- `CashInImportService` — парсинг Excel + валідація проти БД
- `CashInExportBuilder` — побудова payload + послідовна відправка в Díловод

---

## Статуси рядків

| Статус | Колір | Опис |
|---|---|---|
| `ok` | 🟢 зелений | Замовлення знайдено, сума збігається — готово до відправки |
| `amount_mismatch` | 🟡 жовтий | Сума в файлі не збігається з БД |
| `ambiguous` | 🟡 жовтий | Знайдено кілька замовлень для цього покупця |
| `not_found` | 🔴 червоний | Замовлення не знайдено в БД |
| `duplicate_cash_in` | 🟡 жовтий | Для замовлення вже є документ cashIn (`dilovodCashInDate` заповнено в БД) |

---

## Обробка дублікатів

Якщо поле `dilovodCashInDate` в таблиці `orders` заповнене — рядок отримує статус `duplicate_cash_in`.

**Поведінка за замовчуванням:** рядок-дублікат **пропускається** (не відправляється).

**Ручний дозвіл:** менеджер може увімкнути тогл "Все одно відправити" безпосередньо в таблиці preview. Після цього рядок включається до відправки.

---

## Важливо: паралельність запитів до Díловод

Díловод блокує паралельні запити однієї сесії (`multithreadApiSession blocked`).

- **Пошук контрагентів** (`findPersonByPhone`) та **відправка документів** (`exportToDilovod`) виконуються **послідовно** через `for`-цикл, а не `Promise.all`.
- При помилці `{"error":"..."}` у відповіді від API — кидається виключення (не тиха помилка з `undefined`).

---

## Payload структура (documents.cashIn)

```json
{
  "saveType": 1,
  "header": {
    "id": "documents.cashIn",
    "date": "YYYY-MM-DD 12:00:00",
    "baseDoc": "<dilovodDocId замовлення>",
    "firm": "<ID фірми>",
    "cashAccount": "<ID каси з channelPaymentMapping>",
    "person": "<ID контрагента з catalogs.persons>",
    "currency": "1101200000001001",
    "amountCur": 500.00,
    "amountCurCommission": 25.00,
    "author": "<dilovodUserId користувача>"
  },
  "tableParts": {
    "tpAnalytics": [{
      "rowNum": 1,
      "analytics1": "<dilovodDocId>",
      "amountCur": 500.00,
      "amountCurCommission": 25.00
    }]
  }
}
```

> `tpAnalytics` обов'язковий — Díловод бере суму саме звідти.

---

## Після успішної відправки

1. `dilovodCashInDate` у таблиці `orders` → `NOW()`
2. Статус замовлення в Díловод → `STATE_DONE` (`1111500000001010`) через повторний `saveObject`
