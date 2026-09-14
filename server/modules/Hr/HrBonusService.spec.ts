import { describe, expect, it } from 'vitest';
import { HrBonusService } from './HrBonusService.js';

describe('HrBonusService', () => {
  const service = new HrBonusService();

  it('list кидає помилку, якщо dateFrom пізніше dateTo', async () => {
    await expect(
      service.list({ dateFrom: '2026-02-01', dateTo: '2026-01-31' }),
    ).rejects.toMatchObject({
      message: 'Дата початку не може бути пізніше дати кінця',
    });
  });
});
