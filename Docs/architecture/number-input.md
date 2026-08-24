# NumberInput — десяткове поле з комою

Спільний HeroUI-інпут для чисел в українській локалі: під час набору крапка стає комою, один роздільник, обмеження знаків після коми. `type="text"` + `inputMode="decimal"|"numeric"`, щоб не було нативного spinner і зміни значення колесом.

## Файли

| Файл | Роль |
|------|------|
| `client/lib/numberInput.ts` | `sanitizeNumberInput`, `parseNumberInput`, `formatNumberInput`, `formatNumberInputFromRaw` |
| `client/lib/numberInput.spec.ts` | vitest |
| `client/components/NumberInput.tsx` | `NumberInput` (рядок) і `NumberInputFromNumber` (`number`) |

## Коли що брати

- **`NumberInput`** — стейт уже рядок (форма, проміжний набір `1,`). Контроль: `value` + `onValueChange`.
- **`NumberInputFromNumber`** — стейт `number` (ряд специфікації, ціна). Всередині чернетка рядка; назовні `onChange(number)` лише коли рядок парситься.

`min` / `max` не ріжуть під час набору — кламп і нормалізація на **blur**.

## Пропси (крім HeroUI Input)

| Проп | Типово | Зміст |
|------|--------|--------|
| `decimalSeparator` | `','` | І `.`, і `,` зводяться до нього |
| `decimalPlaces` | `2` | `0` = ціле (дробова частина відкидається) |
| `min` / `max` / `step` | — | Кламп на blur; `step` як HTML-атрибут |
| `disableMouseWheel` | `true` | `preventDefault` на wheel, без `blur()` |
| `selectZeroOnFocus` | `true` | Якщо значення `0` — `select()` |
| `formatOnBlur` | `true` | Нормалізація рядка |
| `emptyOnBlur` | `'keep'` | `'min'` — порожнє → `min` (наприклад «Розрахунок на») |
| `trimTrailingZeros` | `false` / у FromNumber `true` | `1,200` → `1,2` |
| `allowNegative` | з `min < 0` | Інакше мінус викидається |

`label`, `labelPlacement`, `isClearable`, `classNames` — як у HeroUI `Input`.

## Приклад

```tsx
<NumberInput
  label="Вага, кг"
  value={form.weight}
  onValueChange={(v) => setForm((f) => ({ ...f, weight: v }))}
  decimalPlaces={3}
  min={0}
  isClearable
/>

<NumberInputFromNumber
  aria-label="Кількість"
  value={row.qty}
  onChange={(qty) => updateQty(qty)}
  decimalPlaces={3}
  min={0}
/>
```

Парсинг у payload: `parseNumberInput(form.weight)` → `number | null` (кома → крапка).

## ProductDrawer

| Поле | Компонент |
|------|-----------|
| Порцій у коробці | `NumberInput`, integer, `min={1}` |
| Вага, кг | `NumberInput`, 3 знаки, clearable |
| `unitRatio` (Admin) | `NumberInput`, 3 знаки |
| Розрахунок на, шт. | `NumberInput`, integer, `emptyOnBlur="min"` |
| Qty специфікації (продукція) | `NumberInputFromNumber` |
| Qty комплекту | `StepperInput` (± порції) |
| Ціна | `NumberInputFromNumber`, 2 знаки |

Не підміняти `StepperInput` на `NumberInput`: інший UX (кнопки ±, ціле).
