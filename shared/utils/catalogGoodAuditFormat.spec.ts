import { describe, expect, it } from 'vitest';
import { buildCatalogAuditLines } from './catalogGoodAuditFormat.js';
import { diffSpecContent } from './catalogSpecContent.js';
import type { CatalogSpecComponent } from '../types/catalogSpec.js';

const row = (extra: Partial<CatalogSpecComponent> = {}): CatalogSpecComponent => ({
  componentGoodId: 'potato',
  name: 'Картопля',
  sku: null,
  qty: 55,
  rowNum: 1,
  unitId: null,
  note: null,
  cookingLossPercent: 44,
  ...extra,
});

describe('catalog audit: loss split', () => {
  it('shows loss types by name when the split changes', () => {
    const payload = diffSpecContent(
      'g1',
      { specQty: 1, components: [row()] },
      {
        specQty: 1,
        components: [
          row({
            losses: [
              { typeId: 1, percent: 32 },
              { typeId: 2, percent: 12 },
            ],
          }),
        ],
      },
    );
    const lines = buildCatalogAuditLines(payload, {
      lossTypes: [
        { id: 1, name: 'Очистка' },
        { id: 2, name: 'Розсип' },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('типи втрат: – → Очистка 32%, Розсип 12%');
  });
});
