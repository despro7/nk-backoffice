import { describe, expect, it } from 'vitest';
import {
  cancelNameMatches,
  hasFullName,
  isCancelCandidateStatus,
  orderCancelMode,
  orderTokenMatches,
} from './chatwootBotOrderCancelRules.js';

describe('cancelNameMatches', () => {
  it('accepts surname + name in any order and case', () => {
    expect(cancelNameMatches('іванов петро', 'Іванов Петро Миколайович')).toBe(true);
    expect(cancelNameMatches('Петро Іванов', 'Іванов Петро')).toBe(true);
    expect(cancelNameMatches("Мар'яна Коваль", 'Коваль Марʼяна')).toBe(true);
  });

  it('rejects a single word or a wrong name', () => {
    expect(cancelNameMatches('Петро', 'Іванов Петро')).toBe(false);
    expect(cancelNameMatches('Петро Сидоренко', 'Іванов Петро')).toBe(false);
    expect(cancelNameMatches('Петро Іванов', null)).toBe(false);
  });

  it('detects whether a full name was given', () => {
    expect(hasFullName('Іванов Петро')).toBe(true);
    expect(hasFullName('Петро')).toBe(false);
  });
});

describe('order cancel status rules', () => {
  const settings = { orderCancelAutoStatuses: ['1', '2'], orderCancelSemiAutoStatuses: ['3', '4', '9'] };

  it('classifies statuses', () => {
    expect(orderCancelMode(settings, '1')).toBe('auto');
    expect(orderCancelMode(settings, '4')).toBe('semi');
    expect(orderCancelMode({ ...settings, orderCancelSemiAutoStatuses: [] }, '4')).toBe('operator');
  });

  it('excludes finished and deleted orders', () => {
    expect(['5', '6', '7', '8'].some(isCancelCandidateStatus)).toBe(false);
    expect(isCancelCandidateStatus('9')).toBe(true);
  });

  it('matches order tokens by digits', () => {
    expect(orderTokenMatches('SD24155', '24155')).toBe(true);
    expect(orderTokenMatches('№ 24155', null, '24155')).toBe(true);
    expect(orderTokenMatches('24156', '24155')).toBe(false);
  });
});
