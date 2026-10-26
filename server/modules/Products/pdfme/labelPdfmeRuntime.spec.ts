import { describe, expect, it } from 'vitest';
import { generateLabelPdfBuffer } from './labelPdfmeRuntime';
import { buildPortionLabelTemplate } from '../../../../shared/pdfme/builtInLabelTemplates';
import { buildLabelInputs } from '../../../../shared/utils/labelInputs';

describe('generateLabelPdfBuffer', () => {
  it('renders a cyrillic portion label', async () => {
    const inputs = buildLabelInputs({
      name: 'Суп гречаний',
      printName: 'зі свининою',
      ingredientsText: 'Картопля, сіль',
      nutrition: { proteins: '5,2', fats: '5,5', carbs: '4,8' },
      weightKg: 0.47,
      barcode: '2200000001146',
      batchNumber: '60915',
      expiresAt: '08.2027',
    });
    const buffer = await generateLabelPdfBuffer(
      buildPortionLabelTemplate() as never,
      inputs,
    );
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  }, 20000);
});
