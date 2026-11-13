import { describe, expect, it } from 'vitest';
import { directNotificationWhere } from './directNotify';

describe('directNotificationWhere', () => {
  it('matches events and object fields, with legacy titles for records without event', () => {
    const where = directNotificationWhere({
      category: 'catalog_spec',
      events: ['specReview'],
      match: { goodId: 'abc' },
      legacyTitles: ['Специфікація чекає на затвердження'],
    });
    expect(where.sql).toBe(
      "category = ? AND (JSON_UNQUOTE(JSON_EXTRACT(data, '$.event')) IN (?) OR (JSON_EXTRACT(data, '$.event') IS NULL AND title IN (?))) AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.goodId')) = ?",
    );
    expect(where.params).toEqual(['catalog_spec', 'specReview', 'Специфікація чекає на затвердження', 'abc']);
  });

  it('compares numeric ids as strings and supports several events', () => {
    const where = directNotificationWhere({
      category: 'production_batch',
      events: ['batchIssue', 'batchAcceptProduction'],
      match: { batchId: 12 },
    });
    expect(where.sql).toContain("IN (?,?)");
    expect(where.params).toEqual(['production_batch', 'batchIssue', 'batchAcceptProduction', '12']);
  });

  it('rejects unsafe keys and empty match', () => {
    expect(() => directNotificationWhere({ category: 'x', events: ['specReview'], match: { "a') OR 1=1 --": 1 } })).toThrow();
    expect(() => directNotificationWhere({ category: 'x', events: ['specReview'], match: {} })).toThrow();
  });
});
