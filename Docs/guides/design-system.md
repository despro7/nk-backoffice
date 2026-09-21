# Дизайн-система nova-field — гайд для розробки та агента

Жива вітрина: **`/settings/design`** (`client/pages/DesignSystem.tsx`).

Правило Cursor (завжди активне): `.cursor/rules/design-system.mdc` — стислі патерни та anti-patterns. Цей документ — **карта файлів і інструкція «що редагувати»**.

---

## Карта файлів

| Що змінюємо | Файл(и) | Примітка |
|-------------|---------|----------|
| **Кольори, тіні, radius, глобальні CSS-токени** | `client/global.css` → блок `@theme` | Синхронізувати з `client/hero.ts`, якщо це HeroUI semantic color |
| **HeroUI theme (primary, success, warning…)** | `client/hero.ts` | `@plugin "./hero.ts"` у `global.css`; primary = сірий #374151 |
| **Глобальні override кнопок** (padding, text color, opt-in tones) | `client/global.css` → `@layer components` | Див. коментарі біля `data-btn-tone`, `bg-secondary/20`, тощо |
| **className-токени кнопок** (`BTN_*`) | `client/lib/buttonStyles.ts` | Експорт констант; id для copy: `design:btn-*` |
| **Вітрина патернів** (таблиці, chips, drawer, кнопки 3×3) | `client/components/DesignSystemPatterns.tsx` | `ETALON_BUTTON_PATTERNS`, `ButtonShowcase`, `ButtonPatternGrid` |
| **Вітрина токенів** (палітри, spacing, shadows) | `client/components/DesignSystemDemo.tsx` | Кольори дублюються вручну — оновити при зміні `@theme` |
| **Сторінка вітрини** | `client/pages/DesignSystem.tsx` | Layout; Patterns зверху, Demo (токени) знизу |
| **Маршрут** | `client/routes.config.tsx` | `/settings/design` |
| **Chips, hue maps** | `client/components/SpecChip.tsx`, `client/pages/Hr/hrUi.tsx` | `specColorPalette` |
| **Action bubble presets** | `client/components/action-bubble/presets.ts` | FAB / mobile |
| **Еталонні UI в продукті** | Див. таблицю reference у `design-system.mdc` | HR Employees, Products Catalog, ProductDrawer… |

---

## Алгоритм для агента

1. Відкрити `/settings/design` (або прочитати `DesignSystemPatterns.tsx`) — знайти відповідну секцію.
2. Визначити тип зміни за таблицею нижче → відредагувати **мінімальний набір файлів**.
3. Якщо зміна **глобальна** (усі кнопки / усі Chip) → `global.css` + `hero.ts`.
4. Якщо зміна **лише вітрина** → `DesignSystemPatterns.tsx`.
5. Якщо новий **className-токен** → `buttonStyles.ts` + запис у `ETALON_BUTTON_PATTERNS` + вітрина.
6. Після зміни токенів/патернів — оновити вітрину й перевірити lints на змінених файлах.

---

## Кнопки — детально

### Де що живе

```
client/lib/buttonStyles.ts     — BTN_PRIMARY_BLUE, BTN_GLOW_*, BTN_VIVID_*
client/global.css @theme       — --color-*, --shadow-button-*
client/global.css @layer components — глобальні override HeroUI Button
client/hero.ts                 — success/warning/primary scales для HeroUI
client/components/DesignSystemPatterns.tsx
  ├── ETALON_BUTTON_PATTERNS   — 16 etalon-карток (конфіг, не JSX вручну)
  ├── ButtonPatternGrid        — сітка 3×3: lg/md/sm × plain / icon / shadow
  ├── buildButtonSnippet()     — JSX для clipboard при кліку на кнопку
  └── ButtonShowcase           — copy у header → design:btn-{id}
```

### Вітрина 3×3 (etalon)

Кожен etalon-`ButtonShowcase` з `pattern={...}`:

| Ряд | Зміст |
|-----|--------|
| 1 | lg · md · sm — без іконок |
| 2 | lg · md · sm — `startContent` + іконка `plus` |
| 3 | lg · md · sm — іконка + shadow-клас |

- Підпис на всіх demo-кнопках: **«Дія»**.
- **Клік на кнопку** → однорядковий JSX у clipboard (`buildButtonSnippet`).
- **Copy у заголовку картки** → `design:btn-{id}` для агента.

### Додати новий etalon-патерн кнопки

1. Додати об'єкт у `ETALON_BUTTON_PATTERNS` у `DesignSystemPatterns.tsx`:
   - `id`, `label`, `hint`, `snippet`, `pattern` (`ButtonPatternConfig`).
2. Якщо потрібен новий `BTN_*` — додати в `buttonStyles.ts` і імпорт у `DesignSystemPatterns.tsx`.
3. Якщо потрібен shadow — `shadow-button-*` з `@theme` у `global.css` або `BTN_GLOW_*`.
4. Якщо потрібен глобальний колір тексту / padding — `@layer components` у `global.css`.

### Доменні / інтерактивні (без 3×3)

Залишати `children` у `ButtonShowcase` без `pattern`:

- `btn-loading-icon`, `btn-row-actions`, `btn-products-gradient`, `btn-action-bubble`
- Секція **anti-patterns** — окремий блок, не чіпати без запиту.

### Глобальні override кнопок (поточний стан)

| Селектор / умова | Ефект |
|------------------|--------|
| `button[data-btn-tone='primary-blue-flat']` | `bg-blue-100`, `text-blue-700` |
| `button.bg-secondary/20` | `text-neutral-700` (secondary flat) |
| `button.bg-success.text-success-foreground` | `text-white` (success solid) |
| `button.bg-warning.text-warning-foreground` | `text-white` (warning solid) |
| `button.min-w-16/20/24` (не icon-only) | `px-4`, `gap-1.5` |

**Не робити** global override для `color="primary" variant="flat"` — конфліктує з кастомними className.

### Shadow на 3-му рядку (мапінг)

| Патерн | shadow |
|--------|--------|
| primary, secondary, light, bordered | `BTN_GLOW_PRIMARY` |
| primary-blue * | `shadow-button-blue` |
| vivid success, success * | `BTN_GLOW_SUCCESS` |
| vivid warning, warning * | `shadow-button-orange` |
| danger * | `BTN_GLOW_DANGER` |

---

## Кольори та токени

| Задача | Де редагувати |
|--------|----------------|
| Новий колір у Tailwind | `client/global.css` → `@theme` → `--color-*` |
| HeroUI semantic (success, warning…) | `global.css` `@theme` **і** `client/hero.ts` `themes.light/dark.colors` |
| Тіні кнопок | `global.css` → `--shadow-button-*` |
| Палітра на вітрині «Токени» | `DesignSystemDemo.tsx` (об'єкт `colors` — вручну) |

Primary = **neutral grey** `#374151`, не Tailwind blue. Повна шкала `primary-50…900` у `global.css` і `hero.ts`.

---

## Інші патерни на вітрині

| Секція | Еталон у коді | Файл вітрини |
|--------|---------------|--------------|
| Таблиці sortable | `Hr/Employees/index.tsx` | `DemoSortableTable` у `DesignSystemPatterns.tsx` |
| SpecChip | `SpecChip.tsx`, `hrUi.tsx` | Секція SpecChip |
| Drawer | `ProductDrawer.tsx`, `EmployeeDrawer.tsx` | `ProductDrawerDemo` |
| Токени (кольори, spacing) | `global.css` | `DesignSystemDemo.tsx` |

---

## Copy id для агента

Формат: `design:btn-{id}` — відповідає `id` у `ButtonShowcase` / `ETALON_BUTTON_PATTERNS`.

Приклади: `design:btn-primary-solid`, `design:btn-row-actions`, `design:btn-anti-loading`.

---

## Чеклист після змін

- [ ] Вітрина `/settings/design` відображає зміни
- [ ] Якщо змінено `@theme` — перевірити `hero.ts` (і навпаки)
- [ ] Якщо новий `BTN_*` — коментар у `buttonStyles.ts` + запис у `ETALON_BUTTON_PATTERNS` (за потреби)
- [ ] `ReadLints` / `tsc` на змінених файлах
- [ ] `Docs/CHANGELOG.md` — **лише за явним запитом** користувача
