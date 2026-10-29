# Chatwoot Agent Bot (Backoffice v0)

Міст між **Chatwoot Agent Bot** (self-hosted) і Backoffice NK Food.

**v0:** handover, reclaim, аналітика.

**v1:** патерни автовідповідей, fallback, **LLM** (маски + `llmService`), публічний каталог вітрини, статус замовлення **лише після backend verify** (телефон + номер замовлення **або** телефон + дата останнього замовлення). API tools **без PII** у відповіді.

Офіційна довідка Chatwoot: [Application API](https://developers.chatwoot.com/api-reference/introduction), [Agent bots](https://chatwoot.help/hc/user-guide/articles/1677497472-how-to-use-agent-bots).

## UI в Backoffice

| Розділ | URL |
|--------|-----|
| Статистика | `/chatwoot-bot/statistics` |
| Налаштування | `/chatwoot-bot/settings` |

Старий шлях `/settings/chatwoot-bot` перенаправляється на `/chatwoot-bot/settings`.

**Налаштування (таби + hash):** `/chatwoot-bot/settings#tab=ai` — ключі `connection` | `replies` | `ai` | `handover` | `journal` (для «Підключення» hash порожній). Компоненти: `client/pages/ChatwootBotSettings/` (`SettingsChatwootBot.tsx` — re-export).

Перемикання табів пише hash через **`navigate` (push)**, тому **Back/Forward** браузера відновлюють вкладку (`useUrlHashSync` без `replace`).

## Після створення бота в Chatwoot (вікно «Ключ доступу»)

Chatwoot показує два значення **один раз** (їх можна знайти пізніше в налаштуваннях бота). Куди їх класти в Backoffice → **Chatwoot Bot → Налаштування**:

| У вікні Chatwoot | Поле в Backoffice | Навіщо |
|------------------|-------------------|--------|
| **Access Token** | **API Access Token** | Для **live** (echo, handover, reclaim): **токен Agent Bot** з цього вікна. Header `api_access_token`. |
| **Webhook Secret** | **Webhook Secret** | Ключ для перевірки webhook (зараз – plain header `X-Chatwoot-Webhook-Secret`; HMAC – у наступній ітерації). У UI маскується. Очистити: іконка кошика або `PUT` з `{ "clearWebhookSecret": true }`. |

Окремо в Chatwoot (колонка **URL вебхуку** / Outgoing URL при створенні бота):

```text
https://<публічний-хост-backoffice>/api/webhooks/chatwoot
```

У BO поле **Outgoing URL hint** – лише **підказка для адміна** (той самий URL для копіювання); код його **не читає**. Кнопка **Тест Outgoing URL** шле probe на webhook (маркер у content, без echo клієнту).

**Account ID** у BO – **ID акаунту** Chatwoot (`/app/accounts/1/...`), не ID бота.

**User PAT (Inbox API token)** – Personal Access Token користувача Chatwoot. Потрібен для списку агентів, робочих годин inbox і reclaim (offline / таймаути мовчання). Agent Bot token для цього часто недостатній.

## Потік даних

1. Chatwoot надсилає події (наприклад `message_created`) на **POST** `/api/webhooks/chatwoot`.
2. Orchestrator відфільтровує outgoing / private / повідомлення агента (з опційним debug-журналом).
3. Якщо діалог у людини-assignee і **reclaim** увімкнено – перевірка offline / поза годинами / таймаут мовчання (`chatwootReclaimDecision.ts`).
4. Handover-keyword у тексті клієнта → assign / open + unassign за режимом (`specific_agent` | `auto_inbox`).
5. Інакше → **ReplyRouter**: backend verify з тексту → патерни → LLM (tools) → fallback (`live` / `dry_run`).
6. Події аналітики пишуться в `chatwoot_bot_analytics_events` (окремо від журналу webhook).

На **«Вирішити»** (за налаштуванням): unassign + скидання custom attribute `bot_human_handover_active`.

## HTTP API (Backoffice)

| Метод | Шлях | Призначення |
|--------|------|-------------|
| GET | `/api/webhooks/chatwoot/health` | Healthcheck |
| POST | `/api/webhooks/chatwoot` | Webhook від Chatwoot |
| GET/PUT | `/api/chatwoot-bot/settings` | Налаштування; `clearWebhookSecret: true` очищає secret |
| POST | `/api/chatwoot-bot/test-connection` | Перевірка токена |
| POST | `/api/chatwoot-bot/probe-outgoing-webhook` | Probe Outgoing URL (admin) |
| GET | `/api/chatwoot-bot/webhook-processor-health` | Діагностика процесора |
| GET | `/api/chatwoot-bot/agents` | Агенти (User PAT) |
| GET | `/api/chatwoot-bot/inbox-schedule` | Робочі години inbox |
| POST | `/api/chatwoot-bot/conversations/:id/unassign` | Ручний unassign (admin) |
| GET | `/api/chatwoot-bot/recent-events` | Журнал `chatwoot_bot_webhook_logs` |
| GET | `/api/chatwoot-bot/analytics/overview` | Агрегати за період (`from`, `to`) |
| POST | `/api/chatwoot-bot/tools/catalog` | Каталог вітрини (публічно) |
| POST | `/api/chatwoot-bot/tools/site-pages` | Текст публічних сторінок сайту (WP REST → HTML fallback, кеш 6 год) |
| POST | `/api/chatwoot-bot/tools/verify-order` | Verify: `{ phone, orderNumber }` → DTO без PII |
| POST | `/api/chatwoot-bot/tools/verify-by-date` | Verify: `{ phone, lastOrderDate }` |
| POST | `/api/chatwoot-bot/ai/test` | Тест LLM (admin); помилки провайдера **не** маскуються fallback |
| GET/PUT | `/api/llm/settings` | Глобальні ключі/моделі OpenAI + Gemini |
| UI | `/settings/llm` | Налаштування → **LLM** (admin) |

Деталі LLM (ключі, ціни, aliases Gemini): [llm-platform.md](../features/llm-platform.md).

Симуляція webhook через `POST /simulate` **видалена** (раніше dev/admin); тести оркестратора викликають `processWebhook` напряму з fixtures.

### Verify і замовлення (v1)

- Клієнт у чаті може підтвердити себе **телефон + номер замовлення** або **телефон + дата останнього замовлення** (парсинг дат у `chatwootBotVerifyDateParse.ts`).
- Стан сесії verify зберігається в `conversation.custom_attributes` (TTL і rate limit у налаштуваннях бота).
- Tool `get_verified_order` для LLM повертає **лише** redacted DTO після успішного verify (`chatwootBotOrderRedaction.ts`); телефон у tool-аргументах не приймається.
- Admin-тести: **Тест verify** / **Тест AI** на сторінці налаштувань бота.

### LLM у боті

- Ключі й дефолтна модель — з **глобальних** LLM-налаштувань; у боті можна перевизначити `aiProvider` / `aiModel` (порожнє = платформа).
- **Маски** (`aiMasks`, `aiMaskId`): system prompt; без prompt LLM не викликається.
- Tools у циклі: `get_storefront_catalog` (SKU-каталог BO; пошук за назвою — `textMatchesCatalogQuery`, порядок слів неважливий), `get_storefront_site_pages` (сторінки WordPress сайту, кеш **6 год**), `get_verified_order` (після verify).
- На вкладці **AI і verify** — довідник tools з описом, прикладами JSON і admin-тестами API.
- У проді webhook при збої LLM → **fallback**; `POST /ai/test` пробрасує помилку провайдера в відповідь API.

## Налаштування

- БД: `settings_base.key = chatwoot_bot_settings`.
- Env fallback: `CHATWOOT_BASE_URL`, `CHATWOOT_API_ACCESS_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_WEBHOOK_SECRET`.
- **replyMode:** `dry_run` – без POST у Chatwoot; `live` – реальні виклики API.
- **Reclaim** (права колонка UI): групи «Завжди / поза робочими годинами / у робочі години», тексти клієнту, `reclaimContinueWithEcho`, `resolveCleanupEnabled`.
- **Журнал webhook:** `eventLogRetentionDays`, `eventLogMaxRecords`, `eventLogStoreFullPayload`, debug-флаги для private/noise.
- **Секрети в UI:** порожнє поле токена/secret при «Зберегти» **не** затирає збережене значення.

### Журнал «Останні події» (UI)

- Список з `chatwoot_bot_webhook_logs`.
- Рядок: результат (`action`, `reason`, conv, preview) + діагностика заголовків (`auth: hmac|plain_secret|unsigned|unknown`).
- Джерело `simulate` у старих записах можливе; нові події – `webhook`.

### Webhook Secret (обмеження v0)

Якщо в BO задано **Webhook Secret**, endpoint очікує header `X-Chatwoot-Webhook-Secret` з **точним збігом**.

У новіших Chatwoot часто **HMAC** (`X-Chatwoot-Signature`). Поки немає HMAC у BO – для першого підключення secret можна лишити порожнім, інакше **401**.

## Локальна розробка

```bash
npm run dev:chatwoot
```

SSH-тунель до БД + Vite `:8080` + `cloudflared` (стабільний URL – див. `config/cloudflared/README.md`).

Chatwoot на VPS не достукаться до `localhost` – потрібен tunnel або staging. **dry_run** дозволяє перевіряти логіку без POST у Chatwoot.

## БД

| Міграція | Таблиця |
|----------|---------|
| `20261012120000_chatwoot_bot_webhook_logs` | `chatwoot_bot_webhook_logs` |
| `20261018120000_chatwoot_bot_analytics_events` | `chatwoot_bot_analytics_events` |

Після деплою: `npm run db:migrate:prod` і `npm run db:generate`.

## Код

| Шлях | Роль |
|------|------|
| `server/modules/ChatwootBot/ChatwootBotOrchestrator.ts` | Webhook pipeline, handover, reclaim, resolve cleanup |
| `server/modules/ChatwootBot/ChatwootBotReplyRouter.ts` | verify → патерни → LLM → fallback |
| `server/modules/ChatwootBot/ChatwootBotPatternMatcher.ts` | Правила автовідповідей |
| `server/modules/ChatwootBot/ChatwootBotVerifyService.ts` | Backend verify (телефон + order/date) |
| `server/modules/ChatwootBot/ChatwootBotLlmRunner.ts` | Маска + tool loop через `llmService` |
| `server/modules/ChatwootBot/ChatwootBotCatalogToolService.ts` | Каталог для tool |
| `server/modules/ChatwootBot/ChatwootBotStorefrontSiteToolService.ts` | Сторінки сайту (WP REST / HTML, TTL 6 год) |
| `shared/constants/chatwootBotLlmTools.ts` | Метадані LLM tools (runner + UI) |
| `server/modules/ChatwootBot/ChatwootBotOrderToolService.ts` | Verified order для tool |
| `server/modules/ChatwootBot/chatwootReclaimDecision.ts` | Правила reclaim |
| `server/modules/ChatwootBot/ChatwootBotAnalyticsService.ts` | Ingest + overview API |
| `server/modules/ChatwootBot/fixtures/` | Payload для unit-тестів |
| `server/routes/chatwoot-webhooks.ts` | Webhook |
| `server/routes/chatwoot-bot.ts` | Admin API + tools + ai/test |
| `server/routes/llm.ts` | Платформа LLM |
| `client/pages/ChatwootBotSettings/` | Налаштування бота (таби, hash) |
| `client/pages/SettingsChatwootBot.tsx` | Re-export модуля ChatwootBotSettings |
| `client/pages/SettingsLlm.tsx` | Глобальні LLM |
| `client/components/llm/LlmModelAutocomplete.tsx` | Autocomplete моделей + pricing hint |
| `client/pages/ChatwootBotStatistics.tsx` | Статистика |
| `shared/types/chatwootBot.ts` | Типи і дефолти бота |
| `shared/types/chatwootBotTools.ts` | DTO tools (без PII) |
| `shared/types/llm.ts` | Типи платформи LLM |

Тести: `ChatwootBotOrchestrator.spec.ts`, `ChatwootBotPatternMatcher.spec.ts`, `ChatwootBotStorefrontSiteToolService.spec.ts`, `chatwootBotOrderRedaction.spec.ts`, `chatwootBotVerifyDateParse.spec.ts`, `shared/utils/catalogNameQueryMatch.spec.ts`, сервіси в `server/services/llm/*.spec.ts`.
