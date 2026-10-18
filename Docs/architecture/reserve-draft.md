# Reserve draft — локальний резерв документа

## Призначення

Окремий від офіційного збереження механізм: на кожну зміну в редакторі пише JSON-знімок у `localStorage` цього браузера. Серверну чернетку не чіпає.

Після звичайного виходу або аварійного закриття вкладки документ відкривається з останнього офіційного збереження. Якщо резерв від нього відрізняється, між шапкою редактора і вмістом показується пропозиція продовжити з місця, де зупинились.

`useUnsavedGuard` при цьому не попереджає про незбережені зміни: дані вже лежать у резерві.

Реалізований як пара: **хук** + **банер**. Доменний знімок (що саме серіалізувати) лишається в документі, який підключає хук.

---

## Файли

| Файл | Опис |
|------|------|
| `client/components/reserve-draft/useReserveDraft.ts` | Хук: запис, порівняння з baseline, offer |
| `client/components/reserve-draft/reserveDraftStorage.ts` | `localStorage`, ключ `reserve-draft:v1:<documentKey>` |
| `client/components/reserve-draft/ReserveDraftBanner.tsx` | Банер «Є резервна копія змін» |
| `client/components/reserve-draft/index.ts` | Публічний експорт |

Інвентаризація: `client/pages/Warehouse/WarehouseInventory/inventoryReserveDraft.ts` збирає знімок позицій, коментаря і дати.

---

## Як підключити

### 1. Знімок і baseline

`value` і `baseline` мають бути JSON-серіалізованими і стабільними між рендерами (`useMemo` / `useState`). Однаковий вміст → `JSON.stringify` збігається.

- `baseline` — останнє офіційне збереження або стан одразу після завантаження. `null`, поки редактор не готовий (запис заблоковано).
- `value` — поточний редактор.
- `documentKey` — стабільний ключ документа, напр. `warehouse-inventory:172`. `null` вимикає резерв.
- `placeLabel` / `placeAnchor` — підпис і якір місця. У порівняння з baseline не входять; якір інтерпретує сам документ.

### 2. Хук

```tsx
import { ReserveDraftBanner, useReserveDraft } from '@/components/reserve-draft';

const reserve = useReserveDraft({
  documentKey: sessionId != null ? `my-doc:${sessionId}` : null,
  value: currentSnapshot,
  baseline: officialSnapshot,
  enabled: isEditing,
  placeLabel: lastRowName,
  placeAnchor: lastRowId,
});
```

Поки `offer` відкритий, нові записи не перетирають резерв на диску.

### 3. Банер

```tsx
{reserve.offer && (
  <ReserveDraftBanner
    savedAt={reserve.offer.savedAt}
    placeLabel={reserve.offer.placeLabel}
    onContinue={() => {
      applySnapshot(reserve.offer.data);
      if (reserve.offer.placeAnchor) scrollTo(reserve.offer.placeAnchor);
      reserve.acceptOffer();
    }}
    onDismiss={reserve.dismissOffer}
  />
)}
```

`acceptOffer()` викликати після того, як документ застосував `offer.data`. Інакше хук знову почне писати офіційний стан поверх резерва.

### 4. Коли прибирати резерв

`clearReserve()` після успішного офіційного збереження, завершення документа або явного скасування («закрити без збереження», видалити чернетку). Інакше наступне відкриття знову запропонує вже зафіксовані або свідомо відкинуті правки.

Навігацію з брудним редактором не треба блокувати: резерв дописується на `pagehide` і при розмонтуванні.

```tsx
const guard = useUnsavedGuard({
  isDirty: false,
  onSaveDraft: handleSaveDraft,
});
```

---

## API

### `useReserveDraft(options)`

| Параметр | Тип | Опис |
|----------|-----|------|
| `documentKey` | `string \| null` | Ключ документа в `localStorage` |
| `value` | `T` | Поточний знімок |
| `baseline` | `T \| null` | Офіційне збереження. `null` — не писати |
| `enabled` | `boolean` | Редактор активний |
| `placeLabel` | `string \| null` | Текст «зупинились на …» |
| `placeAnchor` | `string \| null` | Якір для скролу після «Продовжити» |

Повертає `{ offer, acceptOffer, dismissOffer, clearReserve }`.

`offer` — `{ savedAt, data, placeLabel, placeAnchor }`, якщо резерв відрізняється від `baseline`. Інакше `null`.

Запис із затримкою 200 мс. Однаковий з baseline знімок видаляє ключ. Помилка `localStorage` (квота, заборона) редагування не зупиняє.

### `<ReserveDraftBanner>`

| Prop | За замовчуванням |
|------|------------------|
| `savedAt` | — |
| `placeLabel` | — |
| `onContinue` | — |
| `onDismiss` | — |
| `continueText` | `Продовжити` |
| `dismissText` | `Лишити збережене` |

---

## Інвентаризація

| | |
|--|--|
| Ключ із id | `warehouse-inventory:<sessionId>` |
| Ключ до першого збереження | `warehouse-inventory:new:small` або `:new:gp` |
| Знімок | коментар, `sessionDate`, факт і `checked` по комплектах, товарах і матеріалах |
| Якір | `set\|product\|material:<id>` останнього відкритого рядка |
| Банер | між прогресом і першим `InventoryProductList` |
| `clearReserve` | збереження чернетки, завершення, скасування, «Закрити без збереження» |

Офіційна чернетка як і раніше йде через `POST/PUT /api/warehouse/inventory/draft`. Резерв її не замінює і на інший браузер не переїжджає.
