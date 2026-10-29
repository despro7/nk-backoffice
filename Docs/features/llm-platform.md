# Платформа LLM (OpenAI + Google Gemini + OpenRouter)

Спільний шар для викликів LLM у Backoffice: ключі, моделі за замовчуванням, провайдери, підказки цін з офіційних джерел.

Перший споживач: **Chatwoot Agent Bot v1** (`ChatwootBotLlmRunner` → `llmService`).

## UI і API

| Що | Де |
|----|-----|
| Налаштування | **Налаштування → LLM** (`/settings/llm`, admin) |
| GET/PUT | `/api/llm/settings` |
| Список моделей | `GET /api/llm/models/:provider` (`openai` \| `google` \| `openrouter`) |
| Чернетка ключа | `POST /api/llm/models/:provider` body `{ "apiKey": "..." }` |
| Тест моделі | `POST /api/llm/test-model/:provider` body `{ "model": "...", "apiKey"?: "..." }` — короткий completion |

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

Порожнє поле API key при **Зберегти** не затирає вже збережений ключ (як у Chatwoot). Очистити: `clearOpenaiApiKey` / `clearGoogleApiKey` / `clearOpenrouterApiKey` у PUT.

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

Помилки Google GenAI у `LlmService` нормалізуються через `googleLlmProviderError.ts` (текст з `error.message` у JSON, без сирого `ApiError: {...}`).

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

## Залежності

- `openai` (офіційний SDK)
- `@google/genai`
