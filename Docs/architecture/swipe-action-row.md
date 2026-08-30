# SwipeActionRow

Спільний рядок зі swipe-to-action (iOS) і tap-панеллю (Android / інше). Живе в `client/components/motion/swipe-action-row.tsx`.

Мобільні переміщення — перший споживач (`MovementMobDocumentScreen`). Інші списки можуть підключити той самий API.

---

## Платформи

`usesIosSwipeGestures()` (`client/lib/touch.ts`):

- `iPhone` / `iPod` / `iPad` у UA, або
- iPadOS desktop UA: `MacIntel` + `maxTouchPoints > 1`.

| Платформа | UI |
|-----------|-----|
| iOS | Горизонтальний drag картки, кінетичні капсули leading / trailing |
| Інше | Тап по рядку відкриває панель 48px з тими самими кнопками |

`disabled` — лише діти, без жестів (режим перегляду).

---

## Пропси

```tsx
type SwipeActionRest = "closed" | "leading" | "trailing" | "panel";

interface SwipeActionRowAction {
  label: string;
  icon: ReactNode;
  className?: string; // додатково до bg-primary / bg-danger
  onAction: () => void;
}

<SwipeActionRow
  rest={rest}
  onRestChange={setRest}
  disabled={false}
  enterFromCollapsed={false}
  leading={{ label: "Редагувати", icon, onAction: onEdit }}
  trailing={{ label: "Видалити", icon, onAction: onDelete }}
>
  {children}
</SwipeActionRow>
```

- **leading** — свайп вправо / ліва кнопка панелі. Можна не передавати.
- **trailing** — свайп вліво / права кнопка. Видалення анімує height → 0, потім `onAction`.
- **rest** контрольований ззовні (в списку — один відкритий рядок).
- **enterFromCollapsed** — undo: старт з height 0 / opacity 0, spring на повну висоту.

---

## Жест iOS

Константи: rest-відкриття `72px`, commit `max(220px, 68% ширини рядка)`, fling за швидкістю `±1100` при ≥ 80% порогу.

1. Drag `x` з `dragDirectionLock`, низький elastic.
2. Капсула росте з розкриттям (`useTransform` по `x`), кліп по ширині рядка мінус padding — кнопка не виїжджає за край.
3. До порогу — іконка; за порогом — підпис (opacity / maxWidth).
4. Відпускання:
   - за порогом / fling → `finishLeading` / `finishTrailing` (повне розкриття смуги, для trailing ще fade + collapse);
   - інакше snap на `±72` або `0`.
5. Тап по картці, коли rest ≠ closed → закрити.
6. На час drag: lock вертикального скролу, `holdSelection`, pointer capture.

Leading після анімації скидає `x` у 0 (рядок лишається в списку). Trailing викликає `onAction` уже після height 0.

---

## Панель Android

Тап / Enter / Space по картці тоглить `panel` ↔ `closed`. Кнопки `flex-1`. Trailing іде тим самим collapse, що й swipe-delete.

---

## Haptic

`lightHaptic()` на arm порогу, commit leading/trailing і кнопки панелі. Фактично лише Android (`navigator.vibrate`). Див. `client/lib/haptic.ts`.

---

## Пов’язане

- Токени анімації: `client/lib/ease.ts` (`SPRING_LAYOUT`, `SPRING_PANEL`, `EASE_OUT`).
- Класи жестів: `TOUCH_GESTURE_CONTENT_CLASS`.
- Slide-to-confirm (інший жест): `SlideActionButton`.
