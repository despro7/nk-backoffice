# useUrlHashSync — стан сторінки в URL hash

## Призначення

Тонкий хук для двосторонньої синхронізації **shareable**-стану SPA з `window.location.hash`. Не UI-компонент: схема ключів (codec) лишається на сторінці.

Навіщо hash, а не `?query`: не потрапляє на Express, не конфліктує з `BrowserRouter` pathname, зручно копіювати лінк.

---

## Файли

| Файл | Опис |
|------|------|
| `client/hooks/useUrlHashSync.ts` | Хук + `buildHashString` / `parseUrlHash` / `replaceUrlHash` |
| `client/hooks/useUrlHashSync.spec.ts` | Unit-тести serialize/parse |

Споживач зараз: `client/pages/Products/useProductsCatalog.ts` (каталог).  
SalesDrive (`SalesDriveOrdersTable`) поки серіалізує hash інлайн — див. `Docs/features/salesdrive-filter-url.md`.

---

## Контракт

```typescript
useUrlHashSync(
  {
    folder: selectedFolderId !== CATALOG_ROOT_ID ? selectedFolderId : undefined,
    q: searchQuery.trim() || undefined,
    good: drawerMode === 'edit' && editingId ? editingId : undefined,
  },
  (params) => {
    const folder = params.get('folder')?.trim();
    const q = params.get('q');
    const good = params.get('good')?.trim();
    if (folder) setSelectedFolderId(folder);
    if (q) setSearchQuery(q);
    if (good) { setEditingId(good); setDrawerMode('edit'); }
  }
);
```

- `values` — поточний стан. `null` / `undefined` / `false` / `''` **не** потрапляють у hash.
- `onRestore` — один раз на mount, якщо hash непорожній.
- Запис після restore: перший `useEffect` пропускається, щоб дефолти не затерли лінк.
- Запис далі — `history.replaceState` (без нового пункту історії на кожну зміну фільтра). Не використовувати `location.hash =`.

---

## Правила для нової сторінки

1. У hash лише те, що варто шарити / відновлювати після reload.
2. Не класти selection, confirm-модалки, overlay, dirty-форму.
3. Codec (імена ключів, omit «усі вибрані», відкладений apply після API) — у споживача, не в хуку.
4. Два незалежні віджети на **одному** маршруті не повинні обидва писати весь hash без namespace ключів.

---

## Каталог `/products`

| Ключ | Зміст |
|------|--------|
| `folder` | Dilovod id папки; відсутній = корінь |
| `q` | Текст пошуку |
| `good` | Id відкритої картки (лише `drawerMode === 'edit'`) |

Приклад: `#folder=1100300000001234&q=курка&good=1100300000005678`.
