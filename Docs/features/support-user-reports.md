# Звіти користувачів — «Сповістити адміна»

**Дата:** 2026-09-20  
**Доступ до кнопки:** усі авторизовані користувачі (desktop)  
**Налаштування:** `/settings/admin` → «Звіти користувачів» (admin)

---

## Огляд

Глобальна кнопка **«Сповістити адміна»** дозволяє надіслати адміністратору звіт про проблему: скриншот, коментар, контекст сесії та логи. Звіт зберігається в `meta_logs` і (за налаштуванням) дублюється в Telegram-канал.

| Що надсилається | Джерело |
| --- | --- |
| Скриншот (PNG/JPEG, опційно з анотаціями) | клієнт |
| URL, viewport, user agent, app version | клієнт |
| Користувач (id, email, name, role) | JWT + metadata |
| Client logs | `ClientLogBuffer` |
| Server console logs | `ServerLogBuffer` (`logServer`, `console.log`) |
| Server meta_logs | останні записи користувача в БД |

**Mobile:** FAB не показується (`ReportProblemFab` → `null` на `isMobile`).

---

## UI

### FAB (desktop)

- Фіксована панель зліва внизу (`Layout` → `ReportProblemFab`).
- «Язичок» розгортає/згортає кнопку; при натисканні — захоплення скриншота без scale-анімації (лише затемнення кольору).
- Елементи з класом `report-capture-exclude` / `data-report-capture-chrome` виключаються зі скриншота.

### Модалка звіту

1. Автоскриншот (див. режими нижче).
2. Коментар (ліміт з налаштувань).
3. Превʼю + повторний захоп («Точний» / «Екран» / «Вся сторінка»).
4. Збільшення превʼю → `ScreenshotAnnotator` (Pan, прямокутник, овал, zoom).

### Історія в додатку

- Запис у `meta_logs` з `category: user_report`.
- У `NotificationBell` категорія **«Звіт користувача»** видна **лише admin** (`server/routes/notifications.ts`).

---

## Режими скриншота

| Режим | API / бібліотека | Коли |
| --- | --- | --- |
| **Точний (native)** | `getDisplayMedia` | За замовчуванням; pixel-perfect вкладки; браузер просить дозвіл |
| **Екран (viewport)** | `modern-screenshot` | Fallback або ручний перезахоп; видимий viewport |
| **Вся сторінка (fullpage)** | `modern-screenshot` | Повна прокручувана сторінка |

**Smart default:** спочатку native; якщо користувач скасував або API недоступний — DOM viewport.

Перед DOM-захопом модалка/FAB ховаються (`setReportCaptureUiHidden`, `waitBeforeDomCapture`), щоб backdrop не потрапив у кадр.

---

## Telegram

Налаштування: bot token, chat ID, enable/disable, ліміти.

**Формат доставки** (обмеження Bot API — не один message з двома файлами):

1. Скриншот як **document** (PNG/JPEG без photo-compression) з HTML-caption.
2. Файл `.log` — окреме повідомлення (`backoffice-report_YYYY-MM-DD_HH-mm-ss_#id.log`).

Якщо Telegram вимкнено або помилка — звіт **все одно** зберігається в БД.

---

## Налаштування (`SupportReportSettings`)

| Поле | Опис |
| --- | --- |
| Telegram Bot Token / Chat ID | Інтеграція; token маскується, є reveal + тест |
| Client log lines | Скільки рядків з браузера |
| Client log levels | `error`, `info`, `warn`, `auth` (LoggingService) |
| Server log lines | Останні `logServer` / `console.log` на Node |
| Server meta log lines | Останні `meta_logs` користувача |
| Rate limit | Мін. інтервал між звітами (с) |
| Max comment / screenshot MB | Валідація на сервері + стиснення JPEG на клієнті |

Ключ у БД: `settingsBase` → `support_report_settings` (`shared/types/supportReport.ts`).

---

## API

| Метод | Шлях | Хто |
| --- | --- | --- |
| GET | `/api/support-reports/config` | auth — публічні ліміти |
| POST | `/api/support-reports` | auth — надіслати звіт |
| GET/PUT | `/api/settings/support-reports` | settings admin |
| POST | `/api/settings/support-reports/test` | settings admin — тест Telegram |

Body parser для POST звіту: **12mb** (`server/index.ts`).

---

## Ключові файли

| Шар | Файли |
| --- | --- |
| UI | `client/components/ReportProblemFab.tsx`, `ReportProblemModal.tsx`, `ScreenshotAnnotator*.tsx` |
| Client | `client/services/ReportProblemService.ts`, `ClientLogBuffer.ts` |
| Server | `server/routes/support-reports.ts`, `TelegramAlertService.ts`, `SupportReportSettingsService.ts`, `ServerLogBuffer.ts` |
| Shared | `shared/types/supportReport.ts` |
