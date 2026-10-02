# LocatorJS — інспектор компонентів (dev)

Швидкий перехід від UI-елемента в браузері до файлу та рядка в Cursor.

## Використання

1. Запустіть `npm run dev`
2. Утримуйте **Option (⌥)** / **Alt** і наведіть курсор на елемент
3. Клікніть — відкриється файл у Cursor

> Вимкніть розширення LocatorJS у браузері, якщо воно встановлене — воно конфліктує з runtime-бібліотекою.

## Обмеження

- Працює лише в **dev** (`import.meta.env.DEV`)
- Клік по елементах з `node_modules` (наприклад, внутрішні HeroUI `data-slot`) не спрацює — клікайте на батьківський елемент вашого коду в `client/`

## Стек

| Пакет | Роль |
|-------|------|
| `@vitejs/plugin-react` | Babel-компіляція з JSX source metadata |
| `@locator/babel-jsx` | Атрибути `data-locatorjs` у DOM |
| `@locator/runtime` | UI оверлей і відкриття файлу в IDE |

## Типові проблеми

**`504 Outdated Optimize Dep`** — застарілий кеш після зміни плагіна:

```bash
rm -rf node_modules/.vite
npm run dev
```

Потім hard refresh у браузері (`Cmd+Shift+R`).

**`No source info found`** — Babel-плагін не підключений або клік по елементу з `node_modules`.

## Конфігурація

- `vite.config.dev.ts` — `react({ babel: { plugins: [locatorBabelJsx] } })`
- `client/main.tsx` — `setupLocatorUI()` під `import.meta.env.DEV`
