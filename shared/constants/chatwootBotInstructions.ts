/**
 * Інструкції для LLM чат-бота, які можна змінити в налаштуваннях (AI → «Інструкції для AI»).
 * Тексти за замовчуванням живуть тут; у `settings.aiInstructions` зберігаються лише змінені.
 * Ключі, назви інструментів і значення параметрів (`kind`, `code`) не редагуються — від них залежить код.
 */
import { CHATWOOT_BOT_LLM_TOOLS } from './chatwootBotLlmTools.js';

export type ChatwootBotInstructionGroup = 'policy' | 'tools' | 'knowledge' | 'order' | 'verify' | 'cancel' | 'operator';

export const CHATWOOT_BOT_INSTRUCTION_GROUPS: Record<
  ChatwootBotInstructionGroup,
  { title: string; description: string }
> = {
  policy: {
    title: 'Обовʼязкові правила',
    description: 'Йдуть одразу після промпту маски в кожній розмові; маска їх не вимикає.',
  },
  tools: {
    title: 'Описи інструментів',
    description: 'Що модель знає про кожен інструмент і коли його викликати.',
  },
  knowledge: { title: 'База знань', description: 'Підказки з відповіді search_knowledge_base.' },
  order: { title: 'Статус замовлення', description: 'Підказки з відповіді get_verified_order.' },
  verify: {
    title: 'Верифікація',
    description:
      'verify.* – відповідь інструменту verify_customer, коли його викликала модель. verifyNote.* – примітка в system prompt, коли код сам перевірив дані з повідомлення клієнта ще до моделі.',
  },
  cancel: { title: 'Скасування замовлення', description: 'Підказки request_order_cancellation на кожному кроці.' },
  operator: { title: 'Оператор', description: 'Підказки request_operator.' },
};

type InstructionDef = {
  key: string;
  group: ChatwootBotInstructionGroup;
  label: string;
  /** Коли й у якому вигляді бот отримує цей текст. */
  usage: string;
  defaultText: string;
};

const STATIC_INSTRUCTIONS: InstructionDef[] = [
  {
    key: 'policy.gender',
    usage: 'Пункт списку «Обовʼязкові правила» в system prompt – у кожному запиті до моделі, одразу після маски.',
    group: 'policy',
    label: 'Рід персонажа',
    defaultText:
      'Ти чоловічого роду: «знайшов», «перевірив», «радий», «зміг». Ніколи не пиши про себе в жіночому роді.',
  },
  {
    key: 'policy.searchFirst',
    usage: 'Пункт «Обовʼязкових правил» у кожному запиті. Не дає моделі відповісти «не знаю», не викликавши пошук.',
    group: 'policy',
    label: 'Шукати перед «не знаю»',
    defaultText:
      'Перш ніж сказати, що інформації немає, пошукай: search_knowledge_base для умов, доставки, оплати, знижок; get_storefront_site_pages, якщо в базі знань не знайшлось; get_storefront_catalog для страв, складу, цін і наявності (шукай за ключовим словом: «курка», «суп», «вареники»).',
  },
  {
    key: 'policy.cancellation',
    usage:
      'Пункт «Обовʼязкових правил» у кожному запиті. Направляє прохання скасувати замовлення в потрібний інструмент.',
    group: 'policy',
    label: 'Скасування замовлення',
    defaultText:
      'Клієнт хоче скасувати замовлення – request_order_cancellation, якщо такий інструмент є; інакше request_operator.',
  },
  {
    key: 'policy.operator',
    usage: 'Пункт «Обовʼязкових правил» у кожному запиті. Змушує передавати розмову викликом, а не словами.',
    group: 'policy',
    label: 'Передача оператору',
    defaultText:
      'Якщо після пошуку відповіді немає, або клієнт просить людину – виклич request_operator. Не пиши «зверніться до оператора» без виклику: клієнт не знає, як це зробити.',
  },

  {
    key: 'knowledge.emptyQuery',
    usage: 'Відповідь search_knowledge_base, коли модель викликала його з порожнім query.',
    group: 'knowledge',
    label: 'Порожній запит',
    defaultText: 'Передай у query суть питання клієнта.',
  },
  {
    key: 'knowledge.unavailable',
    usage: 'Відповідь search_knowledge_base, коли база знань не завантажилась (помилка або вимкнена).',
    group: 'knowledge',
    label: 'База знань недоступна',
    defaultText:
      'База знань тимчасово недоступна. Спробуй get_storefront_site_pages; якщо й там немає – виклич request_operator.',
  },
  {
    key: 'knowledge.notFound',
    usage: 'Відповідь search_knowledge_base, коли за запитом не знайдено жодної статті.',
    group: 'knowledge',
    label: 'Нічого не знайдено',
    defaultText:
      'У базі знань немає відповіді. Спробуй get_storefront_site_pages; якщо й там немає – виклич request_operator (kind: no_answer).',
  },
  {
    key: 'knowledge.found',
    usage: 'Додається до знайдених статей у відповіді search_knowledge_base – як модель має ними користуватись.',
    group: 'knowledge',
    label: 'Знайдено статті',
    defaultText: 'Сформулюй відповідь своїми словами лише за цими фактами; не вигадуй того, чого тут немає.',
  },

  {
    key: 'order.phoneOnly',
    usage:
      'Відповідь get_verified_order, коли клієнт назвав лише телефон (без верифікації): бот бачить тільки статус останнього замовлення.',
    group: 'order',
    label: 'Лише телефон: короткий статус',
    defaultText:
      'Це короткий статус останнього замовлення за телефоном клієнта. Не називай номер чи дату замовлення. Для складу замовлення й номера ТТН попроси номер замовлення або дату, коли його робили.',
  },
  {
    key: 'order.phoneOnlyNotFound',
    usage: 'Відповідь get_verified_order у режимі «лише телефон», коли за телефоном немає замовлень.',
    group: 'order',
    label: 'Лише телефон: замовлень немає',
    defaultText:
      'За цим телефоном замовлень не знайдено. Попроси перевірити номер телефону або назвати номер замовлення.',
  },

  {
    key: 'verify.success',
    usage: 'Відповідь verify_customer, коли модель сама викликала інструмент і дані збіглися із замовленням.',
    group: 'verify',
    label: 'Пройдено',
    defaultText: 'Верифікацію пройдено. Викликай get_verified_order і розкажи клієнту про замовлення.',
  },
  {
    key: 'verify.phoneRequired',
    usage: 'Відповідь verify_customer, коли модель викликала його без телефону.',
    group: 'verify',
    label: 'Потрібен телефон',
    defaultText: 'Попроси номер телефону, на який оформлювали замовлення.',
  },
  {
    key: 'verify.detailsRequired',
    usage: 'Відповідь verify_customer: телефон є, але немає номера замовлення чи дати.',
    group: 'verify',
    label: 'Потрібен номер або дата',
    defaultText: 'Телефон є. Попроси номер замовлення або дату (приблизно, у межах 1–3 днів), коли його робили.',
  },
  {
    key: 'verify.rangeTooWide',
    usage: 'Відповідь verify_customer, коли клієнт назвав надто широкий проміжок дат (понад 3 дні).',
    group: 'verify',
    label: 'Завеликий інтервал дат',
    defaultText: 'Інтервал дат завеликий. Попроси уточнити день (до 3 днів) або назвати номер замовлення.',
  },
  {
    key: 'verify.ambiguous',
    usage: 'Відповідь verify_customer, коли за телефоном і датою знайдено кілька замовлень.',
    group: 'verify',
    label: 'Кілька замовлень за період',
    defaultText: 'За цей період кілька замовлень. Попроси номер замовлення.',
  },
  {
    key: 'verify.rateLimited',
    usage: 'Відповідь verify_customer, коли вичерпано ліміт спроб у розмові.',
    group: 'verify',
    label: 'Ліміт спроб',
    defaultText:
      'Ліміт спроб вичерпано. Не проси дані знову – виклич request_operator або запропонуй спробувати пізніше.',
  },
  {
    key: 'verify.invalidInput',
    usage: 'Відповідь verify_customer, коли модель передала телефон чи дату в нерозпізнаному вигляді.',
    group: 'verify',
    label: 'Дані не розпізнано',
    defaultText: 'Дані не розпізнано: телефон український, дата у форматі YYYY-MM-DD. Уточни в клієнта.',
  },
  {
    key: 'verify.unavailable',
    usage:
      'Відповідь verify_customer поза розмовою Chatwoot (немає conversationId). У звичайній роботі не трапляється.',
    group: 'verify',
    label: 'Поза розмовою',
    defaultText: 'Перевірка доступна лише в розмові з клієнтом.',
  },
  {
    key: 'verifyNote.success',
    usage:
      'Службова примітка в system prompt: код сам знайшов дані в повідомленні клієнта й перевірив їх ще до моделі – успішно.',
    group: 'verify',
    label: 'Примітка: пройшов повідомленням',
    defaultText:
      'клієнт щойно успішно пройшов верифікацію цим повідомленням. Не проси дані повторно – викликай get_verified_order і відповідай про замовлення.',
  },
  {
    key: 'verifyNote.rateLimited',
    usage:
      'Службова примітка в system prompt: автоперевірка повідомлення клієнта впала на ліміті спроб (якщо розмову не передано оператору одразу).',
    group: 'verify',
    label: 'Примітка: ліміт спроб',
    defaultText:
      'ліміт спроб верифікації вичерпано. Не проси дані знову – виклич request_operator або запропонуй спробувати пізніше.',
  },
  {
    key: 'verifyNote.ambiguous',
    usage:
      'Службова примітка в system prompt: автоперевірка повідомлення клієнта знайшла кілька замовлень за названий період.',
    group: 'verify',
    label: 'Примітка: кілька замовлень',
    defaultText: 'за названий період у клієнта кілька замовлень. Попроси номер замовлення.',
  },
  {
    key: 'verifyNote.invalidInput',
    usage:
      'Службова примітка в system prompt: у повідомленні клієнта схоже на телефон чи дату, але розпізнати не вдалося.',
    group: 'verify',
    label: 'Примітка: не розпізнано',
    defaultText:
      'спроба верифікації не вдалася: не вдалося розпізнати телефон або дату. Попроси уточнити саме цю частину.',
  },
  {
    key: 'verifyNote.mismatch',
    usage:
      'Службова примітка в system prompt: автоперевірка повідомлення клієнта – дані не збіглися з жодним замовленням.',
    group: 'verify',
    label: 'Примітка: дані не збіглися',
    defaultText:
      'спроба верифікації не вдалася: телефон разом із номером замовлення або датою не збігся з жодним замовленням. Скажи про це прямо й попроси перевірити дані; не повторюй попередню підказку дослівно.',
  },

  {
    key: 'cancel.disabled',
    usage: 'Відповідь request_order_cancellation, коли скасування через бота вимкнене в налаштуваннях «Замовлення».',
    group: 'cancel',
    label: 'Скасування вимкнене',
    defaultText:
      'Скасування через бота вимкнене. Виклич request_operator (kind: action), щоб передати запит оператору.',
  },
  {
    key: 'cancel.rateLimited',
    usage: 'Відповідь request_order_cancellation після забагатьох невдалих спроб знайти замовлення.',
    group: 'cancel',
    label: 'Забагато спроб',
    defaultText: 'Забагато невдалих спроб. Не проси дані знову – виклич request_operator (kind: action).',
  },
  {
    key: 'cancel.phoneRequired',
    usage: 'Крок 1 request_order_cancellation: модель викликала інструмент без телефону.',
    group: 'cancel',
    label: 'Потрібен телефон',
    defaultText: 'Попроси номер телефону, на який оформлене замовлення.',
  },
  {
    key: 'cancel.nameRequired',
    usage: 'Крок 1 request_order_cancellation: телефон є, бракує прізвища та імені.',
    group: 'cancel',
    label: 'Потрібні прізвище й імʼя',
    defaultText: 'Для скасування потрібні прізвище та імʼя одержувача, як у замовленні. Попроси їх.',
  },
  {
    key: 'cancel.notFound',
    usage: 'Відповідь request_order_cancellation: за телефоном і ПІБ немає активних замовлень.',
    group: 'cancel',
    label: 'Не знайдено',
    defaultText:
      'Активних замовлень з таким телефоном і ПІБ не знайдено. Не уточнюй, що саме не збіглося; запропонуй перевірити дані або виклич request_operator.',
  },
  {
    key: 'cancel.chooseOrder',
    usage: 'Крок 2 request_order_cancellation: активних замовлень кілька, разом зі списком замовлень.',
    group: 'cancel',
    label: 'Кілька замовлень',
    defaultText: 'Клієнт має кілька активних замовлень. Покажи список (номер, дата, сума) і попроси обрати.',
  },
  {
    key: 'cancel.orderNumberNotFound',
    usage: 'Крок 2 request_order_cancellation: клієнт назвав номер, якого немає серед активних.',
    group: 'cancel',
    label: 'Номер не серед активних',
    defaultText: 'Замовлення з цим номером серед активних не знайдено. Покажи клієнту список і попроси обрати.',
  },
  {
    key: 'cancel.reasonRequired',
    usage: 'Крок 3 request_order_cancellation: замовлення обрано, ще немає причини.',
    group: 'cancel',
    label: 'Причина й допомога',
    defaultText:
      'Спитай, чому клієнт хоче скасувати, і запропонуй допомогу (змінити склад, дату чи адресу доставки). Якщо все ж скасувати – виклич цей tool знову з reason.',
  },
  {
    key: 'cancel.cancelled',
    usage: 'Фінал request_order_cancellation: статус дозволяв, замовлення скасовано в SalesDrive.',
    group: 'cancel',
    label: 'Скасовано',
    defaultText:
      'Замовлення скасовано. Повідом клієнту коротко; якщо він залишав email у замовленні, лист прийде автоматично.',
  },
  {
    key: 'cancel.pendingOperator',
    usage:
      'Фінал request_order_cancellation: статус не дозволяє автоскасування, запит пішов оператору (нотатка, Telegram).',
    group: 'cancel',
    label: 'Передано оператору',
    defaultText:
      'Скажи клієнту, що запит на скасування передано оператору, він перевірить і підтвердить. Нічого не обіцяй щодо результату.',
  },

  {
    key: 'operator.accepted',
    usage: 'Відповідь request_operator, коли передачу прийнято: текст клієнту надсилає система (вкладка «Оператор»).',
    group: 'operator',
    label: 'Передачу прийнято',
    defaultText: 'Оператора буде підключено автоматично, клієнт отримає повідомлення від системи. Свій текст не пиши.',
  },
  {
    key: 'operator.unavailable',
    usage:
      'Відповідь request_operator поза розмовою Chatwoot (немає conversationId). У звичайній роботі не трапляється.',
    group: 'operator',
    label: 'Поза розмовою',
    defaultText: 'Передача оператору доступна лише в розмові з клієнтом.',
  },
];

/** Описи інструментів — з `CHATWOOT_BOT_LLM_TOOLS`, щоб текст за замовчуванням не дублювався. */
const TOOL_INSTRUCTIONS: InstructionDef[] = CHATWOOT_BOT_LLM_TOOLS.map((tool) => ({
  key: `tool.${tool.name}`,
  group: 'tools',
  label: tool.name,
  usage:
    'Опис інструменту в списку tools кожного запиту до моделі. За ним модель вирішує, чи й коли викликати інструмент.',
  defaultText: tool.description,
}));

export const CHATWOOT_BOT_INSTRUCTIONS: readonly InstructionDef[] = [...STATIC_INSTRUCTIONS, ...TOOL_INSTRUCTIONS];

const DEFAULTS = new Map(CHATWOOT_BOT_INSTRUCTIONS.map((i) => [i.key, i.defaultText]));

export const CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH = 4000;

/** Змінений текст, якщо він є, інакше — текст за замовчуванням. */
export function botInstruction(overrides: Record<string, string> | null | undefined, key: string): string {
  const custom = overrides?.[key]?.trim();
  return custom || DEFAULTS.get(key) || '';
}

/** Лише відомі ключі з непорожнім текстом, що відрізняється від стандартного. */
export function normalizeInstructionOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DEFAULTS.has(key) || typeof value !== 'string') continue;
    const text = value.trim().slice(0, CHATWOOT_BOT_INSTRUCTION_MAX_LENGTH);
    if (text && text !== DEFAULTS.get(key)) result[key] = text;
  }
  return result;
}
