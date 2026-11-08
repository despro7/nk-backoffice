/**
 * Default Notification Centre rules, seeded into notification_rules when the table is empty
 * and used by "Reset to default". Built from the real meta_logs sources (Nov 2026).
 * Order matters: specific message rules first, generic fallbacks after.
 */

import type {
  NotificationGlossaryEntry,
  NotificationReplacement,
  NotificationRuleDef,
} from '../types/notificationRules.js';

/** Рядки «- Назва | арт: X | партія: Y | потрібно: 2.000 шт | залишок: 1 шт | бракує: 1 шт». */
const SHORTAGE_LINES: NotificationReplacement[] = [
  {
    pattern: '^\\s*-\\s*(.+?)\\s*\\|\\s*арт:\\s*(\\S+)(?:\\s*\\|\\s*партія:\\s*(\\S+))?\\s*\\|\\s*потрібно:\\s*([\\d.,]+)\\s*шт\\s*\\|\\s*залишок:\\s*([\\d.,]+)\\s*шт\\s*\\|\\s*бракує:\\s*([\\d.,]+)\\s*шт',
    flags: 'm',
    replace: '• $1 (арт. $2): бракує $6 шт, є $5',
  },
  { pattern: '(\\d+)\\.000\\b', replace: '$1' },
  { pattern: '^.*?Недостатн[^:\\n]*:\\s*', flags: 's', replace: '' },
];

/** Префікси «[Авто] Помилка відвантаження замовлення 123: » тощо. */
const STRIP_EXPORT_PREFIX: NotificationReplacement = {
  pattern: '^\\[(?:Авто|Мануал|Ручний)\\]\\s*Помилка (?:відвантаження|export|експорту|відправки)[^:]*:\\s*',
  replace: '',
};

let position = 0;
const next = () => (position += 10);

function rule(def: Omit<NotificationRuleDef, 'position' | 'enabled'> & { enabled?: boolean }): NotificationRuleDef {
  return { enabled: true, position: next(), ...def };
}

export const DEFAULT_NOTIFICATION_RULES: NotificationRuleDef[] = [
  // ── Товари: модерація специфікацій (адресні) ──────────────────────────────
  rule({
    key: 'catalog-spec-pending',
    name: 'Специфікація чекає на затвердження',
    match: { categories: ['catalog_spec'], title: 'чекає на затвердження|Оновлено чернетку' },
    output: { kind: 'task', group: 'products', level: 'info', visibility: 'show', actionLabel: 'Переглянути специфікацію' },
  }),
  rule({
    key: 'catalog-spec-rejected',
    name: 'Специфікацію відхилено',
    match: { categories: ['catalog_spec'], title: 'відхилено' },
    output: { kind: 'task', group: 'products', level: 'info', visibility: 'show', actionLabel: 'Виправити специфікацію' },
  }),
  rule({
    key: 'catalog-spec-approved',
    name: 'Специфікацію затверджено',
    match: { categories: ['catalog_spec'], title: 'затверджено' },
    output: { kind: 'event', group: 'products', level: 'success', visibility: 'show', actionLabel: 'Відкрити товар' },
  }),

  // ── Склад: документи, які Діловод не прийняв ─────────────────────────────
  rule({
    key: 'warehouse-movement-rejected',
    name: 'Переміщення не проведено в Діловоді',
    match: { statuses: ['error'], message: 'Помилка відправки переміщення #(?<doc>[^:\\s]+)' },
    output: {
      kind: 'alert', group: 'warehouse', visibility: 'show',
      title: 'Переміщення {{doc}} не проведено в Діловоді',
      replacements: SHORTAGE_LINES,
      message: 'Не вистачає залишків:\n{{message}}',
      actionLink: '/warehouse/movement',
    },
  }),
  rule({
    key: 'warehouse-release-rejected',
    name: 'Комплектування не проведено в Діловоді',
    match: { statuses: ['error'], message: 'Помилка відправки комплектування(?: #(?<doc>[^:\\s]+)| без номера)?:\\s*(?<reason>.*)' },
    output: {
      kind: 'alert', group: 'warehouse', visibility: 'show',
      title: 'Комплектування {{doc}} не проведено в Діловоді',
      message: '{{reason}}',
      actionLink: '/warehouse/releases',
    },
  }),
  rule({
    key: 'warehouse-writeoff-rejected',
    name: 'Списання не проведено в Діловоді',
    match: { categories: ['dilovod'], statuses: ['error'], title: '^WriteOff export failed$' },
    output: {
      kind: 'alert', group: 'warehouse', visibility: 'show',
      title: 'Списання не проведено в Діловоді',
      replacements: SHORTAGE_LINES,
      actionLink: '/warehouse/writeoff',
    },
  }),
  rule({
    key: 'warehouse-autofinalize-error',
    name: 'Автофіналізація накладної',
    match: { categories: ['warehouse_movement'], statuses: ['error'], message: 'накладної №(?<doc>\\S+?),\\s*автор документу:\\s*(?<author>.+)' },
    output: {
      kind: 'alert', group: 'warehouse', visibility: 'show',
      title: 'Накладну №{{doc}} не фіналізовано автоматично',
      message: 'Автор документа: {{author}}. Перевірте накладну і фіналізуйте її вручну.',
      actionLink: '/warehouse/movement',
    },
  }),
  rule({
    key: 'warehouse-autofinalize-success',
    name: 'Автофіналізація переміщень (успіх)',
    match: { categories: ['warehouse_movement'], statuses: ['success'] },
    output: { kind: 'event', group: 'warehouse', visibility: 'show' },
  }),

  // ── Діловод: відомі причини помилок експорту / відвантаження ──────────────
  rule({
    key: 'dilovod-shortage',
    name: 'Не вистачає товару для відвантаження',
    match: { categories: ['dilovod'], statuses: ['error'], message: 'Недостатн' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Відвантаження №{{orderNumber}} не проведено: бракує товару',
      replacements: SHORTAGE_LINES,
    },
  }),
  rule({
    key: 'dilovod-contract-person',
    name: 'Договір на іншого контрагента',
    match: { categories: ['dilovod'], statuses: ['error'], message: '%contract% зареєстровано на %person%' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Договір замовлення №{{orderNumber}} оформлено на іншого контрагента',
      message: 'У Діловоді договір привʼязаний до іншого контрагента, ніж у замовленні. Виправте контрагента і повторіть відвантаження.',
    },
  }),
  rule({
    key: 'dilovod-api-busy',
    name: 'Діловод зайнятий (multithreadApiSession)',
    match: { categories: ['dilovod'], statuses: ['error'], message: 'multithreadApiSession' },
    output: {
      kind: 'alert', group: 'dilovod', level: 'warning', visibility: 'show',
      title: 'Діловод не відповів по замовленню №{{orderNumber}}',
      message: 'Діловод був зайнятий іншим запитом. Повторіть відвантаження замовлення пізніше.',
    },
  }),
  rule({
    key: 'dilovod-payment-mapping',
    name: 'Не налаштовано мапінг оплати',
    match: { categories: ['dilovod'], statuses: ['error'], message: 'мапінг оплати "(?<payment>[^"]+)" в каналі "(?<channel>[^"]+)"' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Замовлення №{{orderNumber}}: не налаштовано мапінг оплати',
      message: 'Оплата «{{payment}}» у каналі «{{channel}}» не привʼязана до Діловода. Налаштування Діловода → Мапінг каналів оплати.',
      actionLabel: 'Відкрити налаштування',
      actionLink: '/settings/dilovod',
    },
  }),
  rule({
    key: 'dilovod-bad-field',
    name: 'Діловод не прийняв поле документа',
    match: { categories: ['dilovod'], statuses: ['error'], message: 'cant set value of (?<field>[\\w.]+)' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Діловод не прийняв замовлення №{{orderNumber}}',
      message: 'Поле {{field}} має невірне значення або не існує в Діловоді.',
    },
  }),
  rule({
    key: 'dilovod-object-locked',
    name: 'Документ заблоковано в Діловоді',
    match: { categories: ['dilovod'], statuses: ['error'], message: 'object locked' },
    output: {
      kind: 'alert', group: 'dilovod', level: 'warning', visibility: 'show',
      title: 'Документ замовлення №{{orderNumber}} заблоковано в Діловоді',
      message: 'Документ відкритий у Діловоді іншим користувачем. Закрийте його і повторіть дію.',
    },
  }),
  rule({
    key: 'dilovod-export-blocked',
    name: 'Експорт заблоковано перевіркою товарів',
    match: { categories: ['dilovod'], statuses: ['error'], title: 'Експорт замовлення заблоковано' },
    output: { kind: 'alert', group: 'dilovod', visibility: 'show', title: 'Експорт замовлення №{{orderNumber}} заблоковано' },
  }),
  rule({
    key: 'dilovod-shipment-error',
    name: 'Помилка відвантаження (інше)',
    match: { categories: ['dilovod'], statuses: ['error'], title: 'shipment|\\(sale\\)' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Не вдалося відвантажити замовлення №{{orderNumber}}',
      replacements: [STRIP_EXPORT_PREFIX],
    },
  }),
  rule({
    key: 'dilovod-export-error',
    name: 'Помилка експорту замовлення (інше)',
    match: { categories: ['dilovod'], statuses: ['error'], title: 'export|saleOrder' },
    output: {
      kind: 'alert', group: 'dilovod', visibility: 'show',
      title: 'Не вдалося експортувати замовлення №{{orderNumber}}',
      replacements: [STRIP_EXPORT_PREFIX],
    },
  }),
  rule({
    key: 'dilovod-success-hidden',
    name: 'Успішні дії в Діловоді (журнал)',
    match: { categories: ['dilovod'], statuses: ['success', 'info'] },
    output: { kind: 'event', group: 'dilovod', visibility: 'hidden' },
  }),

  // ── Синхронізації ─────────────────────────────────────────────────────────
  rule({
    key: 'product-sync-config',
    name: 'Синхронізація товарів не налаштована',
    match: { categories: ['product_sync'], message: 'WORDPRESS_DATABASE_URL' },
    output: {
      kind: 'alert', group: 'system', visibility: 'show',
      title: 'Синхронізація товарів не налаштована',
      message: 'Не задано підключення до бази WordPress (WORDPRESS_DATABASE_URL). Зверніться до адміністратора.',
    },
  }),
  rule({
    key: 'product-sync-barcode',
    name: 'Товар без штрих-коду',
    match: { categories: ['product_sync'], message: '^(?<name>.+?)\\s*\\(SKU:\\s*(?<sku>[^)]+)\\)\\s*-\\s*відсутній штрих-код' },
    output: {
      kind: 'alert', group: 'sync', visibility: 'show',
      title: 'Товар без штрих-коду',
      message: '{{name}} (арт. {{sku}}): додайте штрих-код у Діловоді.',
    },
  }),
  rule({
    key: 'product-sync-item',
    name: 'Невірні дані товару',
    match: { categories: ['product_sync'], message: '^(?<name>.+?)\\s*\\(SKU:\\s*(?<sku>[^)]+)\\)\\s*-\\s*(?<reason>.+)$' },
    output: {
      kind: 'alert', group: 'sync', visibility: 'show',
      message: '{{name}} (арт. {{sku}}): {{reason}}.',
    },
  }),
  rule({
    key: 'product-sync-other',
    name: 'Інші помилки синхронізації товарів',
    match: { categories: ['product_sync'] },
    output: { kind: 'alert', group: 'sync', visibility: 'show' },
  }),

  // ── Звіти та система ──────────────────────────────────────────────────────
  rule({
    key: 'user-report',
    name: 'Звіт користувача',
    match: { categories: ['user_report'] },
    output: {
      kind: 'task', group: 'system', level: 'info', visibility: 'show',
      title: 'Звіт про помилку від користувача {{actor}}',
      // Посилання є лише коли скріншот збережено (до 30 днів); інакше кнопки немає.
      actionLink: '{{data.screenshotLink}}',
      actionLabel: 'Відкрити скріншот',
    },
  }),
  rule({
    key: 'support-report-settings-hidden',
    name: 'Зміна налаштувань звітів (журнал)',
    match: { categories: ['support_report'] },
    output: { kind: 'event', group: 'system', visibility: 'hidden' },
  }),
];

export const DEFAULT_NOTIFICATION_GLOSSARY: NotificationGlossaryEntry[] = [
  { phrase: 'Document not saved', replacement: 'Документ не збережено', isRegex: false, enabled: true, position: 10 },
  { phrase: 'Access denied', replacement: 'Доступ заборонено', isRegex: false, enabled: true, position: 20 },
  { phrase: 'object locked', replacement: 'документ заблоковано', isRegex: false, enabled: true, position: 30 },
  { phrase: 'applicationLayerError\\s*', replacement: '', isRegex: true, enabled: true, position: 40 },
  { phrase: '<[^>]+>', replacement: '', isRegex: true, enabled: true, position: 50 },
];
