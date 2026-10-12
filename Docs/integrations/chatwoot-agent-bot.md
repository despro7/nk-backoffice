# Chatwoot Agent Bot (Backoffice v0)

Міст між **Chatwoot Agent Bot** (self-hosted) і Backoffice NK Food.

**v0:** echo-відповідь + handover за ключовими словами. Без LLM і без lookup замовлень.

Офіційна довідка Chatwoot: [Application API](https://developers.chatwoot.com/api-reference/introduction), [Agent bots](https://chatwoot.help/hc/user-guide/articles/1677497472-how-to-use-agent-bots).

## Після створення бота в Chatwoot (вікно «Ключ доступу»)

Chatwoot показує два значення **один раз** (їх можна знайти пізніше в налаштуваннях бота). Куди їх класти в Backoffice → **Налаштування → Chatwoot Bot** (`/settings/chatwoot-bot`):

| У вікні Chatwoot | Поле в Backoffice | Навіщо |
|------------------|-------------------|--------|
| **Access Token** | **API Access Token** | Для **live** (echo, handover): саме **токен Agent Bot** з цього вікна. Альтернатива — Personal Access Token з профілю **користувача** Chatwoot (ширші права; для v0 не обов’язковий). Header `api_access_token`. |
| **Webhook Secret** | **Webhook Secret** | Ключ для перевірки webhook (зараз — plain header `X-Chatwoot-Webhook-Secret`; HMAC — у наступній ітерації). У UI маскується. Очистити збережене: іконка кошика в полі або `PUT` з `{ "clearWebhookSecret": true }`. |

Окремо в Chatwoot (колонка **URL вебхуку** / Outgoing URL при створенні бота):

```text
https://<публічний-хост-backoffice>/api/webhooks/chatwoot
```

У BO поле **Outgoing URL hint** — лише **підказка для адміна** (той самий URL для копіювання); код його **не читає** і в Chatwoot не підставляє.

**Account ID** у BO — це **ID акаунту** Chatwoot (`/app/accounts/1/...`), не ID бота. На self-hosted часто `1`.

## Потік даних

1. Chatwoot надсилає події (наприклад `message_created`) на **POST** `/api/webhooks/chatwoot`.
2. Orchestrator відфільтровує outgoing / private / повідомлення агента.
3. Handover-keyword у тексті → `toggle_status` (open) + unassign (у `live`).
4. Інакше → echo у діалог (`live`) або лише лог (`dry_run`).

## HTTP API (Backoffice)

| Метод | Шлях | Призначення |
|--------|------|-------------|
| GET | `/api/webhooks/chatwoot/health` | Healthcheck |
| POST | `/api/webhooks/chatwoot` | Webhook від Chatwoot |
| POST | `/api/webhooks/chatwoot/simulate` | Симуляція (dev без JWT; prod — admin) |
| GET/PUT | `/api/chatwoot-bot/settings` | Налаштування; `clearWebhookSecret: true` очищає збережений secret |
| POST | `/api/chatwoot-bot/test-connection` | Перевірка токена: профіль/inboxes (користувач) або розпізнавання Agent Bot |
| GET | `/api/chatwoot-bot/recent-events` | Останні події з таблиці `chatwoot_bot_webhook_logs` |

## Налаштування

- БД: `settings_base.key = chatwoot_bot_settings`.
- Env fallback: `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_WEBHOOK_SECRET`.
- **replyMode:** `dry_run` — без POST у Chatwoot; `live` — реальні виклики API.
- **Журнал webhook:** `eventLogRetentionDays` (TTL), `eventLogMaxRecords` (cap N), `eventLogStoreFullPayload` (опційно повний JSON, ~64 KB max). Очищення після insert + cron 04:30.
- **Секрети в UI:** порожнє поле **API Access Token** / **Webhook Secret** при «Зберегти» **не** змінює вже збережене значення (захист від випадкового стирання). Нове значення — ввести текст і зберегти.

### Журнал «Останні події» (UI)

- Один список з БД (`chatwoot_bot_webhook_logs`), не два окремі таби.
- Кожен рядок: результат обробки (`action`, `reason`, conv, preview) + **діагностика заголовків** (`auth: hmac|plain_secret|unsigned|unknown`) без значень signature/secret.
- Якщо увімкнено **Повний JSON payload** — під рядком показується збережений JSON (те саме поле `payloadJson` у БД).

### Webhook Secret (обмеження v0)

Якщо в BO задано **Webhook Secret**, endpoint очікує header `X-Chatwoot-Webhook-Secret` з **точним збігом** значення.

У новіших версіях Chatwoot для agent bot часто використовується **підпис HMAC** (`X-Chatwoot-Signature`, `X-Chatwoot-Timestamp`), а не цей header. Поки в BO немає перевірки HMAC:

- для **першого підключення** можна **залишити Webhook Secret у BO порожнім** (перевірка вимкнена), або
- реалізувати HMAC у наступній ітерації й тоді зберігати secret з вікна Chatwoot.

Якщо secret у BO заданий, а Chatwoot шле лише HMAC — webhook отримає **401**.

## Локальна розробка

- Симуляція з UI або `POST /api/webhooks/chatwoot/simulate` з `{ "fixture": "echo" | "handover" }`.
- **Access Token** не потрібен для `dry_run` + симуляції.
- Chatwoot на VPS не достукаться до `localhost` — потрібен публічний URL (staging / tunnel) або лише симуляція.

## БД

- Міграція `20261012120000_chatwoot_bot_webhook_logs` — таблиця `chatwoot_bot_webhook_logs`.
- Після деплою: `npm run db:migrate:prod` і `npm run db:generate` на сервері збірки, якщо потрібно.

## Код

| Шлях | Роль |
|------|------|
| `server/modules/ChatwootBot/` | Orchestrator, API client, settings, event log, webhook utils, fixtures |
| `server/routes/chatwoot-webhooks.ts` | Webhook + simulate |
| `server/routes/chatwoot-bot.ts` | Admin API |
| `shared/types/chatwootBot.ts` | Типи і дефолти |

Тести: `server/modules/ChatwootBot/ChatwootBotOrchestrator.spec.ts`.
