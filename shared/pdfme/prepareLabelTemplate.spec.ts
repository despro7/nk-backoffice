import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { LABEL_EMPTY_SVG, resolvePdfmeInputs } from '../utils/labelTemplateInputs.js';
import { hasEstimatedSignField, prepareLabelTemplateForRender } from './prepareLabelTemplate.js';

function template(fields: Array<Record<string, unknown>>): LabelPdfmeTemplate {
  return { basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] }, schemas: [fields] };
}

const netWeight = {
  name: 'net_weight',
  type: 'text',
  content: '',
  position: { x: 2.38, y: 82.56 },
  width: 16.67,
  height: 7.14,
  fontSize: 22,
  fontName: 'OpenSansCondensed',
};
const estimated = {
  name: 'estimated_svg',
  type: 'svg',
  content: '<svg>e</svg>',
  position: { x: 19.57, y: 82.54 },
  width: 5.56,
  height: 5.56,
  readOnly: true,
};
const manufacturer = {
  name: 'manufacturer',
  type: 'text',
  position: { x: 32.28, y: 78.43 },
  width: 24.31,
  height: 12.96,
};

function field(prepared: LabelPdfmeTemplate, name: string) {
  return prepared.schemas[0].find((row) => row.name === name);
}

describe('prepareLabelTemplateForRender: ℮ field', () => {
  it('unlocks the ℮ field and keeps net weight geometry', () => {
    const prepared = prepareLabelTemplateForRender(template([netWeight, estimated, manufacturer]));
    expect(field(prepared, 'estimated_svg')?.readOnly).toBe(false);
    expect(field(prepared, 'net_weight')?.width).toBe(16.67);
  });

  it('detects the separate ℮ field', () => {
    expect(hasEstimatedSignField(template([netWeight, estimated]))).toBe(true);
    expect(hasEstimatedSignField(template([netWeight]))).toBe(false);
  });
});

describe('resolvePdfmeInputs: net weight suffix', () => {
  const prepared = prepareLabelTemplateForRender(template([netWeight, estimated, manufacturer]));
  const portion = { netWeightSuffix: true };

  it('prints ℮ as text after the weight and hides the old SVG sign', () => {
    const inputs = resolvePdfmeInputs(prepared, { net_weight: '380г' }, portion);
    expect(inputs.net_weight).toBe('380\u200Aг\u00A0\u212E');
    expect(inputs.estimated_svg).toBe(LABEL_EMPTY_SVG);
  });

  it('prints the tolerance instead of ℮', () => {
    const inputs = resolvePdfmeInputs(
      prepared,
      { net_weight: '380г', net_weight_tolerance: '8%' },
      portion,
    );
    expect(inputs.net_weight).toBe('380\u200Aг\u00A0±\u200A8%');
  });

  it('works without a separate ℮ field in the template', () => {
    const plain = prepareLabelTemplateForRender(template([netWeight]));
    expect(resolvePdfmeInputs(plain, { net_weight: '380г' }, portion).net_weight).toBe(
      '380\u200Aг\u00A0\u212E',
    );
  });

  it('adds nothing when the suffix is off (box labels)', () => {
    const inputs = resolvePdfmeInputs(prepared, { net_weight: '380г', net_weight_tolerance: '8%' });
    expect(inputs.net_weight).toBe('380\u200Aг');
    expect(inputs.estimated_svg).toBe('<svg>e</svg>');
  });
});
