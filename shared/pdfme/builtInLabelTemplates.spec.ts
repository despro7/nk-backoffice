import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { LABEL_MVT_DESIGNER_SAMPLE } from '../utils/labelMvtVariables.js';
import { buildPortionLabelTemplate, hydrateLabelTemplateContent } from './builtInLabelTemplates.js';

function hydrateMvt(content: string): Record<string, string> {
  const template: LabelPdfmeTemplate = {
    ...buildPortionLabelTemplate(),
    schemas: [[{ name: 'custom', type: 'multiVariableText', text: '{kcal} {proteins}', content }]],
  };
  const field = hydrateLabelTemplateContent(template).schemas[0][0];
  return JSON.parse(String(field.content));
}

describe('hydrateLabelTemplateContent: MVT mock values', () => {
  it('keeps stored values, including empty ones', () => {
    expect(hydrateMvt(JSON.stringify({ kcal: '999', proteins: '' }))).toEqual({
      kcal: '999',
      proteins: '',
    });
  });

  it('fills missing variables from sample', () => {
    expect(hydrateMvt(JSON.stringify({ kcal: '999' }))).toEqual({
      kcal: '999',
      proteins: LABEL_MVT_DESIGNER_SAMPLE.proteins,
    });
  });

  it('falls back to sample on invalid JSON', () => {
    expect(hydrateMvt('{not json')).toEqual({
      kcal: LABEL_MVT_DESIGNER_SAMPLE.kcal,
      proteins: LABEL_MVT_DESIGNER_SAMPLE.proteins,
    });
  });
});
