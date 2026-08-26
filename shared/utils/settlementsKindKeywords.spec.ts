import { describe, expect, it } from 'vitest';
import {
  addKeywordsToDict,
  applySettlementsKindKeywords,
  learnUniqueKeywords,
  matchSettlementsKind,
  tokenizePurpose,
} from './settlementsKindKeywords';

describe('tokenizePurpose / learnUniqueKeywords', () => {
  it('виділяє унікальне слово серед інших призначень', () => {
    const purpose = 'Оплата за овочі згід. накл. №2 від 22.07.2026р.';
    const others = [
      'Оплата за фрукти згід. накл. №3 від 21.07.2026р.',
      'Комісія банку за обслуговування',
      'Оплата за мʼясо згідно накл. №8 від 20.07.2026р.',
    ];
    expect(tokenizePurpose(purpose)).toEqual(['овочі']);
    expect(learnUniqueKeywords(purpose, others)).toEqual(['овочі']);
  });

  it('не додає слово, яке вже є в інших призначеннях', () => {
    const purpose = 'Оплата за овочі згід. накл. №2 від 22.07.2026р.';
    const others = ['Оплата за овочі згід. накл. №9 від 01.08.2026р.'];
    expect(learnUniqueKeywords(purpose, others)).toEqual([]);
  });
});

describe('matchSettlementsKind', () => {
  const suppliers = 'kind-suppliers';
  const cash = 'kind-cash';

  it('мапить призначення за ключовим словом', () => {
    const dict = { [suppliers]: ['овочі'], [cash]: ['готівка'] };
    expect(matchSettlementsKind('Оплата за овочі згід. накл. №2', dict)).toBe(suppliers);
    expect(matchSettlementsKind('Зняття готівка з банкомату', dict)).toBe(cash);
  });

  it('не мапить при нічиїй кількох видів', () => {
    const dict = { a: ['овочі'], b: ['овочі'] };
    expect(matchSettlementsKind('Оплата за овочі', dict)).toBeNull();
  });
});

describe('applySettlementsKindKeywords', () => {
  it('підставляє вид лише для рядків з дефолтом', () => {
    const dict = { suppliers: ['овочі'] };
    const rows = [
      { purpose: 'Оплата за овочі', direction: 'expense' as const, settlementsKind: 'default-out' },
      { purpose: 'Оплата за овочі', direction: 'expense' as const, settlementsKind: 'manual' },
    ];
    const next = applySettlementsKindKeywords(rows, dict, () => 'default-out', { onlyDefault: true });
    expect(next[0].settlementsKind).toBe('suppliers');
    expect(next[1].settlementsKind).toBe('manual');
  });
});

describe('addKeywordsToDict', () => {
  it('дедуплікує ключові слова', () => {
    const dict = addKeywordsToDict({}, 'k1', ['овочі', 'Овочі', '']);
    expect(dict.k1).toEqual(['овочі']);
  });
});
