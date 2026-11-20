import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseStatementSavedPreset } from '../../../shared/types/warehouseStatement.js';

let stored: WarehouseStatementSavedPreset[] = [];
let nextId = 1;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

vi.mock('../../lib/jsonCollection.js', () => ({
  JsonCollection: class {
    async read() {
      return clone(stored);
    }
    async mutate(fn: (draft: { items: WarehouseStatementSavedPreset[]; allocateId: () => number }) => unknown) {
      const draft = { items: clone(stored), allocateId: () => nextId++ };
      const result = await fn(draft);
      stored = draft.items;
      return result;
    }
  },
}));

const {
  normalizePresetName,
  normalizePresetSpec,
  warehouseStatementPresetsService: service,
  WarehouseStatementPresetError,
} = await import('./warehouseStatementPresets.js');

const alice = { userId: 1, name: 'Alice', isAdmin: false };
const bob = { userId: 2, name: 'Bob', isAdmin: false };
const admin = { userId: 9, name: 'Admin', isAdmin: true };

const baseSpec = {
  grouping: ['storage', 'group'],
  columns: ['qtyStart', 'qtyFinal'],
  dimensionFilters: { storage: ['1'] },
};

beforeEach(() => {
  stored = [];
  nextId = 1;
});

describe('normalizePresetName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePresetName('  Склад   основний ')).toBe('Склад основний');
  });

  it('rejects empty and too long names', () => {
    expect(() => normalizePresetName('   ')).toThrow(WarehouseStatementPresetError);
    expect(() => normalizePresetName('x'.repeat(81))).toThrow(WarehouseStatementPresetError);
  });
});

describe('normalizePresetSpec', () => {
  it('keeps custom period only in private presets', () => {
    const period = { mode: 'dateRange', startDate: '2026-01-01', endDate: '2026-01-31' };
    expect(normalizePresetSpec({ ...baseSpec, period }, 'private').period).toEqual(period);
    expect(normalizePresetSpec({ ...baseSpec, period }, 'public').period).toBeUndefined();
  });

  it('prefers relative period key over dates', () => {
    const spec = normalizePresetSpec(
      { ...baseSpec, periodPresetKey: 'lastMonth', period: { mode: 'asOfDate', asOfDate: '2026-01-01' } },
      'private',
    );
    expect(spec.periodPresetKey).toBe('lastMonth');
    expect(spec.period).toBeUndefined();
  });

  it('drops unknown keys and invalid values', () => {
    const spec = normalizePresetSpec(
      {
        ...baseSpec,
        expenseKinds: ['sale', 'bogus'],
        exclusions: [{ dimensionId: 'group', valueId: '5' }, { dimensionId: '', valueId: '6' }],
        hideInactive: true,
        evil: 'x',
      },
      'private',
    );
    expect(spec.expenseKinds).toEqual(['sale']);
    expect(spec.exclusions).toEqual([{ dimensionId: 'group', valueId: '5' }]);
    expect(spec.hideInactive).toBe(true);
    expect('evil' in spec).toBe(false);
  });
});

describe('warehouseStatementPresetsService', () => {
  it('shows own and public presets only', async () => {
    await service.create(alice, { name: 'Private A', spec: baseSpec });
    await service.create(alice, { name: 'Public A', visibility: 'public', spec: baseSpec });
    await service.create(bob, { name: 'Private B', spec: baseSpec });

    const forBob = await service.list(bob);
    expect(forBob.map((item) => item.name).sort()).toEqual(['Private B', 'Public A']);
    const publicA = forBob.find((item) => item.name === 'Public A');
    expect(publicA?.canEdit).toBe(false);
    expect(publicA?.isOwn).toBe(false);
  });

  it('rejects duplicate names for the same owner', async () => {
    await service.create(alice, { name: 'Звіт', spec: baseSpec });
    await expect(service.create(alice, { name: 'звіт', spec: baseSpec })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.create(bob, { name: 'Звіт', spec: baseSpec })).resolves.toBeTruthy();
  });

  it('lets only owner or admin edit and delete', async () => {
    const created = await service.create(alice, { name: 'Shared', visibility: 'public', spec: baseSpec });

    await expect(service.update(bob, created.id, { name: 'Hijack' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.remove(bob, created.id)).rejects.toMatchObject({ statusCode: 403 });

    const renamed = await service.update(admin, created.id, { name: 'Renamed' });
    expect(renamed.name).toBe('Renamed');
    expect(renamed.ownerUserId).toBe(alice.userId);

    await service.remove(alice, created.id);
    expect(await service.list(alice)).toEqual([]);
  });

  it('hides private presets from other users, admin included', async () => {
    const created = await service.create(alice, { name: 'Mine', spec: baseSpec });
    await expect(service.update(admin, created.id, { name: 'X' })).rejects.toMatchObject({ statusCode: 404 });
    expect(await service.list(admin)).toEqual([]);
  });

  it('strips custom period when a preset becomes public', async () => {
    const created = await service.create(alice, {
      name: 'Dates',
      spec: { ...baseSpec, period: { mode: 'asOfDate', asOfDate: '2026-03-01' } },
    });
    expect(created.spec.period).toBeDefined();

    const published = await service.update(alice, created.id, { visibility: 'public' });
    expect(published.visibility).toBe('public');
    expect(published.spec.period).toBeUndefined();
  });
});
