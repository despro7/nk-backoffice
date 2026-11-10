import { describe, expect, it } from 'vitest';
import { PERMISSIONS, hasPermission } from '../constants/permissions';
import { batchAwaitsUser, batchNextActions } from './productionBatchActions';

const b = (status: Parameters<typeof batchNextActions>[0]['status'], stagesTotal = 3, stagesDone = 0) => ({
  status,
  stagesTotal,
  stagesDone,
});

describe('batchNextActions', () => {
  it('maps status to next action', () => {
    expect(batchNextActions(b('draft')).map((a) => a.id)).toEqual(['issue']);
    expect(batchNextActions(b('issued')).map((a) => a.id)).toEqual(['acceptProduction']);
    expect(batchNextActions(b('accepted')).map((a) => a.id)).toEqual(['cook', 'output']);
    expect(batchNextActions(b('cooking', 3, 3)).map((a) => a.id)).toEqual(['output']);
    expect(batchNextActions(b('accepted', 0, 0)).map((a) => a.id)).toEqual(['output']);
    expect(batchNextActions(b('output')).map((a) => a.id)).toEqual(['acceptFinished']);
    expect(batchNextActions(b('finished')).map((a) => a.id)).toEqual(['close']);
    expect(batchNextActions(b('closed'))).toEqual([]);
    expect(batchNextActions(b('cancelled'))).toEqual([]);
  });
});

describe('batchAwaitsUser', () => {
  it('matches by permission, admin sees all open', () => {
    const only = (keys: string[]) => (key: string) => hasPermission(keys, key);
    const cook = only([PERMISSIONS.ACTION_PRODUCTION_BATCHES_COOK]);
    expect(batchAwaitsUser(b('cooking'), cook)).toBe(true);
    expect(batchAwaitsUser(b('cooking', 3, 3), cook)).toBe(false);
    expect(batchAwaitsUser(b('draft'), cook)).toBe(false);
    expect(batchAwaitsUser(b('draft'), only([PERMISSIONS.ACTION_PRODUCTION_BATCHES_ISSUE]))).toBe(true);
    expect(batchAwaitsUser(b('draft'), only(['*']))).toBe(true);
    expect(batchAwaitsUser(b('closed'), only(['*']))).toBe(false);
  });
});
