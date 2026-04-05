# useUnsavedGuard — захист від втрати незбережених змін

## Призначення

Загальний механізм для блокування навігації коли є незбережені зміни на сторінці.
Показує модальне вікно з трьома варіантами дій: зберегти чернетку і вийти, вийти без збереження, або залишитись.

Реалізований як пара: **хук** + **модальний компонент**.

---

## Файли

| Файл | Опис |
|------|------|
| `client/hooks/useUnsavedGuard.ts` | Хук: логіка блокування навігації |
| `client/components/modals/UnsavedChangesModal.tsx` | Компонент: модальне вікно з трьома кнопками |

---

## Як використати

### 1. Визначити `isDirty`

`isDirty` — будь-який `boolean`, що сигналізує про незбережені зміни.
У `useWarehouseInventory` це реалізовано через порівняння JSON-snapshot:

```typescript
// Snapshot фіксується після завантаження / збереження
const lastSavedSnapshotRef = useRef<string | null>(null);

const isDirty = useMemo(() => {
  if (sessionStatus !== 'in_progress') return false;
  if (lastSavedSnapshotRef.current === null) return false;
  return JSON.stringify(serializeItems(products, materials)) !== lastSavedSnapshotRef.current;
}, [sessionStatus, products, materials]);
```

Snapshot оновлюється у:
- `handleStartSession` — після завантаження свіжих продуктів
- `loadDraft` — після відновлення чернетки з БД
- `handleSaveDraft` — після успішного збереження
- `handleFinish` / `handleReset` — скидається у `null` (сесія неактивна)

### 2. Підключити хук

```tsx
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';

const guard = useUnsavedGuard({
  isDirty: inv.isDirty,
  onSaveDraft: inv.handleSaveDraft,
});
```

### 3. Відрендерити модалку

```tsx
<UnsavedChangesModal
  {...guard.modalProps}
  message="Ваш кастомний текст попередження"
/>
```

---

## API

### `useUnsavedGuard(options)`

**Параметри:**

| Параметр | Тип | Опис |
|----------|-----|------|
| `isDirty` | `boolean` | Чи є незбережені зміни |
| `onSaveDraft` | `() => Promise<void>` | Async-функція збереження чернетки |

**Повертає:** `{ modalProps: UnsavedGuardModalProps }`

---

### `<UnsavedChangesModal>`

Приймає `UnsavedGuardModalProps` (через `{...guard.modalProps}`) плюс опціональні тексти:

| Prop | Тип | За замовчуванням |
|------|-----|-----------------|
| `title` | `string` | `'Незбережені зміни'` |
| `message` | `string` | `'Ви маєте незбережені зміни...'` |
| `saveText` | `string` | `'Зберегти і вийти'` |
| `leaveText` | `string` | `'Вийти без збереження'` |
| `cancelText` | `string` | `'Залишитись'` |

---

## Механізм блокування

Хук сумісний з `BrowserRouter` (не потребує `createBrowserRouter` / data router).
Перехоплює три типи навігації:

### 1. Програмна навігація (`useNavigate`, `<Link>`)

Патчить методи `push` / `replace` на об'єкті `navigator` з `UNSAFE_NavigationContext`:

```typescript
const { navigator } = useContext(NavigationContext);

nav.push = (...args) => {
  pendingNavigationRef.current = () => originalPush(...args);
  setIsOpen(true);           // показуємо модалку
};
```

При виборі «Вийти» або «Зберегти і вийти» — викликаємо збережений `pendingNavigationRef.current()`.
Cleanup у `useEffect` відновлює оригінальні методи.

### 2. Кнопки «назад/вперед» браузера (`popstate`)

```typescript
window.history.pushState(null, '', window.location.href); // фіктивний запис
window.addEventListener('popstate', handlePopState);
```

При `popstate` — знову додаємо `pushState` щоб скасувати навігацію, показуємо модалку.
При виборі «Вийти» — `window.history.go(-1)`.

### 3. Закриття / перезавантаження вкладки (`beforeunload`)

```typescript
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = ''; // браузер показує системний діалог
});
```

> ⚠️ Для `beforeunload` кастомна модалка **не показується** — браузер показує власний системний діалог (обмеження безпеки браузерів).

---

## Поточне використання

| Сторінка | Файл |
|----------|------|
| Інвентаризація складу | `client/pages/Warehouse/WarehouseInventory/index.tsx` |

---

## Примітки

- `UNSAFE_NavigationContext` — внутрішній API react-router, позначений як нестабільний. При мажорному апгрейді react-router перевірити сумісність.
- Альтернатива при переході на `createBrowserRouter`: замінити всю логіку хука на стандартний `useBlocker` — інтерфейс (`isDirty`, `onSaveDraft`, `modalProps`) залишиться незмінним.
