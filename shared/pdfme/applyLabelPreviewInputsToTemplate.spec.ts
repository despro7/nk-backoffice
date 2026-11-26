import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import {
  applyLabelPreviewInputsToTemplate,
  extractOverwrittenLabelContents,
  restoreLabelTemplateContents,
} from './applyLabelPreviewInputsToTemplate.js';
import { buildPortionLabelTemplate } from './builtInLabelTemplates.js';

const template: LabelPdfmeTemplate = {
  ...buildPortionLabelTemplate(),
  schemas: [
    [
      { name: 'title_line1', type: 'text', content: 'Зразок', width: 10 },
      { name: 'static_note', type: 'text', content: 'Статичний', width: 10 },
    ],
  ],
};

describe('label mock contents snapshot', () => {
  const live = applyLabelPreviewInputsToTemplate(template, { title_line1: 'Живий товар' });
  const mocks = extractOverwrittenLabelContents(template, live);

  it('remembers only fields overwritten by live data', () => {
    expect(mocks).toEqual({ title_line1: 'Зразок' });
  });

  it('restores content and leaves geometry and other fields untouched', () => {
    const edited: LabelPdfmeTemplate = {
      ...live,
      schemas: [[{ ...live.schemas[0][0], width: 55 }, { ...live.schemas[0][1], content: 'Новий' }]],
    };
    const [title, note] = restoreLabelTemplateContents(edited, mocks).schemas[0];
    expect(title).toMatchObject({ content: 'Зразок', width: 55 });
    expect(note.content).toBe('Новий');
  });
});
