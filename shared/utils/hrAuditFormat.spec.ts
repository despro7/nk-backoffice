import { describe, expect, it } from 'vitest';
import {
  sortHrAuditLogsChronological,
} from './hrAuditFormat.js';

describe('hrAuditFormat', () => {

  it('sorts audit logs chronologically (newest last)', () => {
    const sorted = sortHrAuditLogsChronological([
      { createdAt: '2026-09-13T10:00:00.000Z' },
      { createdAt: '2026-09-13T08:00:00.000Z' },
      { createdAt: '2026-09-13T12:00:00.000Z' },
    ]);
    expect(sorted.map((item) => item.createdAt)).toEqual([
      '2026-09-13T08:00:00.000Z',
      '2026-09-13T10:00:00.000Z',
      '2026-09-13T12:00:00.000Z',
    ]);
  });
});
