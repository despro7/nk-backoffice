import type { Prisma } from '@prisma/client';
import { logServer } from '../../lib/utils.js';

function timesheetEntryKey(monthId: number, date: Date): string {
  return `${monthId}|${date.toISOString().slice(0, 10)}`;
}

function ymdFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function payTermsOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ? ymdFromDate(aTo) : '9999-12-31';
  const bEnd = bTo ? ymdFromDate(bTo) : '9999-12-31';
  return ymdFromDate(aFrom) <= bEnd && ymdFromDate(bFrom) <= aEnd;
}

export interface EmploymentMergeStats {
  timesheetEntriesMoved: number;
  timesheetEntriesDeleted: number;
  payrollLinesMoved: number;
  payrollLinesDeleted: number;
  payTermsMoved: number;
  payTermsDeleted: number;
}

/** Переносить табель, ставки, розрахунок і виплати з однієї зайнятості в іншу. */
export async function mergeEmploymentRecords(
  tx: Prisma.TransactionClient,
  fromId: number,
  toId: number,
): Promise<EmploymentMergeStats> {
  if (fromId === toId) {
    return {
      timesheetEntriesMoved: 0,
      timesheetEntriesDeleted: 0,
      payrollLinesMoved: 0,
      payrollLinesDeleted: 0,
      payTermsMoved: 0,
      payTermsDeleted: 0,
    };
  }

  const [fromEntries, toEntries] = await Promise.all([
    tx.hrTimesheetEntry.findMany({
      where: { employmentId: fromId },
      select: { id: true, monthId: true, date: true },
    }),
    tx.hrTimesheetEntry.findMany({
      where: { employmentId: toId },
      select: { monthId: true, date: true },
    }),
  ]);

  const toEntryKeys = new Set(toEntries.map((entry) => timesheetEntryKey(entry.monthId, entry.date)));
  const entryIdsToDelete: number[] = [];
  const entryIdsToMove: number[] = [];

  for (const entry of fromEntries) {
    if (toEntryKeys.has(timesheetEntryKey(entry.monthId, entry.date))) {
      entryIdsToDelete.push(entry.id);
    } else {
      entryIdsToMove.push(entry.id);
    }
  }

  if (entryIdsToDelete.length > 0) {
    await tx.hrTimesheetEntry.deleteMany({ where: { id: { in: entryIdsToDelete } } });
  }
  if (entryIdsToMove.length > 0) {
    await tx.hrTimesheetEntry.updateMany({
      where: { id: { in: entryIdsToMove } },
      data: { employmentId: toId },
    });
  }

  const [fromPayrollLines, toPayrollLines] = await Promise.all([
    tx.hrPayrollLine.findMany({
      where: { employmentId: fromId },
      select: { id: true, periodId: true },
    }),
    tx.hrPayrollLine.findMany({
      where: { employmentId: toId },
      select: { periodId: true },
    }),
  ]);

  const toPeriodIds = new Set(toPayrollLines.map((line) => line.periodId));
  const lineIdsToDelete = fromPayrollLines
    .filter((line) => toPeriodIds.has(line.periodId))
    .map((line) => line.id);
  const lineIdsToMove = fromPayrollLines
    .filter((line) => !toPeriodIds.has(line.periodId))
    .map((line) => line.id);

  if (lineIdsToDelete.length > 0) {
    await tx.hrPayrollLine.deleteMany({ where: { id: { in: lineIdsToDelete } } });
  }
  if (lineIdsToMove.length > 0) {
    await tx.hrPayrollLine.updateMany({
      where: { id: { in: lineIdsToMove } },
      data: { employmentId: toId },
    });
  }

  const [fromPayTerms, toPayTerms] = await Promise.all([
    tx.hrPayTerms.findMany({ where: { employmentId: fromId } }),
    tx.hrPayTerms.findMany({ where: { employmentId: toId } }),
  ]);

  const payTermIdsToDelete: number[] = [];
  const payTermIdsToMove: number[] = [];

  for (const fromTerm of fromPayTerms) {
    const isDuplicate = toPayTerms.some(
      (toTerm) =>
        fromTerm.kind === toTerm.kind &&
        fromTerm.amount.equals(toTerm.amount) &&
        payTermsOverlap(
          fromTerm.effectiveFrom,
          fromTerm.effectiveTo,
          toTerm.effectiveFrom,
          toTerm.effectiveTo,
        ),
    );
    if (isDuplicate) {
      payTermIdsToDelete.push(fromTerm.id);
    } else {
      payTermIdsToMove.push(fromTerm.id);
    }
  }

  if (payTermIdsToDelete.length > 0) {
    await tx.hrPayTerms.deleteMany({ where: { id: { in: payTermIdsToDelete } } });
  }
  if (payTermIdsToMove.length > 0) {
    await tx.hrPayTerms.updateMany({
      where: { id: { in: payTermIdsToMove } },
      data: { employmentId: toId },
    });
  }

  await tx.hrPayout.updateMany({ where: { employmentId: fromId }, data: { employmentId: toId } });
  await tx.hrEmployment.delete({ where: { id: fromId } });
  logServer(`[hr] merged employment ${fromId} -> ${toId}`);

  return {
    timesheetEntriesMoved: entryIdsToMove.length,
    timesheetEntriesDeleted: entryIdsToDelete.length,
    payrollLinesMoved: lineIdsToMove.length,
    payrollLinesDeleted: lineIdsToDelete.length,
    payTermsMoved: payTermIdsToMove.length,
    payTermsDeleted: payTermIdsToDelete.length,
  };
}
