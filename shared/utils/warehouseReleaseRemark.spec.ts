import { describe, expect, it } from 'vitest';
import {
  appendWarehouseReleaseDilovodRemark,
  buildWarehouseReleaseEditRemarkNote,
  stripWarehouseReleaseEditRemarkSuffixes,
} from './warehouseReleaseRemark.js';

describe('warehouseReleaseRemark', () => {
  it('builds short edit note without change details', () => {
    const note = buildWarehouseReleaseEditRemarkNote('George', [
      { field: 'operDate', from: 'a', to: 'b' },
    ]);
    expect(note.startsWith('Редакція → George,')).toBe(true);
    expect(note.includes('дата операції')).toBe(false);
    expect(note.includes('a → b')).toBe(false);
  });

  it('appends edit note to original comment', () => {
    const merged = appendWarehouseReleaseDilovodRemark(
      'Оригінальний коментар',
      'Редакція → George, 16.10.2026, 04:03:51',
    );
    expect(merged).toBe('Оригінальний коментар | Редакція → George, 16.10.2026, 04:03:51');
  });

  it('replaces legacy overwrite and previous edit suffixes', () => {
    const legacyOnly = stripWarehouseReleaseEditRemarkSuffixes(
      'Редаговано в backoffice (George, 16.10.2026, 04:03:51): дата операції: a → b',
    );
    expect(legacyOnly).toBe('');

    const withOriginal = stripWarehouseReleaseEditRemarkSuffixes(
      'Мій комент | Редакція → Alice, 15.10.2026, 10:00:00',
    );
    expect(withOriginal).toBe('Мій комент');

    const reedit = appendWarehouseReleaseDilovodRemark(
      'Мій комент | Редакція → Alice, 15.10.2026, 10:00:00',
      'Редакція → George, 16.10.2026, 04:03:51',
    );
    expect(reedit).toBe('Мій комент | Редакція → George, 16.10.2026, 04:03:51');
  });
});
