import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { DEFAULT_LABEL_WEIGHT_SPACING } from '../utils/labelWeightSpacing.js';
import {
  applyNetWeightSuffixPreview,
  mockToleranceSpec,
  readLabelMockNetWeight,
  readNetWeightContent,
  stripNetWeightSuffixPreview,
  writeLabelMockNetWeight,
} from './labelNetWeightPreview.js';

function template(content: string, sampledata?: Array<Record<string, string>>): LabelPdfmeTemplate {
  return {
    basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
    schemas: [[{ name: 'net_weight', type: 'text', content }, { name: 'title_line1', type: 'text', content: 'Плов' }]],
    ...(sampledata ? { sampledata } : {}),
  };
}

const spacing = DEFAULT_LABEL_WEIGHT_SPACING;
/** Нерозривні та тонкі пробіли шаблону зводимо до звичайних. */
const plain = (value: string | null) => value?.replace(/\s/g, ' ');

describe('mock net weight in sampledata', () => {
  it('defaults to ℮ with a remembered 5% tolerance', () => {
    expect(readLabelMockNetWeight(template('380 г'))).toEqual({ mode: 'estimated', tolerance: '5%' });
  });

  it('round-trips and keeps other sample values', () => {
    const written = writeLabelMockNetWeight(template('380 г', [{ other: 'x' }]), {
      mode: 'tolerance',
      tolerance: '8%',
    });
    expect(written.sampledata?.[0]).toMatchObject({ other: 'x' });
    expect(readLabelMockNetWeight(written)).toEqual({ mode: 'tolerance', tolerance: '8%' });
    expect(mockToleranceSpec(readLabelMockNetWeight(written))).toBe('8%');
  });
});

describe('net weight preview in Designer', () => {
  it('shows ℮ or tolerance with template spacing, other fields untouched', () => {
    const withSign = applyNetWeightSuffixPreview(template('380 г'), '', spacing);
    expect(readNetWeightContent(withSign)).toBe('380 г ℮');
    expect(withSign.schemas[0][1].content).toBe('Плов');
    const withTolerance = applyNetWeightSuffixPreview(template('380 г'), '8%', spacing);
    expect(readNetWeightContent(withTolerance)).toBe('380 г ± 8%');
  });

  it('applies the same suffix to main_product_weight', () => {
    const both = template('380 г');
    both.schemas[0].push({ name: 'main_product_weight', type: 'text', content: '270г' });
    const shown = applyNetWeightSuffixPreview(both, '10%', spacing);
    expect(plain(readNetWeightContent(shown))).toBe('380 г ± 10%');
    expect(plain(readNetWeightContent(shown, 'main_product_weight'))).toBe('270 г ± 10%');
  });

  it('recovers the mock when the weight was edited in Designer', () => {
    const edited = '420 г ± 8%';
    expect(stripNetWeightSuffixPreview(edited, '380 г', '8%', spacing)).toBe('420 г');
    expect(stripNetWeightSuffixPreview('450 г', '380 г', '8%', spacing)).toBe('450 г');
  });
});
