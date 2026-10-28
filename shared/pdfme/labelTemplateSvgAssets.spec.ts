import { describe, expect, it } from 'vitest';
import { hydrateLabelTemplateContent } from './builtInLabelTemplates.js';
import { isStoredLabelSvgContentMissing } from './labelTemplateSvgAssets.js';

describe('isStoredLabelSvgContentMissing', () => {
  it('treats URL placeholders as missing', () => {
    expect(isStoredLabelSvgContentMissing('/nk-food-logo.svg')).toBe(true);
    expect(isStoredLabelSvgContentMissing('https://example.com/a.svg')).toBe(true);
  });

  it('keeps inline svg bodies', () => {
    expect(isStoredLabelSvgContentMissing('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(false);
  });
});

describe('hydrateLabelTemplateContent', () => {
  it('replaces url placeholder in svg slot with asset body', () => {
    const hydrated = hydrateLabelTemplateContent(
      {
        basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
        schemas: [[{ name: 'logo_svg', type: 'svg', content: '/nk-food-logo.svg' }]],
      },
      { logo_svg: '<svg id="logo"/>' },
    );
    expect(hydrated.schemas[0][0].content).toBe('<svg id="logo"/>');
  });
});
