import type { HrPayrollPeriodMode } from '../types/hr.js';

/** Стабільний ключ знімка розрахунку для year/month + режиму періоду. */
export function buildPayrollPeriodKey(
  periodMode: HrPayrollPeriodMode,
  dateFrom?: string | null,
  dateTo?: string | null,
): string {
  if (periodMode === 'custom') {
    if (!dateFrom || !dateTo) {
      throw new Error('Для довільного періоду потрібні dateFrom і dateTo');
    }
    return `custom:${dateFrom}:${dateTo}`;
  }
  return periodMode;
}

export function parsePayrollPeriodKey(periodKey: string): {
  periodMode: HrPayrollPeriodMode;
  dateFrom: string | null;
  dateTo: string | null;
} {
  if (periodKey === 'production' || periodKey === 'month') {
    return { periodMode: periodKey, dateFrom: null, dateTo: null };
  }
  if (periodKey.startsWith('custom:')) {
    const [, dateFrom, dateTo] = periodKey.split(':');
    if (dateFrom && dateTo) {
      return { periodMode: 'custom', dateFrom, dateTo };
    }
  }
  return { periodMode: 'production', dateFrom: null, dateTo: null };
}
