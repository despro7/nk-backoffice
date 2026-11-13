import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, string>();

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
  prisma: {
    settingsBase: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { value: rows.get(where.key) } : null,
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        rows.set(where.key, rows.has(where.key) ? update.value : create.value);
        return {};
      }),
    },
  },
}));

vi.mock('../../lib/jsonCollection.js', () => ({
  JsonCollection: class {
    async exists() {
      return true;
    }
    async read() {
      return [];
    }
    async mutate(fn: (draft: { items: unknown[]; allocateId: () => number }) => unknown) {
      return fn({ items: [], allocateId: () => 1 });
    }
  },
}));

const { parseJsonBoolean, productionSettingsService } = await import('./ProductionSettingsService.js');

describe('parseJsonBoolean', () => {
  it('accepts only JSON true', () => {
    expect(parseJsonBoolean('true')).toBe(true);
    expect(parseJsonBoolean('false')).toBe(false);
    expect(parseJsonBoolean('"true"')).toBe(false);
    expect(parseJsonBoolean('{broken')).toBe(false);
    expect(parseJsonBoolean(null)).toBe(false);
    expect(parseJsonBoolean(undefined)).toBe(false);
  });
});

describe('ProductionSettingsService specDraftAutoEdit', () => {
  beforeEach(() => rows.clear());

  it('defaults to false when the key is missing', async () => {
    const settings = await productionSettingsService.getSettings();
    expect(settings.specDraftAutoEdit).toBe(false);
  });

  it('saves and reads the flag', async () => {
    const saved = await productionSettingsService.saveSettings({
      lossTypes: [],
      lossFormula: 'additive',
      specDraftAutoEdit: true,
    });
    expect(saved.specDraftAutoEdit).toBe(true);
    expect(rows.get('production_spec_draft_auto_edit')).toBe('true');
  });

  it('keeps the flag when the input omits it', async () => {
    rows.set('production_spec_draft_auto_edit', 'true');
    const saved = await productionSettingsService.saveSettings({ lossTypes: [], lossFormula: 'additive' });
    expect(saved.specDraftAutoEdit).toBe(true);
  });

  it('rejects a non-boolean value', async () => {
    await expect(
      productionSettingsService.saveSettings({
        lossTypes: [],
        lossFormula: 'additive',
        specDraftAutoEdit: 'yes' as unknown as boolean,
      }),
    ).rejects.toThrow('Некоректне значення');
  });
});
