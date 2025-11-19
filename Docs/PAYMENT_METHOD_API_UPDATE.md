# Оновлення: Динамічне завантаження методів оплати з SalesDrive API

## Що змінено

### 1. Backend (`salesDriveService.ts`)
✅ Додано метод `fetchPaymentMethods()`:
- Запит до SalesDrive API `/api/payment-methods/`
- Кешування результату на 1 годину
- Fallback до хардкодженого списку при помилці

### 2. API Endpoint (`server/routes/dilovod.ts`)
✅ Додано `GET /api/dilovod/salesdrive/payment-methods`:
- Викликає `salesDriveService.fetchPaymentMethods()`
- Повертає `{success: true, data: [{id: number, name: string}]}`

### 3. Тип даних (`shared/types/dilovod.ts`)
✅ Оновлено `DilovodChannelMapping`:
```typescript
salesDrivePaymentMethod?: number;  // Було: string, Стало: number
```

### 4. Frontend (`DilovodSettingsManager.tsx`)
✅ Видалено константу `SALESDRIVE_PAYMENT_METHODS`
✅ Додано динамічне завантаження методів оплати:
- `fetchPaymentMethods()` - завантаження з API
- `paymentMethods` state - зберігання списку
- Автоматичне завантаження при монтуванні компонента

✅ Оновлено селектор методів оплати:
- Використання `method.id` (number) замість `method.name` (string)
- Валідація дублікатів за числовим ID
- Відображення назви методу за ID у підказці

### 5. Export Builder (`DilovodExportBuilder.ts`)
✅ Оновлено `getChannelMapping()`:
- Витягування `payment_method` з `rawData` (число)
- Порівняння `m.salesDrivePaymentMethod === paymentMethodId` (number === number)
- Детальні попередження з ID методу оплати

### 6. Документація
✅ Оновлено `Docs/PAYMENT_METHOD_MAPPING.md`:
- Додано секцію про динамічне завантаження
- Оновлено приклади з числовими ID
- Оновлено відомі обмеження

## Як це працює

### Крок 1: Завантаження методів оплати з SalesDrive

```
Frontend (DilovodSettingsManager)
    ↓ fetch('/api/dilovod/salesdrive/payment-methods')
Backend (dilovod.ts route)
    ↓ salesDriveService.fetchPaymentMethods()
SalesDrive API
    ↓ GET /api/payment-methods/
    ↓ Response: {status: 'success', data: [{id: 14, name: 'Plata by Mono'}, ...]}
Backend Cache (1 година TTL)
    ↓
Frontend (setPaymentMethods)
```

### Крок 2: Налаштування мапінгу

Користувач обирає:
1. **Канал продажів**: "nk-food.shop" (ID: "1")
2. **Метод оплати SalesDrive**: "LiqPay" (ID: 13) ← **Числовий ID!**
3. **Форма оплати Dilovod**: "Безготівка"
4. **Рахунок Dilovod**: "Monobank"

Зберігається в БД:
```json
{
  "channelPaymentMapping": {
    "1": {
      "channelId": "1",
      "mappings": [
        {
          "id": "mapping_123",
          "channelId": "1",
          "salesDrivePaymentMethod": 13,  // ← Числовий ID!
          "paymentForm": "bezgotivka",
          "cashAccount": "monobank_id"
        }
      ]
    }
  }
}
```

### Крок 3: Експорт замовлення

```
Order в БД:
  sajt: "1"
  rawData: {payment_method: 13, ...}

DilovodExportBuilder.getChannelMapping():
  1. channelId = order.sajt = "1"
  2. paymentMethodId = order.rawData.payment_method = 13
  3. mapping = mappings.find(m => m.salesDrivePaymentMethod === 13)
  4. return {paymentForm: "bezgotivka", cashAccount: "monobank_id"}

DilovodExportBuilder.determineFirmId():
  1. cashAccount = "monobank_id"
  2. owner = directories.cashAccounts.find(acc => acc.id === "monobank_id").owner
  3. return owner (firmId)
```

## Переваги нового підходу

1. ✅ **Актуальність**: Методи оплати завантажуються з SalesDrive API, завжди актуальні
2. ✅ **Точність**: Використання числових ID замість текстових назв - немає проблем з локалізацією
3. ✅ **Продуктивність**: Кешування на 1 годину зменшує навантаження на API
4. ✅ **Надійність**: Fallback до хардкодженого списку при недоступності API
5. ✅ **Масштабованість**: Нові методи оплати автоматично з'являються у списку (після очищення кешу)

## Тестування

### 1. Перевірити завантаження методів оплати
```bash
# Запустити dev server
npm run dev

# Відкрити Налаштування → Dilovod
# Перевірити, що список методів оплати завантажився
```

### 2. Налаштувати мапінг
- Додати канал "nk-food.shop"
- Додати мапінг з методом "LiqPay" (ID: 13)
- Обрати форму оплати та рахунок
- Зберегти

### 3. Експортувати замовлення
```powershell
# Знайти замовлення з payment_method = 13
.\scripts\test-export.ps1 <orderNumber>

# Перевірити payload:
# - warnings не містить "Мапінг методу оплати не знайдено"
# - header.paymentForm відповідає мапінгу
# - header.cashAccount відповідає мапінгу
# - header.firm визначено за власником рахунку
```

## Міграція існуючих налаштувань

⚠️ **Увага**: Існуючі мапінги з **текстовими** `salesDrivePaymentMethod` потрібно оновити вручну!

**Було**:
```json
{"salesDrivePaymentMethod": "LiqPay"}
```

**Стало**:
```json
{"salesDrivePaymentMethod": 13}
```

Щоб не втратити налаштування, відкрийте кожен мапінг та оберіть метод оплати зі списку заново.

## Версія

- **Дата**: 2025-01-17
- **Автор**: GitHub Copilot
- **Версія документації**: 2.0.0
