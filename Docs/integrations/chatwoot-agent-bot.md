# Chatwoot Agent Bot (Backoffice v0)

Міст між **Chatwoot Agent Bot** (self-hosted) і Backoffice NK Food.

**v0:** handover, reclaim, аналітика.

**v1:** патерни автовідповідей, fallback, **LLM** (маски + `llmService`), публічний каталог вітрини, статус замовлення **лише після backend verify** (телефон + номер замовлення **або** телефон + дата останнього замовлення). API tools **без PII** у відповіді.

Офіційна довідка Chatwoot: [Application API](https://developers.chatwoot.com/api-reference/introduction), [Agent bots](https://chatwoot.help/hc/user-guide/articles/1677497472-how-to-use-agent-bots).

## UI в Backoffice

| Розділ | URL |
|--------|-----|
| Статистика | `/chatwoot-bot/statistics` |
| Діалоги бота | `/chatwoot-bot/dialogs` |
| База знань | `/chatwoot-bot/knowledge` |
| Налаштування | `/chatwoot-bot/settings` |

Старий шлях `/settings/chatwoot-bot` перенаправляється на `/chatwoot-bot/settings`.

**Налаштування (таби + hash):** `/chatwoot-bot/settings#tab=operator` — ключі `connection` | `ai` | `replies` | `operator` | `orders` | `topics` | `sandbox` | `journal` (для «Підключення» hash порожній; старі `handover` → `operator`, `cancel` → `orders`). Компоненти: `client/pages/ChatwootBotSettings/` — вкладки в `tabs/`, картки в `cards/` (`SettingsCard` + картки за темою), `SettingsChatwootBot.tsx` — re-export.

| Вкладка | Картки |
|---------|--------|
| Підключення | Діагностика вебхука (лише тут) · Chatwoot (URL, Account, токени, Webhook Secret, Outgoing URL) · Стан бота (увімкнено, «Тестовий режим (dry_run)», dev-webhook, перевірка зʼєднання) · Telegram для сповіщень |
| AI | Маска і модель (system prompt) · довідник інструментів LLM · Інструкції для AI |
| Сценарії | Конструктор сценаріїв для запитів на дію |
| Відповіді | Патерни (автовідповіді) · Fallback |
| Оператор | Зверху спільне: Виклик оператора (ключові слова, призначення) · Робочі години (розклад inbox по днях, «зараз», відлік до початку / кінця зміни, оновлення щохвилини). Нижче вкладки станів: **Робочі години** (тексти клієнту) · **Поза годинами** (тексти й збір контактів, Telegram; Екстрений виклик) · **Reclaim**; вкладка поточного стану позначена «зараз» і відкривається першою |
| Замовлення й клієнти | Верифікація · Тест верифікації · Скасування · Сповіщення про скасування · Профіль контакту |
| Теми питань / Пісочниця / Журнал | без змін |

**Збереження:** форма спільна для всіх вкладок; коли є незбережені зміни, внизу зʼявляється панель «Є незбережені зміни · Скасувати · Зберегти» (лише з правом `settingsManage`).

**Права (група «Чат-бот»):** сторінки `pages.chatwoot.statistics` / `.knowledge` / `.settings`; дії `actions.chatwoot.knowledgeManage` (редагування бази знань), `.topicsManage` (ручне керування темами), `.settingsManage` (зміна налаштувань і тести). Seed — лише admin. Без `settingsManage` вкладки налаштувань відкриваються лише на перегляд.

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

1. Chatwoot надсилає події (наприклад `message_created`) на **POST** `/api/webhooks/chatwoot`. Endpoint **одразу** відповідає `200 { accepted: true }`, обробка йде у фоні: таймаут Chatwoot (~5 с) коротший за LLM-цикл, і без цього розмова переходить в `open` з активністю «Conversation was marked open by system due to an error with the agent bot». Порядок у межах розмови — черга `conversationWebhookQueue.ts`. Probe з налаштувань (маркер у content) чекає результат.
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
| GET | `/api/chatwoot-bot/analytics/overview` | Агрегати за період (`from`, `to`), теми питань, прогалини бази знань |
| POST | `/api/chatwoot-bot/analytics/topics` | Нова тема з обраних питань (`topicsManage`) |
| POST | `/api/chatwoot-bot/analytics/topics/questions` | Питання: `move` у тему / `noise` / `auto` (повернути алгоритму) |
| PATCH | `/api/chatwoot-bot/analytics/topics/:id` | Назва / опис теми |
| POST | `/api/chatwoot-bot/analytics/topics/:id/merge` | Злити теми в цю |
| DELETE | `/api/chatwoot-bot/analytics/topics/:id` | Видалити тему (`mode`: `reassign` \| `ignore`) |
| GET/POST | `/api/chatwoot-knowledge` | Список / нова стаття бази знань |
| PUT/DELETE | `/api/chatwoot-knowledge/:id` | Редагування / видалення статті (`knowledgeManage`) |
| POST | `/api/chatwoot-knowledge/search` | Тестовий пошук (як tool) |
| POST | `/api/chatwoot-knowledge/:id/questions` | Дописати формулювання в варіанти питань статті (`knowledgeManage`, без дублів, до ліміту) |
| POST | `/api/chatwoot-bot/tools/catalog` | Каталог вітрини (публічно) |
| POST | `/api/chatwoot-bot/tools/site-pages` | Текст публічних сторінок сайту (WP REST → HTML fallback, кеш 6 год) |
| POST | `/api/chatwoot-bot/tools/verify-order` | Verify: `{ phone, orderNumber }` → DTO без PII |
| POST | `/api/chatwoot-bot/tools/verify-by-date` | Verify: `{ phone, lastOrderDate }` |
| POST | `/api/chatwoot-bot/telegram/test` | Тестове сповіщення в Telegram (`settingsManage`) |
| POST | `/api/chatwoot-bot/sandbox/reply` | Хід бота в пісочниці (`settingsManage`) |
| GET/PUT | `/api/chatwoot-bot/sandbox/scenarios` | Сценарії пісочниці (PUT замінює список) |
| POST | `/api/chatwoot-bot/ai/test` | Тест LLM (admin); помилки провайдера **не** маскуються fallback |
| GET/PUT | `/api/llm/settings` | Глобальні ключі/моделі OpenAI, Gemini, OpenRouter, TypeSafe Jev |
| UI | `/settings/llm` | Налаштування → **LLM** (admin) |

Деталі LLM (ключі, ціни, aliases Gemini): [llm-platform.md](../features/llm-platform.md).

Симуляція webhook через `POST /simulate` **видалена** (раніше dev/admin); тести оркестратора викликають `processWebhook` напряму з fixtures.

### Verify і замовлення (v1)

- Клієнт у чаті може підтвердити себе **телефон + номер замовлення** або **телефон + дата останнього замовлення** (парсинг дат у `chatwootBotVerifyDateParse.ts`).
- Стан сесії verify зберігається в `conversation.custom_attributes` (TTL і rate limit у налаштуваннях бота).
- Tool `get_verified_order` для LLM повертає **лише** redacted DTO після успішного verify (`chatwootBotOrderRedaction.ts`); телефон у tool-аргументах не приймається.
- Admin-тест: **Тест verify** (вкладка «Замовлення й клієнти»); відповіді AI — у **Пісочниці**.

### LLM у боті

- Ключі й дефолтна модель — з **глобальних** LLM-налаштувань; у боті можна перевизначити `aiProvider` / `aiModel` (порожнє = платформа).
- **Маски** (`aiMasks`, `aiMaskId`): system prompt; без prompt LLM не викликається.
- Tools у циклі: `search_knowledge_base` (база знань, викликається першою для загальних питань), `get_storefront_catalog` (страви вітрини: назва, категорія, склад, короткий опис, ціна, наявність, `meatFree`, вага порції `weightGrams` і КБЖВ на 100 г `nutritionPer100g` з `productNutritionJson` (kcal, protein, fat, carbs, salt — якщо є); «білкові» / «протеїн» у запиті сортує за білком, «легкі» / «дієтичні» — за калорійністю (страви без КБЖВ тоді не показуються); пошук — `chatwootBotCatalogSearch.ts`: основи слів у назві/категорії/складі/описі з вагами, синоніми інгредієнтів («куркою» = «курятиною»), лише позиції з найбільшим покриттям слів запиту; «без мʼяса», «вегетаріанське», «пісне» — фільтр за складом), `get_storefront_site_pages` (сторінки WordPress сайту, кеш **6 год**), `get_verified_order` (після verify).
- **Екстрений виклик** (ключові слова `handoverEmergencyKeywords`, лише поза годинами): призначення оператора + `handoverMessageEmergency`, за `handoverEmergencyTelegramEnabled` — одразу Telegram. Далі таймер у памʼяті (`chatwootBotEmergencyWatch.ts`, `handoverEmergencyTimeoutMinutes`, дефолт 5): поки він іде, reclaim не спрацьовує (вночі оператор зазвичай «офлайн»). Не вдалося призначити або за таймаут немає публічної відповіді оператора — fallback: unassign, `handoverMessageEmergencyFallback`, `bot_ooh_callback_pending` + питання в `bot_callback_question`, приватна нотатка і повторний Telegram; далі звичайний збір контактів. Після рестарту сервера таймер зникає (розмова живе за правилами reclaim).
- **Поза годинами після `request_operator`** клієнт отримує `handoverMessageNoAnswerOutOfHours` (не `handoverMessageOutOfHours`, який для прохання «покличте оператора»): одразу просимо контакти. Питання клієнта зберігається в custom attribute `bot_callback_question`; коли клієнт лишає телефон — приватна нотатка з телефоном, імʼям контакту, повідомленням і питанням, а за `handoverCallbackTelegramEnabled` (дефолт увімк.) — те саме в Telegram. У робочі години клієнт отримує `handoverMessageNoAnswerInHours` (а не `handoverMessageInHours`, який для прохання «покличте оператора»), нотатка handover містить питання й тему.
- **Тип запиту `request_operator.kind`** визначає текст клієнту (`operatorHandoverMessage` у `shared/types/chatwootBot.ts`): `no_answer` — шукав і не знайшов (`handoverMessageNoAnswerInHours` / `…OutOfHours`); `action` — клієнт просить дію, яку бот не виконує: скасувати чи змінити замовлення, повернення (`handoverMessageActionInHours` / `…OutOfHours`); `human` — клієнт сам хоче людину (звичайні `handoverMessageInHours` / `…OutOfHours`). Тип пишеться в приватну нотатку оператору.
- `request_operator` — модель передає розмову людині (клієнт просить оператора або після пошуку відповіді немає). Текст моделі не надсилається: запускається той самий handover, що й за ключовим словом (у робочі години — assign + `handoverMessageInHours`, поза ними — пропозиція дзвінка).
- **Інструкції для AI** (вкладка AI → «Інструкції для AI»): реєстр `shared/constants/chatwootBotInstructions.ts` — обовʼязкові правила, описи інструментів (`tool.<name>`) і підказки (`hint`) у відповідях інструментів бази знань, статусу замовлення, верифікації, скасування й оператора, плюс службова примітка верифікації. У `settings.aiInstructions` зберігаються лише змінені тексти (невідомі ключі й стандартні значення відкидаються), код бере текст через `botInstruction(overrides, key)`. Пісочниця використовує незбережені зміни. Не редагуються назви інструментів і параметрів та значення на кшталт `kind`, `code`. Кожен запис має `usage` — коли бот отримує текст (показується в UI під назвою). `verify.*` — `hint` у відповіді `verify_customer`, коли інструмент викликала модель; `verifyNote.*` — службова примітка в system prompt (`buildVerifyResultNote`, `ChatwootBotReplyRouter`), коли код сам розпізнав і перевірив телефон / номер / дату з повідомлення клієнта ще до моделі (при `mismatch` інструмент повертає `verifyFailMessage` з налаштувань).
- **Правила поверх маски** (`buildReplyPolicy` у `chatwootBotConversationContext.ts`, тексти `policy.*` з реєстру, йдуть одразу після prompt маски): персонаж чоловічого роду; перед «не знаю» — база знань → сайт → каталог; оператор лише через `request_operator`. Маска їх не вимикає.
- **Контекст розмови** (службовий блок): дата за Києвом, стан verify, телефон, **робочі години зараз** (бот не обіцяє підключити оператора вночі).
- Поки триває LLM-цикл, бот вмикає typing indicator у віджеті (`toggle_typing_status`), після відповіді — вимикає (лише `live`).
- На вкладці **AI** — довідник tools з описом, прикладами JSON і admin-тестами API.
- У проді webhook при збої LLM → **fallback**; `POST /ai/test` пробрасує помилку провайдера в відповідь API.

### Скасування замовлення

Tool `request_order_cancellation` (лише коли `orderCancelEnabled`, дефолт **вимк.**; вкладка **«Замовлення й клієнти»**). Логіка — `ChatwootBotOrderCancelService.ts`, правила — `chatwootBotOrderCancelRules.ts`:

1. **Сувора перевірка:** телефон (з аргументу, збережений у розмові або з каналу) + прізвище та імʼя одержувача: щонайменше два слова, кожне є в `customerName` замовлення (порядок і регістр неважливі). Невдача не каже, що саме не збіглося; 3 невдачі за 30 хв — `rate_limited`, бот передає оператору.
2. **Кандидати:** замовлення телефону, крім Продаж / Відмова / Повернення / Видалений, з ПІБ, що збігся. Кілька — `choose_order` зі списком (номер, дата, статус, сума).
3. **Причина:** без `reason` — `reason_required`: бот питає причину й пропонує допомогу (склад, дата, адреса).
4. **За статусом:** `orderCancelAutoStatuses` (дефолт Новий, Підтверджено) — `updateSalesDriveOrderStatus(id, '6')` («Відмова»), локальний статус + `orders_history` (`source = chatwoot_bot`, причина в notes); WooCommerce шле клієнту email про зміну статусу. `orderCancelSemiAutoStatuses` (дефолт На відправку, Відправлено, На утриманні) та інші — передача оператору, клієнту «запит передано». Збій SalesDrive — теж оператору.
5. **Сповіщення:** приватна нотатка (номер, статус, результат, причина) — завжди. Якщо `orderCancelNotifyEnabled`: Telegram (`telegramNotifyBotToken` + `telegramNotifyChatId`, кнопка **Тест**) з посиланням на розмову; коли потрібна дія оператора — призначення (`orderCancelAssignMode`: `auto_inbox` | `specific_agent` + `orderCancelAssigneeId`) і `bot_human_handover_active`.

`dry_run` і пісочниця лише моделюють дію (`simulated: true`): SalesDrive, нотатки й Telegram не чіпають.

### Профіль контакту і сторінка клієнта

- **Телефон / email з чату → контакт Chatwoot** (`contactSyncEnabled`, дефолт увімк., вкладка «Замовлення й клієнти»): orchestrator фоном (`ChatwootBotContactSyncService`) шукає в повідомленні клієнта телефон UA (E.164) і email і записує їх лише в **порожні** поля контакту (`GET/PUT /contacts/{id}`, потрібен **User PAT**). Якщо Chatwoot відповідає 422 (номер уже в іншого контакту) — приватна нотатка оператору з пропозицією обʼєднати контакти вручну. `dry_run` нічого не пише.
- **Сторінка, з якої пише клієнт:** у контекст LLM іде товар або URL сторінки (`chatwootBotContactFields.ts` → `extractPageContext`). Джерело — custom attributes розмови від скрипта на сайті (`page_url`, `page_title`, `product_name`, `product_sku`; тема `breakdance-zero-theme-master/functions.php`, поруч з embed віджета, `$chatwoot.setConversationCustomAttributes` на `chatwoot:ready` і `chatwoot:on-message`), інакше `additional_attributes.referer` віджета (сторінка, де відкрили чат). Атрибути розмови пишуться лише коли розмова вже існує, тому для першого повідомлення часто працює лише referer.

### Запити на дію і сценарії

- **Статистика «Запити на дію»:** частини `action` з розбору повідомлень за період групуються (`chatwootBotActionRequests.ts`) і отримують рішення: сценарій з налаштувань (пошук за назвою й фразами, як у базі знань), вбудоване (`request_order_cancellation` — з поточним станом увімкнення; дзвінок оператора поза годинами) або «Немає – оператор». Кнопки «Створити сценарій» (чернетка з фразами групи) і «Відкрити сценарій» ведуть на вкладку «Сценарії» через `navigate` state.
- **Сценарії** (`settings.actionScenarios`, до 30): `title`, `enabled`, `triggers` (фрази клієнтів), `instructions` (кроки; назви інструментів — як є). Увімкнені з кроками йдуть у system prompt окремим блоком після обовʼязкових правил (`buildScenariosBlock`, до 8000 символів). Пісочниця бере незбережені сценарії.
- **Редактор інструкцій** (`InstructionEditor`): одне редаговане поле (contentEditable), інструменти в тексті — кольорові мітки з людськими назвами (свій колір на інструмент). Вставка: «@» + назва (меню з фільтром, ↑/↓/Enter), правий клік або кнопка «Інструмент». Модель отримує текст із технічними назвами; назви, вставлені як текст, стають мітками після виходу з поля. Мітка — чип з іконкою й кольором інструмента (`BOT_TOOL_META`), клік — поповер з описом; меню й поповери — через portal у `document.body`. Використовується в сценаріях і в «Інструкціях для AI» (групи — акордеон із розділювачами між правилами).

### Пісочниця

Вкладка **«Пісочниця»** (`#tab=sandbox`, право `settingsManage`): діалог від імені клієнта через той самий шлях, що в live (handover-слова → патерни → LLM з реальними tools → fallback), без Chatwoot. Маска, провайдер і модель — з форми, зокрема незбережені. Робочі години — за розкладом inbox або примусово «робочий / неробочий». Під кожною відповіддю — результат (`llm` | `pattern` | `handover_keyword` | `operator_tool` | `fallback`), модель, час, tokens, USD і trace інструментів (аргументи + відповідь).

- **Верифікація:** працює на реальних замовленнях (лише читання). Стан — у памʼяті сервера на сесію діалогу (`sessionId` у запиті; `ChatwootBotVerifyStateStore` з `live: false`, TTL 2 год, до 200 сесій): нова сесія після очищення діалогу й для кожного прогону сценарію. Як у live, код спершу сам перевіряє телефон / номер / дату з повідомлення (`tryVerifyFromUserMessage`) і додає `verifyNote.*`; далі доступні `verify_customer` і `get_verified_order`. У Chatwoot, `chatwoot_bot_conversation_state` і аналітику нічого не пишеться. Під відповіддю — мітка стану (`result.verify`: `verifiedOrders`, `attempt`, `failedAttempts`). Відмінність від live: після ліміту невдалих спроб розмова не передається оператору.
- **Редагування з кроку:** біля кроку інструмента — мітки інструкцій, що його сформували (опис `tool.<name>` і підказки, текст яких є у відповіді); клік відкриває редактор, зміни йдуть у незбережену форму й діють з наступного повідомлення. Для `search_knowledge_base` — мітки знайдених статей (відповідь інструмента містить `id`) або «Створити статтю» з запитом моделі; стаття зберігається одразу в БД (право `knowledgeManage`).

**Сценарії:** діалог зберігається як список реплік клієнта (`settings_base.key = chatwoot_bot_sandbox_scenarios`, до 100); «Прогнати всі» проганяє їх по черзі — для перевірки після зміни маски чи бази знань.

### База знань

- Статті в `chatwoot_bot_knowledge_entries`: назва, варіанти питань, відповідь (до 4000 симв.), теги, `enabled`, лічильник `hits`.
- Пошук без зовнішніх сервісів (`chatwootBotKnowledgeSearch.ts`): збіг основ слів (перші 5 літер) з питаннями, назвою й тегами + словник синонімів предметної області; українські й російські форми зводяться до спільної основи («скидка военным» = «знижка військовим»). Загальні слова магазину («замовлення», «заказ», «товар») у пошуку статті не рахуються — збіг лише по них давав хибні статті; для групування тем вони лишаються. Tool повертає до 3 статей; індекс кешується на 60 с і скидається при записі.
- LLM відповідає своїми словами лише за фактами з `answer`; якщо `found: false` — пробує `get_storefront_site_pages`.

### Діалоги бота (журнал)

Сторінка **«Діалоги бота»** (`/chatwoot-bot/dialogs`, право «Статистика»): розмови, на які реагував бот, з логікою кожної відповіді — для розбору відповідей і правки сценаріїв, інструкцій і статей. Розмови, які бот не передав оператору, у Chatwoot лишаються в статусі «Очікує» (pending), тому серед «Відкритих» їх не видно.

- **Запис:** `ChatwootBotTurnLogService` обгортає обробку вебхука (`AsyncLocalStorage`): хід починається з повідомлення клієнта (`begin`), гілки оркестратора й роутера позначають результат (`note`), `recordBotReply` додає публічні відповіді; після обробки хід пишеться в `chatwoot_bot_turns` (best-effort, помилка запису не впливає на відповідь). Результати: `llm` · `pattern` · `fallback` · `handover` (бот передав оператору: request_operator, невдала верифікація, повтор — з причиною) · `handover_keyword` · `emergency` · `callback` · `human_active` (розмову веде оператор, бот мовчав) · `reclaim`.
- **Що зберігається:** текст клієнта, відповіді бота, результат і причина, робочі години, `dry_run`, діагностика LLM як у пісочниці (модель, токени, USD, `toolTrace` — trace тепер збирається завжди; відповіді інструментів довші за ~6000 симв. обрізаються, якщо весь JSON > 60 KB), стан верифікації після ходу (`summarizeVerify`, спільний з пісочницею).
- **Зберігання:** 90 днів (`CHATWOOT_BOT_TURN_RETENTION_DAYS`), очищення — щоденний cron журналу бота (04:30).
- **API:** `GET /api/chatwoot-bot/dialogs?from=&to=&search=&outcome=` — розмови за період (до 300): перше питання, ходи, лічильник результатів, інструменти, вартість; пошук за текстом клієнта або № розмови, фільтр — за результатом. `GET /api/chatwoot-bot/dialogs/:conversationId` — усі ходи. Обидва повертають `chatwootUrl` для посилань на розмову.
- **UI:** фільтр періоду як у статистиці (`ChatwootBotStatistics/dateRange.ts`), таблиця з мітками результатів та інструментів; рядок відкриває drawer з діалогом і тим самим блоком під кожною відповіддю, що в пісочниці (`components/BotTurnView.tsx`). Статті бази знань редагуються з кроку `search_knowledge_base`; інструкції — поповер з поточним текстом і «Редагувати в налаштуваннях» (вкладка AI з пошуком за ключем, `state.instructionSearch`). Відповіді операторів — лише в Chatwoot.

### Теми питань (статистика)

Унікальні питання клієнтів (`contentNorm` з аналітики) зберігаються в `chatwoot_bot_question_assignments` і групуються в теми `chatwoot_bot_question_topics`. Картка «Теми питань» у статистиці показує теми з кількістю питань і статтю бази знань, яку бот знайде за темою, і в колонці «Відповідь» — інструменти, якими бот відповідав на питання теми; «Немає» — ні статті, ні інструмента.

- **Інструменти теми:** після відповіді LLM у live, якщо використано інструменти, що відповідають по суті (каталог, сторінки сайту, `verify_customer`, `get_verified_order`, `request_order_cancellation`), пишеться `bot_action` з `meta.kind = 'tool_use'`, `meta.tools` і `content` = повідомлення клієнта; overview рахує їх за `contentNorm` і сумує по темі (`cluster.tools`). База знань і `request_operator` не рахуються. Старі розмови такого сліду не мають.

- **Автоматично (`sync`):** нові питання йдуть у тему з найближчим учасником (`chatwootBotTopicAssign.ts`); що не підійшло — кластеризується в нові теми (`chatwootBotQuestionClusters.ts`). Теми без жодного питання (крім шуму) видаляються — і авто, і ручні.
- **Класифікатор:** `topicsClassifier` = `local` (алгоритм вище) або `jev` — спершу [TypeSafe Jev](../features/llm-platform.md#typesafe-jev) обирає тему (`choice` з описом і прикладами тем, до 254 тем + `none`), результат з `confidence ≥ topicsJevMinConfidence` приймається; решту і все після першої помилки Jev розкладає локальний алгоритм. Метод пишеться в `method` (`local` | `jev` | `manual`).
- **Коли:** debounce після повідомлення клієнта (`topicsSyncDelaySeconds`) + cron-підстраховка щохвилини, що синхронізує раз на `topicsCronMinutes` (0 — вимкнено; cron лише на проді). Перегляд статистики також запускає sync не частіше 30 с.
- **Вручну** (`topicsManage`): перейменувати / описати тему, перенести питання (autocomplete теми), позначити шумом, повернути алгоритму, злити теми, видалити (питання перерозкласти або в шум), створити тему з обраних питань. Ручне призначення алгоритм не змінює.
- **Об’єднання тем:** чекбокси на темах → «Об’єднати…» або «Об’єднати з іншими…» у меню теми. У вікні — autocomplete для додавання тем, вибір теми-заголовка (її назва лишиться) і підсумок «Після об’єднання: «…» · N звернень».
- **Привітання** на початку повідомлення (`stripLeadingGreeting` у `chatwootBotContentNorm.ts`) не показуються в питаннях, назвах тем і прикладах; повідомлення лише з привітанням лишається як є (і йде в шум, бо значущих слів немає).
- **Розбір повідомлень (LLM, `topicsIntentsEnabled`):** перед розкладкою по темах `ChatwootBotIntentService` віддає моделі платформи нові унікальні повідомлення (до 60 за синхронізацію, батчі по 20, з контекстом) і зберігає частини `question` / `action` / `answer` / `noise` у `chatwoot_bot_message_intents` (один раз на текст). У теми йде текст питань; без питань — шум (`method = intent`), зокрема раніше автопризначені (ручні не чіпаються). У статистиці — очищене питання, «клієнт написав: …» і позначки «запит на дію» / «відповідь». Без таблиці (міграцію не застосовано) розбір тихо вимикається. Промпт і парсинг — `chatwootBotIntents.ts`.
- **Контекст питання:** що було в розмові перед питанням (`chatwootBotQuestionContext.ts`: остання відповідь бота / оператора або попереднє повідомлення клієнта, не старше 3 год; бере останнє входження питання). Відповіді бота записуються в аналітику як `bot_action` з `meta.kind = reply` (LLM, патерни, fallback, тексти handover, підтвердження контактів, fallback екстреного виклику). Для старих даних — `GET /api/chatwoot-bot/analytics/question-context?hash=` з історії Chatwoot (до 15 питань на розгорнуту тему).
- **Пошук і фільтри:** пошук по назві теми й усіх питаннях; фільтр за статтею бази знань (або «Без статті») і за тегами статей.
- **В базу знань** (`knowledgeManage`): кнопка біля статті теми / «Немає» відкриває вікно з формулюваннями клієнтів (без телефонів): дописати їх варіантами питання у знайдену або іншу статтю (autocomplete) чи створити нову. Те саме — у картці «Бот шукав у базі знань і не знайшов», де колонка «Стаття зараз» показує, що бот знайде тепер (статтю могли додати пізніше).
- **Протестувати в пісочниці** (меню теми, право `settingsManage`): відкриває пісочницю налаштувань і одразу ставить боту назву теми як питання клієнта (через `navigate` state, без hash).
- **SLA агентів:** час від найранішого не відповіденого повідомлення клієнта до відповіді агента (медіана, середнє), кількість розмов і reclaim.

Налаштування — вкладка **«Теми питань»**:

| Поле | Дефолт | Межі |
|------|--------|------|
| `topicsClassifier` | `local` | `local` \| `jev` |
| `topicsJevMinConfidence` | 0.6 | 0–1 (UI 0.3–0.95) |
| `topicsJevExamplesPerTopic` | 4 | 0–10 |
| `topicsJevMaxPerSync` | 40 | 1–200 |
| `topicsSyncDelaySeconds` | 30 | 5–600 |
| `topicsCronMinutes` | 10 | 0–120 |

Jev викликається через OpenRouter (ключ OpenRouter) або напряму в TypeSafe — джерело задається в `/settings/llm`. Без ключа обраного джерела режим `jev` працює як `local` (вкладка показує попередження з посиланням на `/settings/llm`).

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
| `20261030120000_chatwoot_bot_conversation_states` | `chatwoot_bot_conversation_states` |
| `20261030140000_chatwoot_bot_knowledge_entries` | `chatwoot_bot_knowledge_entries` |
| `20261030160000_chatwoot_bot_question_topics` | `chatwoot_bot_question_topics`, `chatwoot_bot_question_assignments` |
| `20261102120000_chatwoot_bot_message_intents` | `chatwoot_bot_message_intents` |
| `20261102200000_chatwoot_bot_turns` | `chatwoot_bot_turns` |

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
| `server/modules/ChatwootBot/chatwootBotCatalogSearch.ts` | Пошук страв: основи слів, синоніми, фільтр без мʼяса |
| `server/modules/ChatwootBot/ChatwootBotOrderCancelService.ts` | Скасування замовлення: перевірка, SalesDrive, сповіщення |
| `server/modules/ChatwootBot/chatwootBotOrderCancelRules.ts` | ПІБ, статуси, номер замовлення |
| `server/modules/ChatwootBot/chatwootBotEmergencyWatch.ts` | Таймер очікування оператора на екстрений виклик |
| `server/modules/ChatwootBot/chatwootBotTelegramNotifier.ts` | Telegram-сповіщення операторів |
| `shared/constants/chatwootBotOrderCancel.ts` | Статуси SalesDrive для скасування, дефолти |
| `server/modules/ChatwootBot/ChatwootBotContactSyncService.ts` | Телефон / email з чату → профіль контакту |
| `server/modules/ChatwootBot/chatwootBotContactFields.ts` | Email і контекст сторінки з payload |
| `server/modules/ChatwootBot/ChatwootBotSandboxService.ts` | Пісочниця: хід бота без Chatwoot, сценарії |
| `server/modules/ChatwootBot/ChatwootBotTurnLogService.ts` | Журнал ходів бота («Діалоги бота»): збір під час обробки вебхука, список / розмова, retention |
| `server/modules/ChatwootBot/ChatwootBotStorefrontSiteToolService.ts` | Сторінки сайту (WP REST / HTML, TTL 6 год) |
| `shared/constants/chatwootBotLlmTools.ts` | Метадані LLM tools (runner + UI) |
| `server/modules/ChatwootBot/ChatwootBotOrderToolService.ts` | Verified order для tool |
| `server/modules/ChatwootBot/chatwootReclaimDecision.ts` | Правила reclaim |
| `server/modules/ChatwootBot/ChatwootBotAnalyticsService.ts` | Ingest + overview API; після питання клієнта — `scheduleSync` тем |
| `server/modules/ChatwootBot/ChatwootBotKnowledgeService.ts` | CRUD бази знань, індекс, tool-результат |
| `server/modules/ChatwootBot/chatwootBotKnowledgeSearch.ts` | Пошук по основах слів + синоніми |
| `server/modules/ChatwootBot/ChatwootBotQuestionTopicsService.ts` | Теми: sync, Jev, cron tick, ручні дії |
| `server/modules/ChatwootBot/chatwootBotTopicAssign.ts` | Розкладка нових питань по наявних темах |
| `server/modules/ChatwootBot/chatwootBotQuestionClusters.ts` | Кластеризація питань у нові теми |
| `server/modules/ChatwootBot/chatwootBotTopicJev.ts` | Теми як варіанти `choice` для Jev |
| `server/routes/chatwoot-knowledge.ts` | API бази знань |
| `server/modules/ChatwootBot/fixtures/` | Payload для unit-тестів |
| `server/routes/chatwoot-webhooks.ts` | Webhook |
| `server/routes/chatwoot-bot.ts` | Admin API + tools + ai/test |
| `server/routes/llm.ts` | Платформа LLM |
| `client/pages/ChatwootBotSettings/` | Налаштування бота (таби, hash) |
| `client/pages/SettingsChatwootBot.tsx` | Re-export модуля ChatwootBotSettings |
| `client/pages/SettingsLlm.tsx` | Глобальні LLM |
| `client/components/llm/LlmModelAutocomplete.tsx` | Autocomplete моделей + pricing hint |
| `client/pages/ChatwootBotStatistics/` | Статистика; `components/QuestionTopicsCard.tsx` — теми питань |
| `client/pages/ChatwootBotKnowledge/` | База знань (список + drawer статті) |
| `client/pages/ChatwootBotSettings/tabs/TopicsTab.tsx` | Налаштування тем питань |
| `shared/types/chatwootBot.ts` | Типи і дефолти бота |
| `shared/types/chatwootBotTools.ts` | DTO tools (без PII) |
| `shared/types/chatwootBotKnowledge.ts` | Типи і ліміти бази знань |
| `shared/types/chatwootBotTopics.ts` | Типи і ліміти тем питань |
| `shared/types/llm.ts` | Типи платформи LLM |

Тести: `ChatwootBotOrchestrator.spec.ts`, `ChatwootBotPatternMatcher.spec.ts`, `ChatwootBotStorefrontSiteToolService.spec.ts`, `chatwootBotOrderRedaction.spec.ts`, `chatwootBotVerifyDateParse.spec.ts`, `chatwootBotKnowledgeSearch.spec.ts`, `chatwootBotQuestionClusters.spec.ts`, `chatwootBotTopicAssign.spec.ts`, `chatwootBotTopicJev.spec.ts`, `shared/utils/catalogNameQueryMatch.spec.ts`, сервіси в `server/services/llm/*.spec.ts`.
