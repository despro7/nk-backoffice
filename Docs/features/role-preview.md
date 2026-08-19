# Перегляд інтерфейсу як інша роль (role preview)

**Дата:** 2026-08-20  
**Доступ:** лише реальний `admin`  
**Це не імперсонація:** JWT, `userId` і email лишаються адмінськими.

---

## Огляд

Адмін, не виходячи зі свого акаунта, може дивитись UI так, як його бачить інша роль, і отримувати ті самі **403 від `requireRole` / `requireMinRole`**.

Ієрархія: `ADS_MANAGER` < `STOREKEEPER` < `WAREHOUSE_MANAGER` < `SHOP_MANAGER` < `BOSS` < `ADMIN`.

| Що змінюється | Що не змінюється |
| --- | --- |
| Меню, маршрути, кнопки (`effectiveRole`) | `user.role` в `AuthContext` |
| 403 на API з перевіркою ролі | Автор дій у БД / Dilovod / логах (`userId`, email) |
| Toast «Недостатньо прав» | Дані, прив’язані до користувача (нотифікації, «мої» сесії) |

**Ключове рішення:** не підміняти `user.role` у `AuthContext`. Debug mode і селект ролі дивляться на **реальну** роль адміна, інакше контролі зникнуть і адмін «застрягне» в прев’ю.

---

## UI

Селект ролі й Debug mode — у закріпленому футері сайдбару (`SidebarAdminFooter`), сховані в спойлер:

- кнопка завжди внизу, контент розгортається вгору (300ms);
- за замовчуванням згорнутий; стан у `sessionStorage` (`sidebarAdminToolsOpen`);
- підпис: «Інструменти», або назва ролі / Debug, якщо щось увімкнено.

Прев’ю ролі зберігається в `sessionStorage` (`rolePreview`) і скидається при logout / якщо юзер не адмін.

Якщо поточна сторінка недоступна обраній ролі → редірект на `/`.

У хедері Debug mode **немає**. У профілі користувача під час прев’ю показується «{роль} · перегляд».

Куди дивитись:

- Контекст: `client/contexts/RolePreviewContext.tsx`
- Селект: `client/components/RolePreviewSelect.tsx`
- Спойлер сайдбару: `client/components/SidebarAdminFooter.tsx`
- Доступ у UI: `client/hooks/useRoleAccess.ts`, `ProtectedRoute`, `Sidebar`, `MobileTabBar`, `MobileHeader`

---

## Серверне зниження ролі

Клієнт патчить `window.fetch` (`client/lib/rolePreviewFetch.ts`) і на same-origin `/api/*` додає заголовок `X-Role-Preview: <role>`.

Після `authenticateToken` middleware `applyRolePreview`:

1. реальна роль JWT === `admin`;
2. заголовок — відома роль **строго нижче** admin;
3. шлях не з винятків сесії.

Тоді `req.user.role` тимчасово стає preview-роллю, `req.user.realRole` = `admin`. У відповіді: `X-Role-Preview-Applied`.

Не застосовується до:

- cron / `userId === 0`;
- `/api/auth/profile`, `logout`, `refresh`, `login`;
- точний `GET /api/auth/settings` (не `/settings/admin`).

Не-адмін, який надішле заголовок, ігнорується (підвищити роль неможливо).

Константи й хелпери: `shared/constants/roles.ts`  
(`ROLE_PREVIEW_HEADER`, `canApplyRolePreview`, `isRolePreviewExemptPath`).

CORS: `X-Role-Preview` у `allowedHeaders`, `X-Role-Preview-Applied` і `X-Insufficient-Role` у `exposedHeaders`.

Після зміни прев’ю React Query робить `resetQueries()`, щоб не світити адмінський кеш.

---

## Мутації

Прев’ю **не пісочниця**. Якщо обраній ролі дія дозволена (наприклад відправка повернення) і адмін її натисне — вона **виконається від адмінського акаунта**.

Заборонена цій ролі дія → 403, нічого не зміниться.

---

## Toast на 403

`requireRole` / `requireMinRole` ставлять `X-Insufficient-Role: 1` і `code: INSUFFICIENT_ROLE`.

Патч `fetch` бачить заголовок (body не читає) і показує тост:

- прев’ю: warning «Роль «…» не має доступу до цієї дії»;
- звичайний користувач: danger «У вас немає доступу до цієї дії».

Пачка 403 (після зміни ролі) зведена до одного тоста на 2 с. Вимикається налаштуванням toast `apiErrors`.

---

## Що не покрито

Ендпоінти лише з `authenticateToken` (без `requireRole` / `requireMinRole`) лишаються доступними. Фільтрація по `userId` не змінюється. Inline-перевірки `req.user.role` підхоплюють прев’ю автоматично.
