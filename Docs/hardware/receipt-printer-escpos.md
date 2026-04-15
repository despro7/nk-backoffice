# 🧾 Друк чеків на термопринтері через QZ Tray (ESC/POS)

Документ описує реалізацію друку складських чек-листів і фіскальних чеків
на 58мм термопринтері (Xprinter X58) через QZ Tray.

---

## Архітектура

```
OrdersTable / OrderViewHeader
        │
        ▼
ReceiptClientService          ← client/services/ReceiptService.ts
        │
        ├── generateWarehouseChecklistEscPos()   ─┐
        └── generateFiscalReceiptEscPos()         ─┤  client/lib/receiptTemplates.ts
                                                   │
                                                   ▼
                                          PrinterService.printRaw()
                                                   │
                                                   ▼
                                              QZ Tray → Xprinter X58
```

**Якщо принтер не налаштований** — замість ESC/POS друку відкривається HTML-версія
чека у новій вкладці браузера (через `window.open()`).

---

## Задіяні файли

| Файл | Роль |
|------|------|
| `client/services/printerService.ts` | QZ Tray інтеграція: `printRaw()`, `printPdf()`, `printZpl()` |
| `client/services/ReceiptService.ts` | Координатор: генерує ESC/POS, викликає `PrinterService` |
| `client/lib/receiptTemplates.ts` | Шаблони: ESC/POS і HTML версії чеків |
| `client/components/OrdersTable.tsx` | Кнопка "Чек" у таблиці замовлень |
| `client/pages/SettingsEquipment.tsx` | UI налаштувань принтера чеків |
| `server/routes/receipt.ts` | API для генерації PDF чека |

---

## Налаштування принтера (UI)

Розділ **"Принтер чеків (QZ Tray)"** у сторінці `Налаштування → Обладнання`:

| Поле | Опис |
|------|------|
| Увімкнути | Вмикає/вимикає ESC/POS друк (якщо вимкнено — відкривається HTML) |
| Назва принтера | Повна назва як у Windows/Linux (напр. `XPRINTER X58`) |
| Ширина паперу | Завжди `58` мм |
| Щільність | `2` — рекомендована для Xprinter X58 |
| Кнопка "Тест" | Друкує тестовий рядок `=== ТЕСТ ПРИНТЕРА ===` |

Налаштування зберігаються у `users.equipment` (JSON, per-user).

---

## Типи чеків

### 1. Складський чек-ліст (`generateWarehouseChecklistEscPos`)

Використовується в таблиці замовлень (кнопка "Чек"):
- Заголовок: `СКЛАДСЬКИЙ ЧЕК-ЛІСТ`
- Номер замовлення, дата/час, ТТН, ім'я клієнта
- Список товарів з кількостями (тільки `type === 'product'`, без коробок)
- Склад монолітних комплектів
- Підсумок: кількість позицій і одиниць
- Автообрізка (`GS V A 00`)

**Важливо:** перед друком набори (`expandProductSets`) розкладаються по компонентах.

### 2. Фіскальний чек (`generateFiscalReceiptEscPos`)

Використовується в деталях замовлення (Dilovod JSON):
- Шапка: назва ФОП, адреса, ІД, номер РРО
- Список товарів з кількістю і ціною
- Підсумок, спосіб оплати
- QR-код для перевірки в ДПС (`https://cabinet.tax.gov.ua/cashregs/check?...`)
- Автообрізка

---

## ESC/POS + CP866 кодування

Термопринтери очікують кириличний текст у **кодуванні CP866** (не UTF-8).

### Підхід

1. ESC/POS рядок (Unicode JavaScript string) → `PrinterService.escPosToBytes()` → `number[]`
2. Байти < 0x80 передаються як є (ASCII + бінарні ESC/POS команди)
3. Кириличні символи (U+0410–U+044F та ін.) → перекодуються через статичну таблицю `UNICODE_TO_CP866`
4. `number[]` → HEX рядок → QZ Tray як `{ type: 'raw', format: 'hex', data: hexString }`

### Команда вибору кодової сторінки

На початку кожного чека (після `ESC @` reset):
```
ESC t 0x11   ← вибір CP866 (code page 17)
```

### Чому `format:'hex'`

QZ Tray підтримує кілька форматів для raw-даних, але поводяться по-різному:

| Формат | Поведінка | Результат |
|--------|-----------|-----------|
| `format:'plain'` зі строкою | Перекодує через системне Windows кодування (CP1251) | ❌ Ламає CP866 кирилицю |
| `format:'base64'` | Перекодує через системне Windows кодування (CP1251) | ❌ Ламає CP866 кирилицю |
| `format:'hex'` ✅ | Передає байти 1:1 без жодного перекодування | ✅ CP866 доходить точно |

> **Висновок:** QZ Tray **ігнорує** параметр `encoding` в `qz.configs.create()` для принтерів
> і завжди застосовує системне кодування Windows при передачі plain/base64 рядків.
> `format:'hex'` — єдиний спосіб гарантованої побайтової передачі ESC/POS.

### Таблиця CP866 (скорочено)

| Unicode діапазон | Символи | CP866 байти |
|-----------------|---------|-------------|
| U+0410–U+042F | А–Я | 0x80–0x9F |
| U+0430–U+043F | а–п | 0xA0–0xAF |
| U+0440–U+044F | р–я | 0xE0–0xEF |
| U+0401 / U+0451 | Ё / ё | 0xF0 / 0xF1 |
| U+0406 / U+0456 | І / і | 0x49 / 0x69 (→ латинська I/i) |
| U+0407 / U+0457 | Ї / ї | 0x9F / 0xEF (→ Я / я) |
| U+0404 / U+0454 | Є / є | 0x85 / 0xA5 (→ Е / е) |
| U+0490 / U+0491 | Ґ / ґ | 0x83 / 0xA3 (→ Г / г) |

> Xprinter X58 використовує CP866, тому деякі унікальні українські літери (Ї, Є, Ґ) замінюються на найближчі аналоги.

---

## Код: `PrinterService.printRaw()`

```typescript
public async printRaw(printerName: string, data: string): Promise<boolean> {
  const bytes = this.escPosToBytes(data); // Unicode → CP866 number[]

  // format:'hex' — байти передаються на принтер 1:1 без перекодування QZ Tray.
  // plain/base64 ламають кирилицю через системне CP1251 на Windows.
  const hexData = bytes.map(b => b.toString(16).padStart(2, '0')).join('');

  const config = qz.configs.create(printerName);
  const printData = [{ type: 'raw', format: 'hex', data: hexData }];
  await qz.print(config, printData);
}
```

---

## Діагностика

У `SettingsEquipment.tsx` є тимчасовий блок **«🧪 Діагностика QZ Tray»** з кнопками
для тестування різних форматів передачі (тести 1–4 до принтера, тест 6 до TCP listener).

Для запуску TCP listener (емулятор принтера, показує HEX дамп отриманих байтів):
```bash
node scripts/escpos-tcp-listener.js
```
Після чого вказати принтер `{ host: '127.0.0.1', port: 9100 }` в тесті 6.

**Очікувані CP866 байти для "Тест":** `92 a5 e1 e2` (не `d2 e5 f1 f2` — це CP1251).

---

## Відомі обмеження

- **Xprinter X58** підтримує CP866 (DOS Cyrillic), але **не підтримує** CP1251 (Windows Cyrillic) і UTF-8
- **Ї, Є, Ґ** відображаються як замінники (Я/Е/Г) — CP866 не має цих літер
- **QR-код** в фіскальному чеку: якщо принтер не підтримує `GS ( k` — ігнорує команду без помилки
- **Ширина рядка**: 32 символи для 58мм рулону при стандартному шрифті

---

## Пов'язані файли та документи

- [`Docs/hardware/qz-tray-setup.md`](./qz-tray-setup.md) — загальне налаштування QZ Tray + сертифікати
- `client/services/printerService.ts` — повний код `PrinterService`
- `client/lib/receiptTemplates.ts` — всі ESC/POS і HTML шаблони
- `client/services/ReceiptService.ts` — `ReceiptClientService`
