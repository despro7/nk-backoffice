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

## Права ролей

Ключі `action.notify.<group>.<level>.<channel>`, `channel` = `app` | `tg`, у `role_permissions`.
Міграція `20261108120000_notification_rules` видає всім ролям, крім admin, `error` і `warning` усіх груп у застосунку, плюс `success` для складу й товарів (поведінка як до редизайну). Telegram вимкнено.

## Файли

| Шар | Файли |
|-----|-------|
| Константи | `shared/constants/notifications.ts` |
| Типи | `shared/types/notificationRules.ts`, `shared/types/notifications.ts` |
| Рушій | `shared/notifications/ruleEngine.ts` (+ spec), `shared/notifications/defaultRules.ts` |
| Сервер | `server/modules/Notifications/{NotificationConfigService,NotificationFeedService,notificationFeed}.ts` (+ spec), `server/routes/notifications.ts` |
| БД | `notification_rules`, `notification_glossary`, `notification_config_revisions` |
