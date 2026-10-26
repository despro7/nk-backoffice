import { describe, expect, it } from 'vitest';
import { sanitizeLabelTemplateDefaults } from './labelTemplateDefaults.js';
import type { LabelTemplateDto } from '../types/labelTemplate.js';

const templates: LabelTemplateDto[] = [
  {
    id: 'box-good',
    slug: 'box-good',
    name: 'Коробка',
    iconKey: 'package',
    labelKind: 'portion',
    audience: 'good',
    isArchived: false,
    isDeletionLocked: false,
    schemaVersion: 2,
    updatedAt: '',
    updatedBy: null,
  },
];

describe('sanitizeLabelTemplateDefaults', () => {
  it('clears stale default when template slot no longer matches cell', () => {
    const matrix = sanitizeLabelTemplateDefaults(
      {
        good: { portion: null, box: 'box-good' },
        kit: { portion: null, box: null },
      },
      templates,
    );
    expect(matrix.good.box).toBeNull();
  });

  it('clears kit box default slot', () => {
    const matrix = sanitizeLabelTemplateDefaults(
      {
        good: { portion: null, box: null },
        kit: { portion: null, box: 'box-good' },
      },
      [
        {
          ...templates[0],
          id: 'box-good',
          labelKind: 'box',
          audience: 'kit',
        },
      ],
    );
    expect(matrix.kit.box).toBeNull();
  });
});
