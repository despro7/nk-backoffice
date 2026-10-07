import { describe, expect, it, vi } from 'vitest';
import { transferTimesheetEntries } from './HrEmploymentMerge.js';

describe('transferTimesheetEntries', () => {
  it('переносить записи без конфліктів і видаляє дублікати', async () => {
    const fromEntries = [
      { id: 1, monthId: 10, date: new Date('2026-03-03T00:00:00.000Z') },
      { id: 2, monthId: 10, date: new Date('2026-03-04T00:00:00.000Z') },
    ];
    const toEntries = [{ monthId: 10, date: new Date('2026-03-03T00:00:00.000Z') }];

    const tx = {
      hrTimesheetEntry: {
        findMany: vi.fn()
          .mockResolvedValueOnce(fromEntries)
          .mockResolvedValueOnce(toEntries),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await transferTimesheetEntries(tx as never, 5, 9);
    expect(result).toEqual({ moved: 1, deleted: 1 });
    expect(tx.hrTimesheetEntry.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
    expect(tx.hrTimesheetEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
      data: { employmentId: 9 },
    });
  });
});
