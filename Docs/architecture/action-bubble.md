# ActionBubble — плаваючі бульбашки для touch / compact UI

Спільні FAB-кнопки з виїжджаючою панеллю: фільтри, дерево каталогу, майбутні action-кнопки. Показуються на вузькому viewport або на пристроях з тач-екраном (планшет), поверх контенту, над мобільним таббаром.

## Файли

| Файл | Роль |
|------|------|
| `client/hooks/useTouchUi.ts` | `useTouchUi`, `useCompactViewport`, `useHasTouchScreen`; `useIsMobile` = compact |
| `client/hooks/use-mobile.tsx` | Реекспорт тих самих хуків |
| `client/components/action-bubble/ActionBubble.tsx` | Кнопка + панель |
| `client/components/action-bubble/ActionBubbleDock.tsx` | Група бульбашок, одна відкрита панель |
| `client/components/action-bubble/presets.ts` | Кольори, placement, ignore-close |
| `client/components/action-bubble/types.ts` | Пропси |
| `client/components/action-bubble/index.ts` | Публічний API |

## Коли показувати (`useTouchUi`)

`useTouchUi() === compact || hasTouchScreen`:

- **compact** — `max-width: 1023px` (як `MobileHeader` / `MobileTabBar`, `lg`).
- **hasTouchScreen** — `(any-pointer: coarse)`, без `ontouchstart` / `maxTouchPoints` (менше хибних спрацювань на Windows-ноутбуках).

Стартове значення з `matchMedia` одразу, без кадру `undefined` → `false`.

`useIsMobile()` — лише compact viewport (той самий поріг `lg`). Сайдбар / Layout цим хуком не керуються.

Видимість бульбашок **не** дублювати через `md:hidden`: широкий iPad інакше не побачить FAB.

На сторінці: якщо `useTouchUi` — ховати десктопний аналог (сайдбар-дерево, верхній filter bar) і рендерити dock. Інакше — інлайн UI.

## ActionBubbleDock

Фіксований контейнер у куті. За замовчуванням `placement="bottom-end"`, `visible` = `useTouchUi()`.

- Нижче `lg`: `bottom-22` (над таббаром).
- `lg+`: `bottom-6` (таббар схований).
- Кнопки в ряд (`flex-row-reverse` для `*-end`: перша зареєстрована — найближче до кута).
- Панель і кнопки в окремих слотах; бульбашки порталяться туди.
- Відкриття однієї закриває інші (`activeId`).

Пропси: `placement`, `offset` (`{ x, y }` → `translate`), `className`, `visible`.

## ActionBubble

Контрольовані `isOpen` / `onOpenChange`. Усередині dock `id` бажаний (інакше `useId()`). Без dock — сам `fixed` з тими ж дефолтами placement.

| Проп | Типово | Зміст |
|------|--------|--------|
| `id` | `useId()` | Обов’язковий для координації в dock |
| `icon` / `openIcon` | `openIcon = 'x'` | Імена `DynamicIcon` |
| `ariaLabel` | — | Кнопка; відкрито → «Закрити: …» |
| `title` / `header` / `hideHeader` | — | Шапка панелі |
| `colorPreset` | `'sky'` | `sky` \| `purple` \| `orange` \| `red` \| `lime` |
| `buttonClassName` / `panelClassName` / `panelBodyClassName` / `className` | — | Додаткові стилі |
| `panelWidth` | `min(20rem, calc(100vw - 1.5rem))` | CSS `width` панелі |
| `ignoreCloseSelector` | — | Додатково до дефолтних порталів HeroUI |
| `badge` | `false` | Кільце-індикатор на кнопці, коли панель закрита |
| `placement` / `offset` | `bottom-end` | Лише standalone (без dock) |

Закриття: Escape, pointerdown зовні. Не закриває, якщо клік у `[data-action-bubble-id]` цієї бульбашки або в `[role="dialog"|"listbox"|"menu"]`, `[data-slot="popover"|"calendar"]`. Календарі / селекти HeroUI рендеряться в портал — без цього панель закриється на виборі дати.

## Приклад

```tsx
const touchUi = useTouchUi();

{touchUi ? (
  <ActionBubbleDock>
    <ActionBubble
      id="filters"
      colorPreset="orange"
      icon="filter"
      title="Фільтри"
      ariaLabel="Фільтри"
      isOpen={open}
      onOpenChange={setOpen}
      badge={!filtersAreDefault}
    >
      <FilterBar />
    </ActionBubble>
  </ActionBubbleDock>
) : (
  <FilterBar />
)}
```

Кілька бульбашок — діти одного `ActionBubbleDock`.

## Де вже стоїть

- **`/products`** — `id="catalog"`, `sky`, дерево замість aside; `ignoreCloseSelector` для контекстного меню каталогу.
- **`/warehouse/movement-mob`** — `id="filters"`, `orange`, `MovementMobFilterBar`; badge якщо період не «Останні 7 днів».
