# Платформа LLM (OpenAI + Google Gemini + OpenRouter + TypeSafe Jev)

Спільний шар для викликів LLM у Backoffice: ключі, моделі за замовчуванням, провайдери, підказки цін з офіційних джерел.

Споживачі: **Chatwoot Agent Bot v1** (`ChatwootBotLlmRunner` → `llmService`), теми питань бота (TypeSafe Jev).

## UI і API

| Що | Де |
|----|-----|
| Налаштування | **Налаштування → LLM** (`/settings/llm`, admin); таби **Провайдери** і **Витрати і баланси** (`#tab=usage`) |
| GET/PUT | `/api/llm/settings` |
| Список моделей | `GET /api/llm/models/:provider` (`openai` \| `google` \| `openrouter`) |
| Чернетка ключа | `POST /api/llm/models/:provider` body `{ "apiKey": "..." }` |
| Тест моделі | `POST /api/llm/test-model/:provider` body `{ "model": "...", "apiKey"?: "..." }` — короткий completion |
| Тест Jev | `POST /api/llm/typesafe/test` body `{ "apiKey"?, "model"? }` — класифікація прикладу питання |
| Витрати | `GET /api/llm/usage?days=7\|30` — агрегати журналу `llm_usage_log` |
| Баланси | `GET /api/llm/balances?refresh=true` — баланси провайдерів (кеш 5 хв) |

Таб **Провайдери:** OpenAI, Google Gemini, OpenRouter — одна картка-accordion з логотипами (`public/icons/llm/`) і підзаголовком «ключ · модель»; під нею картка TypeSafe Jev; праворуч кольори цін і провайдер за замовчуванням.

У dropdown моделей показується **pricingHint** (USD / 1M tokens), якщо вдалося підтягнути офіційні ціни. У **Тест моделі** та **Тест AI** (Chatwoot) у meta можуть бути usage + оцінка вартості (`shared/utils/llmUsageCostEstimate.ts`, enrichment у `llmUsageCostEnrichment.ts`).

Каталог моделей фільтрується (`shared/constants/llmModelCatalogFilter.ts`) — приховуються deprecated aliases Gemini тощо.

## Зберігання

- БД: `settings_base.key = llm_platform_settings`, category `llm`.
- Env fallback (якщо в БД порожньо):
  - `LLM_OPENAI_API_KEY`
  - `LLM_GOOGLE_API_KEY`
  - `LLM_OPENROUTER_API_KEY`
  - `LLM_OPENROUTER_BASE_URL` — за замовч. `https://openrouter.ai/api/v1`; для EU in-region: `https://eu.openrouter.ai/api/v1` (потрібен Business/Enterprise)
  - `LLM_OPENROUTER_HTTP_REFERER`, `LLM_OPENROUTER_APP_TITLE` — опційно для OpenRouter rankings
  - `LLM_DEFAULT_PROVIDER` — `openai` \| `google` \| `openrouter`
  - `LLM_TYPESAFE_API_KEY` — TypeSafe Jev (лише джерело `typesafe`)
  - `LLM_OPENAI_ADMIN_KEY` — OpenAI Admin key (`sk-admin-…`), лише для витрат організації

Порожнє поле API key при **Зберегти** не затирає вже збережений ключ (як у Chatwoot). Очистити: `clearOpenaiApiKey` / `clearGoogleApiKey` / `clearOpenrouterApiKey` / `clearTypesafeApiKey` / `clearOpenaiAdminKey` у PUT.

Інші поля: `typesafeSource` (`openrouter` \| `typesafe`, дефолт `openrouter`), `typesafeModel` (дефолт `jev-latest`), `typesafeInputPricePer1M` (USD за 1M input tokens для прямого TypeSafe; 0 — невідомо).

Дефолти типів: `shared/types/llm.ts` (`DEFAULT_LLM_PLATFORM_SETTINGS`).

## Сервіси

| Шлях | Роль |
|------|------|
| `server/services/llm/LlmService.ts` | `complete`, `completeWithTools` (tool loop до 8 ітерацій) |
| `server/services/llm/llmPlatformResolve.ts` | Вибір провайдера/ключа (platform vs override, env/БД) |
| `server/services/llm/LlmSettingsService.ts` | CRUD налаштувань |
| `server/services/llm/LlmModelsService.ts` | `models.list` (OpenAI SDK, Gemini REST) + pricing hints |
| `server/services/llm/providers/openaiLlmProvider.ts` | OpenAI chat + tools |
| `server/services/llm/providers/googleLlmProvider.ts` | `@google/genai` + aliases моделей |
| `server/services/llm/providers/openRouterLlmProvider.ts` | OpenAI SDK + `baseURL` OpenRouter, Chat Completions + tools |
| `shared/constants/openRouterConfig.ts` | Base URL і заголовки OpenRouter |
| `server/services/llm/LlmOpenAiOfficialPricingService.ts` | Парсинг `developers.openai.com/api/docs/pricing.md` (кеш 6 год) |
| `server/services/llm/LlmGoogleOfficialPricingService.ts` | Парсинг HTML `ai.google.dev/gemini-api/docs/pricing`, tier **Standard / Paid** (кеш 6 год) |
| `shared/constants/googleLlmModelAliases.ts` | Підміна недоступних Gemini id перед API + приховування їх у каталозі (напр. `gemini-2.5-flash-lite` → `gemini-3.5-flash-lite`) |
| `server/services/llm/openaiCompatibleChat.ts` | Спільний шар Chat Completions (OpenAI + OpenRouter) |
| `shared/constants/llmProviders.ts` | Константи провайдерів для UI/API |
| `server/services/llm/typesafeJevClient.ts` | TypeSafe Jev `POST /v1/systemone`, питання `choice` (до 255 варіантів, timeout 20 с) |
| `server/services/llm/LlmUsageLogService.ts` | Запис у `llm_usage_log` (fire-and-forget), підсумок, очистка |
| `server/services/llm/llmUsageSummary.ts` | Агрегація журналу (провайдер / функція / модель / день за Києвом), вартість Jev |
| `server/services/llm/LlmBalancesService.ts` | Баланси OpenRouter і витрати OpenAI (кеш 5 хв) |
| `client/components/llm/LlmUsageCard.tsx` | Таб «Витрати і баланси» |

Помилки Google GenAI у `LlmService` нормалізуються через `googleLlmProviderError.ts` (текст з `error.message` у JSON, без сирого `ApiError: {...}`).

## TypeSafe Jev

Швидкий класифікатор (не chat-модель): `POST {base}/systemone`, Bearer-ключ, питання типу `choice` → `choice`, `confidence`, `probabilities`. Платні лише input tokens. Використовується для тем питань чат-бота — див. [chatwoot-agent-bot.md](../integrations/chatwoot-agent-bot.md#теми-питань-статистика).

Джерело — `typesafeSource` (`resolveJevConnection` у `typesafeJevClient.ts`):

| Джерело | Base URL | Ключ | Вартість у журналі |
|---------|----------|------|--------------------|
| `openrouter` (дефолт) | `{LLM_OPENROUTER_BASE_URL}` → `https://openrouter.ai/api/v1/systemone` | ключ OpenRouter | `usage.cost` з відповіді |
| `typesafe` | `https://api.typesafe.ai/v1/systemone` | `typesafeApiKey` / `LLM_TYPESAFE_API_KEY` | input tokens × `typesafeInputPricePer1M` |

Формат запиту й відповіді однаковий ([OpenRouter: TypeSafe SDK](https://openrouter.ai/docs/guides/community/typesafe-sdk)); OpenRouter мапить `jev-latest` на `~typesafe/jev-latest` і повертає фактичну версію в `model`. `jevApiKeyReady` у відповіді налаштувань — чи є ключ для обраного джерела.

Картка в табі **Провайдери**: перемикач джерела; для TypeSafe напряму — ключ і ціна за 1M input; модель; кнопка **Тест Jev** (бере джерело з форми, до збереження).

## Витрати і баланси

**Журнал `llm_usage_log`** (міграція `20261031120000_llm_usage_log`): `provider` (`openai` \| `google` \| `openrouter` \| `typesafe`), `model`, `feature`, `inputTokens`, `outputTokens`, `apiCalls`, `costUsd` (null — ціна невідома), `ok`, `error`.

- Пишуть: `LlmService.complete` / `completeWithTools` (і при помилці — з токенами, накопиченими до збою), тест моделі (`LlmModelsService.testModel`), `jevClassifyChoice` з параметром `usage`.
- `feature`: `chatwoot_bot_reply`, `topics_jev`, `llm_test`, `jev_test`, `other` (дефолт, якщо в `LlmCompletionRequest` немає `feature`).
- Вартість: `estimatedCostUsd` з usage (OpenRouter `usage.cost` або офіційні ціни OpenAI/Gemini); Jev — `usage.cost` від OpenRouter, для прямого TypeSafe — input tokens × `typesafeInputPricePer1M`.
- Записи старші за 365 днів видаляє cron щодня о 04:15 (`startLlmUsageLogCleanup`, лише прод).

**Баланси:**

| Провайдер | Джерело |
|-----------|---------|
| OpenRouter | `GET {base}/credits` (кредити акаунта); якщо ключ без доступу — `GET {base}/key` (ліміт ключа) |
| OpenAI | Лише з Admin key: `GET /v1/organization/costs` — витрати організації за 30 днів. Балансу API не віддає |
| Google Gemini, TypeSafe | API балансу немає — лише наші витрати з журналу (Jev через OpenRouter списується з кредитів OpenRouter) |

Таб **Витрати і баланси:** перемикач 7 / 30 днів, підсумки (USD, виклики, tokens), графік по днях, таблиці по провайдерах / функціях / топ-10 моделях, баланси; кнопка оновлення бере баланси без кешу.

## Ціни в UI

- **OpenAI:** markdown `pricing.md`, `pricingSource: openai_official_docs`.
- **Gemini:** немає цін у `models.list`; hints з HTML pricing-сторінки (`?hl=en`, парсинг `<code>`), `pricingSource: google_official_docs`.
- **OpenRouter:** `GET {base}/models`, `pricingSource: openrouter_api` (поля pricing з каталогу API).
- Якщо парсер недоступний або моделі немає на сторінці — `pricingHint: null` (лише id з API).

## Типові помилки Gemini

| Код / текст | Що робити |
|-------------|-----------|
| 404, модель недоступна новим користувачам | Оновити модель у LLM / боті; перевірити `GOOGLE_LLM_MODEL_ALIASES` |
| 403 `Your project has been denied access` | Блокування проєкту/ключа в Google; новий ключ у AI Studio або GCP + billing; тимчасово OpenAI |
| Missing API key | **Налаштування → LLM** або env |

## Тести

- `server/services/llm/LlmService.spec.ts`
- `server/services/llm/LlmOpenAiOfficialPricingService.spec.ts`
- `server/services/llm/LlmGoogleOfficialPricingService.spec.ts`
- `shared/constants/googleLlmModelAliases.spec.ts`
- `server/services/llm/llmUsageSummary.spec.ts`

## Залежності

- `openai` (офіційний SDK)
- `@google/genai`
