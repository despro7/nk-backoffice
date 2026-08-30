# Motion-примітиви (sheet, slide-confirm, жести)

Набір для мобільних екранів складу. Перший великий споживач — `WarehouseMovementMob` (`Docs/features/warehouse-movement-mob.md`).

---

## Токени (`client/lib/ease.ts`)

Криві як у `global.css`. Springs — канонічна фізика:

| Експорт | Навіщо |
|---------|--------|
| `EASE_OUT` / `EASE_IN_OUT` / `EASE_DRAWER` | Tweens; drawer = довгий damped glide без overshoot |
| `EASE_OUT_CSS` | Те саме для inline `transition` |
| `SPRING_PRESS` | `whileTap` |
| `SPRING_SWAP` | Заміна іконки / лейбла в контролі |
| `SPRING_PANEL` | Виїзд панелі під рядком |
| `SPRING_LAYOUT` | Snap картки, thumb slide-to-confirm |
| `SPRING_MOUSE` | Декор follow-курсора |
| `SPRING_GLIDE` | Слайдери без відскоку з кінця |

---

## BottomSheet (`client/components/motion/bottom-sheet.tsx`)

Портал, backdrop, snap points (`0–1` або `"auto"`), dismiss свайпом униз.

Скрол під sheet на iOS: `overflow: hidden` на body **недостатньо**. Поки відкрито: `position: fixed` + `top: -scrollY`, після закриття — відновити `window.scrollTo`.

Exit / a11y: `PresenceGate` (`client/lib/presence-gate.tsx`) — `inert` і `pointer-events: none` з першого кадру exit, поки візуал ще грає.

---

## SlideActionButton (`client/components/motion/slide-action-button.tsx`)

Thumb drag по треку. `threshold` (типово 0.82) → `onComplete`, підпис complete, `resetDelay` (у confirm порцій — 10 с).

Обгортка складу: `MovementMobSwipeConfirm` (grip з чотирьох рисок, лейбли українською).

На complete викликається `lightHaptic()`.

---

## SwipeActionRow

Окремо: `Docs/architecture/swipe-action-row.md`.

---

## Touch (`client/lib/touch.ts`)

iOS long-press callout і selection ламають drag. Класи:

- `TOUCH_GESTURE_CLASS` — сам контроль (thumb, handle): `user-select: none` завжди.
- `TOUCH_GESTURE_CONTENT_CLASS` — обгортка контенту: callout off, select-none лише на `pointer: coarse`.

Додатково: `holdSelection` на час жесту, `capturePointer` / `releasePointer` (WebKit кидає `NotFoundError`, якщо pointer уже зник).

`usesIosSwipeGestures()` — гілка swipe vs панель.

---

## Haptic (`client/lib/haptic.ts`)

```ts
export function lightHaptic() {
  try {
    navigator.vibrate?.(10);
  } catch { /* missing or blocked */ }
}
```

Працює на Android. iOS Safari метод може існувати, але **не вібрує**. Прихований `input[switch]` (Taptic) прибрали: у репозиторії не тримаємо хак, який на девайсі не дає стабільного результату (і програмний toggle після iOS 26.5 Apple закрила).
