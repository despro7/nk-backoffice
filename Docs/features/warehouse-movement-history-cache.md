# Кешування деталей та фільтри в Історії переміщень

## Загальна схема

```
GET /history  →  Діловод (список)  →  persist нових в БД  →  збагатити details з БД  →  клієнт
GET /details/:id  →  БД (items)?  →  якщо є: fromCache=true  →  якщо нема: Діловод + persist
```

---

## 1. Список документів (`GET /history`)

### Параметри
| Param | Тип | Опис |
|-------|-----|------|
| `fromDate` | string | ISO datetime, обов'язковий |
| `toDate` | string | ISO datetime, опціональний |
| `storageId` | string | ID складу-донора |
| `storageToId` | string | ID складу-реципієнта |

### Логіка сервера (`MovementHistoryService.getMovementHistory`)
1. Запит до Діловода з фільтрами `date > fromDate` (+ `date < toDate` якщо є)
2. **`persistDocumentsToDB`** — `findMany` по `dilovodDocId` → `create` тільки нових (існуючі пропускаються, щоб не затерти `items`)
3. **Збагачення** — одним `findMany` дістає `items` для всіх повернених документів → вкладає `details` у відповідь

### Результат
Документи що вже мали збережені `items` в БД — повертаються одразу з `details` без додаткових запитів.

---

## 2. Деталі документа (`GET /details/:id`)

### Логіка
- Без `?force=true`: перевіряє `warehouse_movement.items` → якщо непорожній масив → повертає з `fromCache: true`
- З `?force=true` (або кеш порожній): іде в Діловод → `getObject` → зберігає `tpGoods` в `items`

### Формат збереженого `items` (JSON)
```json
[
  {
    "sku": "ABC-123",
    "productName": "Назва товару",
    "batchNumber": "П-001",
    "batchId": "1100...",
    "batchStorage": "шт",
    "portionQuantity": 10
  }
]
```

---

## 3. Кнопка "Оновити деталі"

- Доступна **всім ролям** (на відміну від "Редагувати накладну" — тільки адмін)
- Викликає `refreshDetails(docId)` → `fetchDetails(id, force=true)`
- Показує `isLoading` поки запит виконується

---

## 4. Пресети дат (клієнт)

Стан у `useMovementHistory`: `datePreset: '7d' | '14d' | '30d' | 'month'` (дефолт `'7d'`)

| Пресет | fromDate | toDate |
|--------|----------|--------|
| `7d` | сьогодні − 7 днів | — |
| `14d` | сьогодні − 14 днів | — |
| `30d` | сьогодні − 30 днів | — |
| `month` | перший день місяця | останній день місяця |

При `'month'` — відображається `MonthSwitcher` для навігації по місяцях.

---

## 5. MonthSwitcher (`client/components/MonthSwitcher.tsx`)

Shared компонент, використовується в `MovementHistoryTab` та може бути повторно використаний будь-де.

```tsx
<MonthSwitcher
  value={selectedMonth}   // Date
  onChange={setMonth}     // (Date) => void
  disableFuture           // блокує → і приховує майбутні місяці в Select
  size="sm"
/>
```

Props: `value`, `onChange`, `disableFuture` (default: `true`), `size` (`'sm'|'md'|'lg'`).
