# Платформа LLM (OpenAI + Google Gemini)

Спільний шар для викликів LLM у Backoffice: ключі, моделі за замовчуванням, провайдери, підказки цін з офіційних джерел.

Перший споживач: **Chatwoot Agent Bot v1** (`ChatwootBotLlmRunner` → `llmService`).

## UI і API

| Що | Де |
|----|-----|
| Налаштування | **Налаштування → LLM** (`/settings/llm`, admin) |
| GET/PUT | `/api/llm/settings` |
| Список моделей | `GET /api/llm/models/:provider` (`openai` \| `google`) |
| Чернетка ключа | `POST /api/llm/models/:provider` body `{ "apiKey": "..." }` |

У dropdown моделей показується **pricingHint** (USD / 1M tokens), якщо вдалося підтягнути офіційні ціни.

## Зберігання

- БД: `settings_base.key = llm_platform_settings`, category `llm`.
- Env fallback (якщо в БД порожньо):
  - `LLM_OPENAI_API_KEY`
  - `LLM_GOOGLE_API_KEY`
  - `LLM_DEFAULT_PROVIDER` — `openai` \| `google`

Порожнє поле API key при **Зберегти** не затирає вже збережений ключ (як у Chatwoot). Очистити: `clearOpenaiApiKey` / `clearGoogleApiKey` у PUT.

Дефолти типів: `shared/types/llm.ts` (`DEFAULT_LLM_PLATFORM_SETTINGS`).

## Сервіси

| Шлях | Роль |
|------|------|
| `server/services/llm/LlmService.ts` | `complete`, `completeWithTools` (tool loop до 8 ітерацій) |
| `server/services/llm/LlmSettingsService.ts` | CRUD налаштувань |
| `server/services/llm/LlmModelsService.ts` | `models.list` (OpenAI SDK, Gemini REST) + pricing hints |
| `server/services/llm/providers/openaiLlmProvider.ts` | OpenAI chat + tools |
| `server/services/llm/providers/googleLlmProvider.ts` | `@google/genai` + aliases моделей |
| `server/services/llm/LlmOpenAiOfficialPricingService.ts` | Парсинг `developers.openai.com/api/docs/pricing.md` (кеш 6 год) |
| `server/services/llm/LlmGoogleOfficialPricingService.ts` | Парсинг HTML `ai.google.dev/gemini-api/docs/pricing`, tier **Standard / Paid** (кеш 6 год) |
| `shared/constants/googleLlmModelAliases.ts` | Підміна застарілих id Gemini перед API (напр. `gemini-2.5-flash-lite` → `gemini-3.5-flash-lite`) |

Помилки Google GenAI у `LlmService` нормалізуються через `googleLlmProviderError.ts` (текст з `error.message` у JSON, без сирого `ApiError: {...}`).

## Ціни в UI

- **OpenAI:** markdown `pricing.md`, `pricingSource: openai_official_docs`.
- **Gemini:** немає цін у `models.list`; hints з HTML pricing-сторінки, `pricingSource: google_official_docs`.
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
