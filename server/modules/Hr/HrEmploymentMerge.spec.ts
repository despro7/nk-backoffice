import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { mergeEmploymentRecords } from './HrEmploymentMerge.js';

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
}));

function createMockTx(state: {
  fromEntries: Array<{ id: number; monthId: number; date: Date }>;
  toEntries: Array<{ monthId: number; date: Date }>;
  fromPayTerms: Array<{
    id: number;
    kind: string;
    amount: Prisma.Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
  toPayTerms: Array<{
    id: number;
    kind: string;
    amount: Prisma.Decimal;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
}) {
  const deletedPayTermIds: number[] = [];
  const movedPayTermIds: number[] = [];

  const tx = {
    hrTimesheetEntry: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { employmentId: number } }) => {
        if (where.employmentId === 1) return Promise.resolve(state.fromEntries);
        if (where.employmentId === 2) return Promise.resolve(state.toEntries);
        return Promise.resolve([]);
      }),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    hrPayrollLine: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    hrPayTerms: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { employmentId: number } }) => {
        if (where.employmentId === 1) return Promise.resolve(state.fromPayTerms);
        if (where.employmentId === 2) return Promise.resolve(state.toPayTerms);
        return Promise.resolve([]);
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: number[] } } }) => {
        deletedPayTermIds.push(...where.id.in);
        return Promise.resolve({ count: where.id.in.length });
      }),
      updateMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: number[] } } }) => {
        movedPayTermIds.push(...where.id.in);
        return Promise.resolve({ count: where.id.in.length });
      }),
    },
    hrPayout: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    hrEmployment: {
      delete: vi.fn().mockResolvedValue({ id: 1 }),
    },
  };

  return { tx, deletedPayTermIds, movedPayTermIds };
}

describe('mergeEmploymentRecords', () => {
  it('видаляє дублікатні ставки з перетином періодів', async () => {
    const duplicateTerm = {
      id: 10,
      kind: 'salary',
      amount: new Prisma.Decimal('22000.00'),
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    };
    const { tx, deletedPayTermIds, movedPayTermIds } = createMockTx({
      fromEntries: [],
      toEntries: [],
      fromPayTerms: [duplicateTerm],
      toPayTerms: [{
        id: 20,
        kind: 'salary',
        amount: new Prisma.Decimal('22000.00'),
        effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        effectiveTo: null,
      }],
    });

    const stats = await mergeEmploymentRecords(tx as never, 1, 2);

    expect(stats.payTermsDeleted).toBe(1);
    expect(stats.payTermsMoved).toBe(0);
    expect(deletedPayTermIds).toEqual([10]);
    expect(movedPayTermIds).toEqual([]);
  });

  it('переносить унікальні ставки до цільової зайнятості', async () => {
    const { tx, deletedPayTermIds, movedPayTermIds } = createMockTx({
      fromEntries: [],
      toEntries: [],
      fromPayTerms: [{
        id: 11,
        kind: 'hourly',
        amount: new Prisma.Decimal('150.00'),
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        effectiveTo: null,
      }],
      toPayTerms: [],
    });

    const stats = await mergeEmploymentRecords(tx as never, 1, 2);

    expect(stats.payTermsDeleted).toBe(0);
    expect(stats.payTermsMoved).toBe(1);
    expect(deletedPayTermIds).toEqual([]);
    expect(movedPayTermIds).toEqual([11]);
  });
});
