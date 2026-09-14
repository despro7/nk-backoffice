import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrFopService } from './HrFopService.js';

const payrollLoadMock = vi.fn();
const bonusSumMock = vi.fn();
const bonusDraftCountMock = vi.fn();
const calendarGetMock = vi.fn();

vi.mock('../../lib/utils.js', () => ({
  prisma: {
    hrProductionWeek: { findUnique: vi.fn().mockResolvedValue(null) },
    hrTimesheetMonth: { findUnique: vi.fn() },
    hrEmployment: { findMany: vi.fn().mockResolvedValue([]) },
    hrBonus: { count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock('./HrPayrollService.js', () => ({
  hrPayrollService: {
    loadMonth: (...args: unknown[]) => payrollLoadMock(...args),
  },
}));

vi.mock('./HrBonusService.js', () => ({
  hrBonusService: {
    sumApprovedByEmployment: (...args: unknown[]) => bonusSumMock(...args),
    sumApprovedByEmploymentForDateRange: vi.fn().mockResolvedValue(new Map()),
    countDraftOverlappingRange: (...args: unknown[]) => bonusDraftCountMock(...args),
  },
}));

vi.mock('./HrProductionCalendarService.js', () => ({
  hrProductionCalendarService: {
    get: (...args: unknown[]) => calendarGetMock(...args),
  },
}));

describe('HrFopService.getSummary', () => {
  const service = new HrFopService();

  beforeEach(() => {
    payrollLoadMock.mockReset();
    bonusSumMock.mockReset();
    bonusDraftCountMock.mockReset();
    calendarGetMock.mockReset();

    calendarGetMock.mockResolvedValue({
      isEnabled: false,
      weekStartDay: 1,
      fopWeekdays: [1, 2, 3, 4, 5],
      label: 'Пн–Пт',
    });
    bonusSumMock.mockResolvedValue(new Map());
    bonusDraftCountMock.mockResolvedValue(0);
  });

  it('додає warning при 0 робочих днях у табелі за період', async () => {
    payrollLoadMock.mockResolvedValue({
      source: 'preview',
      period: { status: 'draft' },
      lines: [{
        employmentId: 1,
        displayName: 'Тестовий',
        payGroup: 'official_salary',
        legalEntityCode: 'fop',
        legalEntityName: 'ФОП',
        rateKind: 'salary',
        rate: '22000',
        normHours: '168',
        grossAccrued: '0',
        employerTotalCost: '0',
        esvAmount: '0',
        bonusAmount: '0',
      }],
    });

    const { prisma } = await import('../../lib/utils.js');
    vi.mocked(prisma.hrTimesheetMonth.findUnique).mockResolvedValue({
      entries: [],
    } as never);

    const summary = await service.getSummary({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-07',
    });

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0].includedDays).toBe(0);
    expect(summary.warnings.some((warning) => warning.includes('Немає робочих годин'))).toBe(true);
  });
});
