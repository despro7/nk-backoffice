import { describe, expect, it } from 'vitest';
import type { WarehouseStatementConstructorPreset } from '@shared/types/warehouseStatement';
import {
  periodFromPresetKey,
  presetSpecFromDraft,
  presetSpecSignature,
  relativePeriodKey,
} from './warehouseStatementUtils';

const draft: WarehouseStatementConstructorPreset = {
  period: { mode: 'dateRange', startDate: '2026-01-05', endDate: '2026-01-20' },
  dimensionFilters: { storage: ['2', '1'] },
  groupIds: ['g1'],
  exclusions: [{ dimensionId: 'good', valueId: '7', label: 'Товар' }],
  grouping: ['storage', 'group'],
  columns: ['qtyStart', 'qtyFinal'],
  hideZeroQty: true,
  hideInactive: true,
};

describe('relativePeriodKey', () => {
  it('accepts standard presets only', () => {
    expect(relativePeriodKey('lastMonth')).toBe('lastMonth');
    expect(relativePeriodKey('custom')).toBeUndefined();
    expect(relativePeriodKey(null)).toBeUndefined();
    expect(relativePeriodKey('unknownKey')).toBeUndefined();
  });
});

describe('periodFromPresetKey', () => {
  it('maps today to asOfDate and lastMonth to a date range', () => {
    expect(periodFromPresetKey('today')?.mode).toBe('asOfDate');
    expect(periodFromPresetKey('lastMonth')?.mode).toBe('dateRange');
    expect(periodFromPresetKey('custom')).toBeNull();
  });
});

describe('presetSpecFromDraft', () => {
  it('stores relative period key instead of dates', () => {
    const spec = presetSpecFromDraft(draft, 'lastMonth', 'public');
    expect(spec.periodPresetKey).toBe('lastMonth');
    expect(spec.period).toBeUndefined();
  });

  it('keeps custom dates only in private presets', () => {
    expect(presetSpecFromDraft(draft, 'custom', 'private').period).toEqual(draft.period);
    expect(presetSpecFromDraft(draft, 'custom', 'public').period).toBeUndefined();
  });
});

describe('presetSpecSignature', () => {
  it('ignores filter order and exclusion labels', () => {
    const a = presetSpecFromDraft(draft, 'lastMonth', 'private');
    const b = presetSpecFromDraft(
      {
        ...draft,
        dimensionFilters: { storage: ['1', '2'] },
        exclusions: [{ dimensionId: 'good', valueId: '7' }],
      },
      'lastMonth',
      'private',
    );
    expect(presetSpecSignature(a)).toBe(presetSpecSignature(b));
  });

  it('detects column order and toggle changes', () => {
    const base = presetSpecFromDraft(draft, 'lastMonth', 'private');
    expect(presetSpecSignature(base)).not.toBe(
      presetSpecSignature({ ...base, columns: ['qtyFinal', 'qtyStart'] }),
    );
    expect(presetSpecSignature(base)).not.toBe(presetSpecSignature({ ...base, hideInactive: false }));
  });
});
