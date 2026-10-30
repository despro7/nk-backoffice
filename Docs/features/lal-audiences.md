# LAL Аудиторії — вибірка клієнтів для Meta / Google Ads

**Дата:** 2026-08-18  
**Маршрут:** `/reports/lal-audiences` (`minRole: ADS_MANAGER`)  
**API:** `/api/lal-audiences`

---

## Огляд

Модуль формує аудиторію з таблиці `orders` (окремої таблиці клієнтів немає), показує пагінований список і експортує CSV / XLSX для рекламних кабінетів.

| Що | Рішення |
| --- | --- |
| Ключ клієнта | Нормалізований телефон (`shared/utils/phoneNormalizer.ts`), у файлі E.164 (`+380…`) |
| Email / ПІБ | JSON `orders.rawData` (`primaryContact` + fallback на `customerName`) |
| Хто в вибірці | Лише клієнти з валідним телефоном |
| Доступ | ads-manager і вище |

Куди дивитись:

- Типи / константи: `shared/types/lalAudiences.ts`
- Сервіс: `server/services/LalAudiencesService.ts`
- Замовлення періоду і повторні: `server/services/lalPeriodOrderStats.ts`
- Роут: `server/routes/lal-audiences.ts`
- UI: `client/pages/Reports/LalAudiences/`

---

## Навігація

Пункт меню **Звіти → LAL Аудиторії** (`client/routes.config.tsx`, `parent: 'reports'`, `order: 4`). Header / Sidebar без окремих змін.

---

## Фільтри та пресети

Пресети — single-select: клік підставляє слайдери / період, повторний клік знімає пресет (кастомні фільтри лишаються).

| Пресет | Правило |
| --- | --- |
| Постійні (`loyal`) | `orderCount ≥ 3` |
| VIP (`vip`) | LTV > 10 000 ₴ |
| Нові покупці (`new`) | рівно 1 замовлення; період = 1 місяць |
| Ризик відтоку (`churn`) | останнє замовлення старші за 90 днів |
| Військові (`military`) | є замовлення з `pricinaZnizki` з `MILITARY_DISCOUNT_REASON_IDS` (зараз `33`) |
| B2B / Опт (`b2b`) | LTV > 10 000 ₴ **і** max порцій в одному замовленні ≥ 100 |

Константи порогів — у `shared/types/lalAudiences.ts` (`LAL_VIP_LTV_MIN`, `B2B_MIN_PORTIONS_IN_ORDER`, тощо). Не дублювати на клієнті.

**Період** (дефолт `1m`): 1 / 3 / 6 місяців, весь час, кастомний DateRange.

**Логіка вибірки**

- `lifetime` («За весь LTV»): остання покупка в періоді; `orderCount` і LTV рахуються за весь час по обраних статусах.
- `strict` («Суворий режим»): усі замовлення клієнта (у вибраних статусах) лежать у періоді.

**Слайдери:** правий край (`15` замовлень, `50 000` ₴) = без верхньої межі. Debounce ~300 мс.

**Статуси:** дефолт `1, 2, 5`. У списку всі з `statusMapper`, крім `8` (Видалений). «Всі» = усі видимі пункти.

**Якість вибірки:** High — 100% з телефоном і email ≥ 70%; Medium — email ≥ 40%; інакше Low.

---

## Замовлення періоду і повторні продажі

Окремо від lifetime-суми клієнтів вибірки (`summary.totalOrdersInSelection`).

| Поле | Що рахує |
| --- | --- |
| `ordersInPeriod` | Рядки замовлень обраних статусів, чия звітна дата в періоді |
| `repeatOrdersInPeriod` | З них ті, де в клієнта вже було раніше замовлення (ті самі статуси) |
| `repeatOrdersPercent` | Частка повторних від `ordersInPeriod`, 0–100, один знак |
| `periodTrend[]` | `{ date, orders, repeatOrders }` по звітних днях |

Ці метрики **не** ріжуться слайдерами кількості замовлень, LTV, пресетом і режимом `lifetime` / `strict`. Інакше цифра не збігається зі «Статистикою продажів».

**Повторне замовлення:** той самий нормалізований телефон, менша `orderDate` (нічия — менший `id`). Замовлення до періоду в лічильник не входить, але робить наступне в періоді повторним. Без валідного телефону рядок входить у знаменник і не є повторним.

**Звітна година** (`reporting_day_start_hour`, `getReportingDate`): день на графіку той самий, що в `GET /api/orders/sales/report`.

**Межі періоду**

- `custom`: календарні `startDate` / `endDate` порівнюються зі звітною датою. Вікно збігається з `getReportingDateRange` звіту продажів.
- `1m` / `3m` / `6m`: календарні початок доби N місяців тому і кінець сьогодні, **без** `getReportingDateRange`. Замовлення після звітної години сьогодні отримує дату «завтра» і випадає з ряду.
- `all`: у `periodTrend` лише дні з замовленнями, без нульових днів.

Порожні дні обмеженого діапазону заповнюються нулями. Групування тиждень (з понеділка) / місяць — на клієнті. Дефолт графіка: день, якщо точок ≤ 45; інакше тиждень; для `all` — місяць.

**Відома розбіжність зі «Статистикою продажів»:** той звіт пропускає замовлення без кешованих позицій із кількістю > 0. LAL рахує кожен рядок. Пресет «1 місяць» — ковзне вікно, не календарний «цей місяць».

---

## API

Роль: `authenticateToken` + `requireMinRole(ROLES.ADS_MANAGER)`.

### `GET /api/lal-audiences`

Query: `period`, `startDate`/`endDate` (для `custom`), `logic`, `statuses`, `orderCountMin`/`Max`, `ltvMin`/`Max`, `preset`, `page`, `limit` (`10, 25, 50, 100`).

Відповідь: `{ success, rows, summary, periodTrend, pagination }`.

`summary` додатково: `ordersInPeriod`, `repeatOrdersInPeriod`, `repeatOrdersPercent`. `totalOrdersInSelection` лишається сумою lifetime-замовлень клієнтів вибірки.

### `POST /api/lal-audiences/export`

Тіло = ті самі фільтри + `excludePhones[]` + `format: csv | xlsx` + опційно `columns[]`. Файл стрімом (CSV з UTF-8 BOM).

Колонки файлу за замовчуванням: `Phone`, `Email`, `First Name`, `Last Name`, `City`, `Country`. Додатково можна увімкнути `Orders`, `LTV`, `Last Order`. Порожній `columns` на сервері підміняється дефолтом.

---

## UI

Дві колонки: пресети + фільтри зліва; картка підсумку, графік повторних продажів і таблиця справа.

Картка: клієнти, телефон/email, якість, замовлення вибірки (lifetime), замовлення періоду, повторні (`кількість · %`). Графік — area chart, серії «Усі замовлення» і «Повторні», перемикач день / тиждень / місяць.

- Чекбокс рядка: зняття додає телефон у `excludePhones`. Лічильник у картці = `total − excluded`.
- Експорт — dropdown CSV / XLSX; іконка ⚙ поруч обирає колонки файлу (не можна зняти всі).
- Пагінація 10 / 25 / 50 / 100.

---

## Дані / міграція

Джерело — `Order`: `customerPhone`, `customerName`, `cityName`, `orderDate`, `totalPrice`, `quantity`, `status`, `pricinaZnizki`, `rawData`.

Індекс: `@@index([customerPhone])` — `prisma/migrations/20260818120000_add_order_customer_phone_index/`.

---

## Поза першим проходом

- Окрема таблиця Customer / матеріалізований LTV.
- Пряме завантаження в Meta / Google API (лише файл).
- Збережені аудиторії користувача.
- DISTINCT `pricinaZnizki` з прод-БД (зараз лише код `33`).
