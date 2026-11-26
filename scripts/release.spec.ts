import { describe, expect, it } from 'vitest';
// @ts-ignore CommonJS без типів
import lib from './release-notes-lib.cjs';
import releaseNotes from '../shared/releaseNotes.json';
import { ALL_PERMISSION_KEYS } from '../shared/constants/permissions';
import { filterReleasesByPermissions, formatReleaseDate } from '../shared/utils/releaseNotes';
import type { Release, ReleaseNotes } from '../shared/types/releaseNotes';

const { validateReleaseNotes, nextVersion, applyRelease } = lib;
const fixed = { type: 'fixed' as const, text: 'a' };
const added = { type: 'new' as const, text: 'b' };

describe('nextVersion', () => {
  it('піднімає patch без нових функцій', () => {
    expect(nextVersion('0.4.1', [fixed, { type: 'improved', text: 'c' }])).toBe('0.4.2');
  });

  it('піднімає minor, якщо є пункт new', () => {
    expect(nextVersion('0.4.1', [fixed, added])).toBe('0.5.0');
  });

  it('піднімає major лише з прапорцем', () => {
    expect(nextVersion('0.4.1', [added], { major: true })).toBe('1.0.0');
    expect(nextVersion('0.9.9', [added])).toBe('0.10.0');
  });

  it('відхиляє некоректну версію', () => {
    expect(() => nextVersion('1.0', [fixed])).toThrow();
  });
});

describe('applyRelease', () => {
  it('переносить unreleased у перший реліз', () => {
    const notes: ReleaseNotes = {
      unreleased: [fixed],
      releases: [{ version: '0.1.0', date: '2026-01-01', items: [added] }],
    };
    const result = applyRelease(notes, '0.1.1', '2026-01-02');
    expect(result.unreleased).toEqual([]);
    expect(result.releases.map((r: Release) => r.version)).toEqual(['0.1.1', '0.1.0']);
    expect(result.releases[0].items).toEqual([fixed]);
  });
});

describe('validateReleaseNotes', () => {
  it('приймає shared/releaseNotes.json', () => {
    expect(validateReleaseNotes(releaseNotes)).toEqual([]);
  });

  it('використовує лише наявні ключі прав', () => {
    const notes = releaseNotes as ReleaseNotes;
    const used = [...notes.unreleased, ...notes.releases.flatMap((r) => r.items)]
      .map((item) => item.permission)
      .filter(Boolean);
    expect(used.filter((key) => !ALL_PERMISSION_KEYS.includes(key as never))).toEqual([]);
  });

  it('знаходить помилки', () => {
    const errors = validateReleaseNotes({
      unreleased: [{ type: 'other', text: ' ' }],
      releases: [
        { version: '0.1.0', date: '01.01.2026', items: [] },
        { version: '0.2.0', date: '2026-01-01', items: [] },
      ],
    });
    expect(errors).toHaveLength(4);
  });
});

describe('показ релізів', () => {
  const releases: Release[] = [
    { version: '0.2.0', date: '2026-11-26', items: [{ ...fixed, permission: 'page.reports.sales' }] },
    { version: '0.1.0', date: '2026-11-25', items: [added, { ...fixed, permission: 'page.hr.payroll' }] },
  ];

  it('ховає пункти без права і порожні релізи', () => {
    expect(filterReleasesByPermissions(releases, [])).toEqual([
      { version: '0.1.0', date: '2026-11-25', items: [added] },
    ]);
  });

  it('показує все для wildcard', () => {
    expect(filterReleasesByPermissions(releases, ['*'])).toEqual(releases);
  });

  it('форматує дату без «р.»', () => {
    expect(formatReleaseDate('2026-11-26')).toBe('26 листопада 2026');
  });
});
