import type { Prisma } from '@prisma/client';
import { logServer } from '../../lib/utils.js';

/** Переносить табель, ставки, розрахунок і виплати з однієї зайнятості в іншу. */
export async function mergeEmploymentRecords(
  tx: Prisma.TransactionClient,
  fromId: number,
  toId: number,
): Promise<void> {
  if (fromId === toId) return;

  const fromEntries = await tx.hrTimesheetEntry.findMany({ where: { employmentId: fromId } });
  for (const entry of fromEntries) {
    const conflict = await tx.hrTimesheetEntry.findUnique({
      where: {
        monthId_employmentId_date: {
          monthId: entry.monthId,
          employmentId: toId,
          date: entry.date,
        },
      },
    });
    if (conflict) {
      await tx.hrTimesheetEntry.delete({ where: { id: entry.id } });
    } else {
      await tx.hrTimesheetEntry.update({
        where: { id: entry.id },
        data: { employmentId: toId },
      });
    }
  }

  const fromPayrollLines = await tx.hrPayrollLine.findMany({ where: { employmentId: fromId } });
  for (const line of fromPayrollLines) {
    const conflict = await tx.hrPayrollLine.findUnique({
      where: {
        periodId_employmentId: {
          periodId: line.periodId,
          employmentId: toId,
        },
      },
    });
    if (conflict) {
      await tx.hrPayrollLine.delete({ where: { id: line.id } });
    } else {
      await tx.hrPayrollLine.update({
        where: { id: line.id },
        data: { employmentId: toId },
      });
    }
  }

  await tx.hrPayTerms.updateMany({ where: { employmentId: fromId }, data: { employmentId: toId } });
  await tx.hrPayout.updateMany({ where: { employmentId: fromId }, data: { employmentId: toId } });
  await tx.hrEmployment.delete({ where: { id: fromId } });
  logServer(`[hr] merged employment ${fromId} -> ${toId}`);
}
