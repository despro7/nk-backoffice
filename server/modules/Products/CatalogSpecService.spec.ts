import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CATALOG_ACC_POLICY_GOOD as GOOD_POLICY } from '../../../shared/types/catalog.js';

type Draft = { goodId: string; specQty: number | null; componentsJson: unknown; comment: string; authorId: number | null };

const state: {
  components: Array<{ componentGoodId: string; qty: number; rowNum: number; unitId: string | null; note: string | null; cookingLossPercent: number }>;
  draft: Draft | null;
  versions: number[];
} = { components: [], draft: null, versions: [] };

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
  prisma: {
    catalogGood: {
      findUnique: vi.fn(async () => ({
        id: 'g1',
        name: 'Борщ',
        sku: 'B1',
        isGroup: false,
        accPolicyId: GOOD_POLICY,
        specQty: 1,
        productIngredientsJson: ['буряк'],
        productNutritionJson: null,
        components: state.components.map((c) => ({ ...c, componentGood: { name: c.componentGoodId, sku: null } })),
      })),
      findMany: vi.fn(async ({ where }: any) =>
        (where.id.in as string[]).map((id) => ({ id, name: id, sku: null })),
      ),
    },
    catalogSpecDraft: {
      findUnique: vi.fn(async () => state.draft),
    },
    catalogSpecVersion: {
      aggregate: vi.fn(async () => ({ _max: { version: state.versions.length ? Math.max(...state.versions) : null } })),
    },
  },
}));

vi.mock('./ProductsCatalogService.js', () => ({ productsCatalogService: {} }));
vi.mock('./CatalogGoodAuditService.js', () => ({
  catalogGoodAuditService: { onExternalSpecChange: vi.fn(), logEvent: vi.fn() },
}));

import { CatalogSpecError, CatalogSpecService } from './CatalogSpecService.js';

const row = (id: string, qty: number) => ({ componentGoodId: id, qty, rowNum: 1, unitId: 'u', note: null, cookingLossPercent: 0 });

describe('CatalogSpecService.prepareUpdate', () => {
  const service = new CatalogSpecService();
  const editor = { userId: 5, canApprove: false };
  const approver = { userId: 1, canApprove: true };

  beforeEach(() => {
    state.components = [row('a', 1)];
    state.draft = null;
    state.versions = [1];
  });

  it('passes unchanged spec through without spec fields', async () => {
    const result = await service.prepareUpdate('g1', { name: 'X', components: [row('a', 1)], specQty: 1 }, editor);
    expect(result.input).toEqual({ name: 'X' });
  });

  it('requires a comment when an editor changes the spec', async () => {
    await expect(
      service.prepareUpdate('g1', { components: [row('a', 2)], specQty: 1 }, editor),
    ).rejects.toMatchObject({ code: 'SPEC_COMMENT_REQUIRED', status: 400 });
  });

  it('strips spec from the save for an editor and defers it to a draft', async () => {
    const result = await service.prepareUpdate(
      'g1',
      { name: 'X', components: [row('a', 2)], specQty: 1, specComment: 'більше буряка' },
      editor,
    );
    expect(result.input).toEqual({ name: 'X' });
    expect(result.input).not.toHaveProperty('specComment');
  });

  it('keeps spec in the save for an approver', async () => {
    const result = await service.prepareUpdate('g1', { components: [row('a', 2)], specQty: 1 }, approver);
    expect(result.input.components).toHaveLength(1);
  });

  it('rejects spec edits on top of approved spec while a draft exists', async () => {
    state.draft = { goodId: 'g1', specQty: 1, componentsJson: [row('a', 3)], comment: 'c', authorId: 5 };
    const error = await service
      .prepareUpdate('g1', { components: [row('a', 2)], specQty: 1, specComment: 'x' }, editor)
      .catch((e) => e);
    expect(error).toBeInstanceOf(CatalogSpecError);
    expect(error.code).toBe('SPEC_DRAFT_EXISTS');
  });

  it('lets an editor update the loaded draft, reusing its comment', async () => {
    state.draft = { goodId: 'g1', specQty: 1, componentsJson: [row('a', 3)], comment: 'c', authorId: 5 };
    const result = await service.prepareUpdate(
      'g1',
      { components: [row('a', 4)], specQty: 1, specDraftEdit: true },
      editor,
    );
    expect(result.input).not.toHaveProperty('components');
  });

  it('does not auto-approve when an approver saves the loaded draft unchanged', async () => {
    state.draft = { goodId: 'g1', specQty: 1, componentsJson: [row('a', 3)], comment: 'c', authorId: 5 };
    const result = await service.prepareUpdate(
      'g1',
      { components: [row('a', 3)], specQty: 1, specDraftEdit: true },
      approver,
    );
    expect(result.input).not.toHaveProperty('components');
  });
});
