# Центр сповіщень

Дропдаун сповіщень у хедері (дзвіночок), правила виводу, права ролей і дублювання в Telegram.
Джерело даних: таблиця `meta_logs`, яку пишуть Діловод, склад, синхронізації, модерація специфікацій тощо.

## Модель

Кожен запис `meta_logs` проходить через **рушій правил** (`shared/notifications/ruleEngine.ts`) і стає сповіщенням з полями:

| Поле | Значення |
|------|----------|
| `kind` | `alert` – проблема; `task` – від адресата чекають дії; `event` – інформація |
| `group` | `assembly`, `dilovod`, `sync`, `warehouse`, `products`, `system` (`shared/constants/notifications.ts`) |
| `level` | `error`, `warning`, `success`, `info` (з `meta_logs.status` або перевизначений правилом) |
| `visible` | `hidden` – запис лишається в журналі, але не йде в дропдаун і Telegram |
| `title`, `message` | Текст після замін, шаблонів і словника |
| `action` | Кнопка «Відкрити …» з внутрішнім посиланням |

`severity` більше не керує видимістю: модерація специфікацій раніше писалась як `warning`, щоб потрапити в дзвіночок, тепер це `task` з рівнем `info`.

## Рушій правил

Таблиця `notification_rules` (Prisma `NotificationRule`), порядок за `position`, **перше увімкнене правило, що підійшло, перемагає**.

**Збіг (`match`)**: `categories`, `statuses`, regex по `title` / `message` / `initiatedBy` (регістр ігнорується), `dataHas` (шлях у `data`).
Іменовані групи regex (`(?<sku>\S+)`) стають змінними шаблонів.

**Вивід (`output`)**:

- `replacements` – ланцюжок `regex → заміна` (`$1`, `$<name>`), по черзі, для `title` / `message` / `both`;
- `title`, `message` – шаблони: `{{orderNumber}}`, `{{actor}}`, `{{category}}`, `{{message}}` (після замін), `{{rawMessage}}`, іменовані групи, `{{data.шлях}}`; невідомі змінні – порожньо;
- `kind`, `group`, `level`, `visibility`, `actionLabel`, `actionLink` (лише внутрішній шлях `/…`).

Без правила: сирий текст, група з категорії, видимі лише `error` / `warning`, посилання з `data.link` або `/orders/<orderNumber>`.

**Словник** (`notification_glossary`) застосовується після правил до всіх сповіщень: буквальна фраза або regex → заміна (англ. → укр., прибирання HTML).

**Безпека regex**: синтаксис, прапорці, довжина ≤ 500, заборона вкладених квантифікаторів (`(a+)+`); вхідний текст обрізається до 4000 символів (`validatePattern`, `validateRule`).

### Стандартні правила

`shared/notifications/defaultRules.ts`, зібрані з реальних записів `meta_logs`: нестача товару (список позицій «• Назва (арт. X): бракує N шт, є M»), договір на іншого контрагента, `multithreadApiSession`, мапінг оплат, `cant set value of …`, `object locked`, переміщення / списання / комплектування, автофіналізація, штрих-коди, модерація специфікацій, звіти користувачів. Рутинні success Діловода і аудит (`Sale date changed`, `Shipment date confirmed`) приховані.

Засів при порожній таблиці. Далі один раз на запуск сервера стандартні правила, яких ніхто не редагував (`updatedById = null`), оновлюються з коду, нові – додаються (крім видалених вручну, див. `notification_config_revisions`).

## Стрічка (API)

`GET /api/notifications/feed?tab=all|mine|errors|archive&limit=100` → `NotificationFeedResponse` (`items`, `counts`).

| Вкладка | Що показує |
|---------|-----------|
| Всі | Видимі й не в архіві |
| Мої | Адресні (`data.recipients` містить мене) + ініційовані мною (`initiatedBy = userId`) |
| Помилки | `level` = `error` або `warning` |
| Архів | Архівовані мною (`hiddenBy[userId]`) і «Вирішено» адміністратором (`hiddenBy._all`) |

`counts.all|mine|errors` – непрочитані, `counts.archive` – загальна кількість. Вікно: 30 днів, до 600 записів.

Видимість для користувача:

1. правило не приховало запис;
2. `user_report` – лише адміністратор;
3. адресні (`data.recipients`) – лише адресатам, **незалежно від матриці ролі**;
4. інші – право ролі `action.notify.<group>.<level>.app` (адміністратор бачить усе).

Однакові сповіщення (правило + група + текст + замовлення) згортаються в один рядок з лічильником `×N`; рядок непрочитаний, поки непрочитана хоч одна копія.

Дії (тіло `{ ids: number[] }`): `PUT /read`, `PUT /archive` (також позначає прочитаним), `PUT /unarchive`, `PUT /resolve` (адмін, ховає для всіх).

Продуктивність: рендер не залежить від користувача, тож відрендерені записи кешуються за `meta_logs.id` і версією конфігу. Кожне опитування читає лише `id`, `readBy`, `hiddenBy`; важкий `data` – тільки для нових записів.

Ініціатор: `initiatedBy` = userId (ручний експорт раніше писав `manual:user:<email>`, такі записи зіставляються за email).

## Дропдаун (дзвіночок)

`client/components/NotificationBell.tsx` + `client/components/notifications/{NotificationPanel,NotificationRow,NotificationAvatar}.tsx`, дані – `client/hooks/useNotificationFeed.ts`.

- Хедер: «Сповіщення» і посилання «Детальний звіт» (`/reports/meta-logs`). Масового «Позначити все прочитаним» для користувачів немає.
- Вкладки з лічильниками непрочитаних; у «Помилках» лічильник червоний.
- Рядок: аватар (ініціали користувача або іконка сервісу) з точкою рівня (задача – синя), заголовок, `×N` для повторів, мета «хто · коли · група · через … · №замовлення», текст обрізано до 2 рядків.
- Дії: основна кнопка (`action`), «Вирішено» для адміністратора (лише `alert`), «Показати лог» **лише в debug-режимі**. При наведенні: «Позначити прочитаним», «В архів» / «Повернути з архіву». Клік по рядку позначає прочитаним.
- Debug-режим: тонкий футер з глобальними Read all / Hide all / Reset read; адміністратор бачить позначку «Без шаблону» на рядках без правила (веде в налаштування).
- Опитування: закритий дропдаун – кожні 30 с лише лічильники (`limit=1`); відкритий – активна вкладка повністю.

## Налаштування: `/settings/notifications`

Сторінка «Центр сповіщень» у налаштуваннях (право `page.settings.notifications`, адміністратор має його завжди). API – `/api/notification-settings` (`server/routes/notification-settings.ts`, `NotificationSettingsService`).

| Вкладка | Що робить |
|---------|-----------|
| Перегляд | Справжній дропдаун на реальних даних за 30 днів, «переглянути як роль» (`GET /preview-feed?role=`) |
| Правила | Список за порядком: вмикання, ↑/↓, скільки з останніх 800 записів обробляє правило, позначка «стандартне» |
| Тестер | Запис з журналу (пошук) або введений вручну → готовий рядок, змінні, які правила підходять і яке спрацювало; «Створити правило» з прикладу |
| Джерела | Що пишеться в `meta_logs` за 90 днів (категорія + статус + заголовок, кількість), яке правило покриває останній запис, фільтр «Без правила» |
| Словник | Фрази / regex, перевірка на довільному тексті |
| Історія | Хто, коли, що змінив (було / стало), «Відкотити» |

**Редактор правила** (drawer): умови збігу, вивід (тип, група, рівень, видимість, шаблони, кнопка), ланцюжок замін; праворуч живий перегляд рядків на реальних записах з оригіналом і змінними. «Зберегти» неактивне, поки правило має помилки або не обробляє жодного з останніх записів. Для стандартних – «Скинути до стандартного». Рушій той самий, що на сервері (`shared/notifications/ruleEngine.ts`), тож перегляд збігається з дропдауном.

Історія: кожна зміна правила / словника пише `notification_config_revisions`; відкат повертає стан «було» (видалене відновлюється, створене видаляється) і сам записується в історію. Якщо відкат повертає стандартне правило до версії з коду, воно знову оновлюється автоматично.

## Права ролей

Ключі `action.notify.<group>.<level>.<channel>`, `channel` = `app` | `tg`, у `role_permissions`.

У редакторі ролі («Користувачі → Ролі») блок «Сповіщення» (`NotificationPermissionsMatrix`): рядки – групи, колонки – рівні, у кожній клітинці дві галочки (дзвіночок і Telegram), плюс «усе в застосунку / усе в Telegram» на рядок і на колонку. Лічильник «дії» у списку ролей notify-ключі не рахує.

## Персональні налаштування (шестерня)

Шестерня біля вкладок відкриває налаштування в самому дропдауні (`NotificationPrefsView`), зберігаються в `notification_user_prefs` (`GET/PUT /api/notifications/prefs`):

- **Групи в дзвіночку:** вимкнути можна лише ті, що дозволяє роль; заборонені роллю показані неактивними. Адресних сповіщень не стосується.
- **Звук:** короткий сигнал (Web Audio), коли зростає кількість непрочитаних під час опитування.
- **Telegram:** підключення бота й вимкнення груп для Telegram (див. «Telegram»).
Міграція `20261108120000_notification_rules` видає всім ролям, крім admin, `error` і `warning` усіх груп у застосунку, плюс `success` для складу й товарів (поведінка як до редизайну). Telegram вимкнено.

## Telegram

Окремий бот сповіщень, на який працівники підписуються самі. Код: `server/modules/Notifications/{NotificationTelegramService,telegramDelivery}.ts` (+ spec).

**Налаштування** (адмін, вкладка «Telegram» у `/settings/notifications`): токен з @BotFather (перевіряється `getMe`, зберігається в `settings_base.notification_telegram`, у UI маскований), перемикач «Розсилка увімкнена», «Надіслати собі тест», список підключених з відключенням, статистика outbox за 7 днів і останні помилки. Новий токен скидає всі привʼязки.

**Підключення працівника:** дзвіночок → шестерня → «Підключити Telegram» → одноразове посилання `t.me/<bot>?start=<code>` (15 хв). Бот отримує `/start <code>` через `getUpdates` і привʼязує `chat_id` (`notification_telegram_links`). `/stop` у боті – відключення. Після підключення в шестерні можна вимкнути окремі групи для Telegram.

**Хто отримує:** запис видимий (правило не «Лише журнал») і

- адресний – лише адресати;
- інакше – право ролі `action.notify.<group>.<level>.tg` (галочка «Telegram» у матриці), група не вимкнена користувачем ні в дзвіночку, ні для Telegram;
- `user_report` – лише адміністратор.

**Доставка:** воркер кожні 15 с: `getUpdates` → нові `meta_logs` після курсора (`settings_base.notification_telegram_cursor`; при першому запуску курсор ставиться на останній id, історія не розсилається) → рушій правил → `notification_outbox` (унікально на запис + користувача) → відправка з атомарним захопленням рядка, повтори 30 с / 2 хв / 10 хв / 30 хв, до 5 спроб; 403 (бота заблоковано) відключає чат.
**Антиспам:** однакове сповіщення (правило + група + текст + замовлення) одному користувачу – не частіше раз на 30 хв.
**Формат:** HTML, емодзі рівня (задача – 📌), жирний заголовок, текст після правил, курсивом «група · №замовлення · хто»; кнопка «Відкрити …» на `CLIENT_URL` + посилання, якщо адреса https (інакше посилання текстом).

**Де працює воркер:** не в `NODE_ENV=development` (локальний бекофіс на спільній БД не дублює розсилку); локально вмикається `NOTIFICATION_TG_WORKER=1`.

## Файли

| Шар | Файли |
|-----|-------|
| Константи | `shared/constants/notifications.ts` |
| Типи | `shared/types/notificationRules.ts`, `shared/types/notifications.ts` |
| Рушій | `shared/notifications/ruleEngine.ts` (+ spec), `shared/notifications/defaultRules.ts` |
| Клієнт | `client/components/NotificationBell.tsx`, `client/components/notifications/*`, `client/hooks/useNotificationFeed.ts` |
| Сервер | `server/modules/Notifications/{NotificationConfigService,NotificationFeedService,notificationFeed}.ts` (+ spec), `server/routes/notifications.ts` |
| Налаштування | `client/pages/SettingsNotifications/**`, `client/services/NotificationSettingsService.ts`, `server/routes/notification-settings.ts`, `server/modules/Notifications/NotificationSettingsService.ts`, `shared/types/notificationSettings.ts`, `shared/notifications/feedPresentation.ts` |
| Telegram | `server/modules/Notifications/{NotificationTelegramService,telegramDelivery}.ts`, `client/components/notifications/NotificationTelegramConnect.tsx`, `client/pages/SettingsNotifications/components/TelegramTab.tsx` |
| БД | `notification_rules`, `notification_glossary`, `notification_config_revisions`, `notification_user_prefs`, `notification_telegram_links`, `notification_outbox` |
