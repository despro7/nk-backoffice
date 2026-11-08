import { describe, expect, it } from 'vitest';
import {
  applyGlossary,
  renderNotification,
  renderTemplate,
  validatePattern,
  validateRule,
} from './ruleEngine';
import { DEFAULT_NOTIFICATION_GLOSSARY, DEFAULT_NOTIFICATION_RULES } from './defaultRules';
import type { NotificationSourceLog } from '../types/notificationRules';

const RULES = DEFAULT_NOTIFICATION_RULES.map((r, i) => ({ ...r, id: i + 1 }));

function log(partial: Partial<NotificationSourceLog>): NotificationSourceLog {
  return {
    id: 1,
    category: 'dilovod',
    status: 'error',
    title: null,
    message: null,
    orderNumber: null,
    initiatedBy: null,
    data: null,
    ...partial,
  };
}

const render = (l: NotificationSourceLog) => renderNotification(l, RULES, DEFAULT_NOTIFICATION_GLOSSARY);

describe('ruleEngine: real meta_logs samples', () => {
  it('formats shipment shortage list into readable lines', () => {
    const out = render(log({
      title: 'Auto shipment export result (sale)',
      orderNumber: '25727',
      message: '[Авто] Помилка відвантаження замовлення 25727: Недостатня кількість:\n- Рис по-азійськи | арт: 03040 | потрібно: 2.000 шт | залишок: 1 шт | бракує: 1 шт',
    }));
    expect(out.ruleName).toBe('Не вистачає товару для відвантаження');
    expect(out.title).toBe('Не вистачає товару для замовлення №25727');
    expect(out.message).toBe('• Рис по-азійськи (арт. 03040): бракує 1 шт, є 1');
    expect(out.group).toBe('dilovod');
    expect(out.actionLink).toBe('/orders/25727');
    expect(out.actionLabel).toBe('Відкрити замовлення');
  });

  it('keeps batch lines for write-offs and routes them to warehouse', () => {
    const out = render(log({
      title: 'WriteOff export failed',
      message: 'Недостатня кількість:\n- Борщ зі свининою | арт: 01008 | партія: 60814 | потрібно: 2.000 шт | залишок: 0 шт | бракує: 2.000 шт\n- Суп | арт: 01004 | партія: 60804 | потрібно: 3.000 шт | залишок: 0 шт | бракує: 3.000 шт',
    }));
    expect(out.group).toBe('warehouse');
    expect(out.title).toBe('Списання не проведено в Діловоді');
    expect(out.message).toBe('• Борщ зі свининою (арт. 01008): бракує 2 шт, є 0\n• Суп (арт. 01004): бракує 3 шт, є 0');
  });

  it('extracts named groups for payment mapping', () => {
    const out = render(log({
      title: 'Auto export error (saleOrder)',
      orderNumber: 'SD14639',
      message: '[Авто] Помилка export замовлення SD14639: Експорт заблоковано через критичні помилки:\nНе налаштовано мапінг оплати "Plata by Mono (ID: 14)" в каналі "інше (менеджер) (31)". Перейдіть…',
    }));
    expect(out.message).toBe('Оплата «Plata by Mono (ID: 14)» у каналі «інше (менеджер) (31)» не привʼязана до Діловода. Налаштування Діловода → Мапінг каналів оплати.');
    expect(out.actionLink).toBe('/settings/dilovod');
    expect(out.actionLabel).toBe('Відкрити налаштування');
  });

  it('translates English Dilovod errors', () => {
    const out = render(log({
      title: 'Dilovod export result',
      orderNumber: '20205',
      message: 'cant set value of header.deliveryMethod_forDel: bad value, or field doesnt exist',
    }));
    expect(out.message).toBe('Поле header.deliveryMethod_forDel має невірне значення або не існує в Діловоді.');
  });

  it('turns spec moderation into a task, not a warning', () => {
    const out = render(log({
      category: 'catalog_spec',
      status: 'warning',
      title: 'Специфікація чекає на затвердження',
      message: '«Курка з печерицями»: додала примітки',
      data: { recipients: [1], link: '/products#good=42' },
    }));
    expect(out.kind).toBe('task');
    expect(out.level).toBe('info');
    expect(out.actionLink).toBe('/products#good=42');
    expect(out.actionLabel).toBe('Переглянути специфікацію');
  });

  it('hides routine Dilovod successes', () => {
    const out = render(log({ status: 'success', title: 'Auto shipment export result (sale)', message: 'ok' }));
    expect(out.visible).toBe(false);
  });

  it('strips export prefix in the generic shipment fallback', () => {
    const out = render(log({
      title: 'Dilovod shipment export result',
      orderNumber: '1',
      message: '[Мануал] Помилка відвантаження замовлення 1: щось нове',
    }));
    expect(out.ruleName).toBe('Помилка відвантаження (інше)');
    expect(out.message).toBe('щось нове');
  });

  it('falls back to raw text without a rule', () => {
    const out = render(log({ category: 'storefront', status: 'error', title: 'X', message: 'Access denied' }));
    expect(out.ruleId).toBeNull();
    expect(out.group).toBe('system');
    expect(out.visible).toBe(true);
    expect(out.message).toBe('Доступ заборонено');
  });
});

describe('ruleEngine: helpers', () => {
  it('renders data paths and unknown vars as empty', () => {
    expect(renderTemplate('{{a}} {{missing}} {{data.x.y}}', { a: 'A' }, { x: { y: 5 } })).toBe('A 5');
  });

  it('glossary escapes literal phrases', () => {
    expect(applyGlossary('a.b and aXb', [{ phrase: 'a.b', replacement: 'Z', isRegex: false, enabled: true, position: 1 }])).toBe('Z and aXb');
  });

  it('rejects nested quantifiers and bad syntax', () => {
    expect(validatePattern('(a+)+').ok).toBe(false);
    expect(validatePattern('(').ok).toBe(false);
    expect(validatePattern('арт:\\s*(\\S+)').ok).toBe(true);
  });

  it('all default rules are valid', () => {
    for (const r of DEFAULT_NOTIFICATION_RULES) {
      expect(validateRule(r), r.name).toEqual([]);
    }
  });
});
