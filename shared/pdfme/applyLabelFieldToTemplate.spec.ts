/* global structuredClone */
import { describe, expect, it } from 'vitest';
import type { LabelPdfmeTemplate } from '../types/labelTemplate.js';
import { applyLabelFieldToTemplate } from './applyLabelFieldToTemplate.js';

const source = {
  name: 'net_weight',
  type: 'text',
  content: '500 г',
  position: { x: 10, y: 20 },
  width: 30,
  height: 8,
  rotate: 0,
  fontName: 'ArialBold',
  fontSize: 20,
};

const other = { name: 'title_line1', type: 'text', content: 'A', position: { x: 1, y: 1 } };
const sign = { name: 'estimated_svg', type: 'svg', content: '<svg/>' };

function template(...pages: Array<Array<Record<string, unknown>>>): LabelPdfmeTemplate {
  return { basePdf: { width: 100, height: 100 }, schemas: pages };
}

const target = {
  id: 'target-id',
  name: 'net_weight',
  type: 'text',
  content: '380 г',
  position: { x: 1, y: 2 },
  width: 5,
  height: 5,
  fontName: 'Arial',
  fontSize: 10,
  dynamicFontSize: { min: 4, max: 12 },
};

describe('applyLabelFieldToTemplate', () => {
  it('copies only geometry', () => {
    const result = applyLabelFieldToTemplate(template([other, target]), source, {
      parts: ['geometry'],
    });
    expect(result.action).toBe('replaced');
    expect(result.template.schemas[0][0]).toBe(other);
    expect(result.template.schemas[0][1]).toEqual({
      ...target,
      position: { x: 10, y: 20 },
      width: 30,
      height: 8,
      rotate: 0,
    });
  });

  it('copies font and drops font props missing in source', () => {
    const result = applyLabelFieldToTemplate(template([target]), source, { parts: ['font'] });
    const field = result.template.schemas[0][0];
    expect(field).toMatchObject({ fontName: 'ArialBold', fontSize: 20, content: '380 г', width: 5 });
    expect(field).not.toHaveProperty('dynamicFontSize');
  });

  it('copies content only', () => {
    const result = applyLabelFieldToTemplate(template([target]), source, { parts: ['content'] });
    expect(result.template.schemas[0][0]).toEqual({ ...target, content: '500 г' });
  });

  it('rejects content copy between different types, allows whole field', () => {
    const mvt = { ...target, type: 'multiVariableText' };
    expect(() =>
      applyLabelFieldToTemplate(template([mvt]), source, { parts: ['content'] }),
    ).toThrow('Тип поля');
    const whole = applyLabelFieldToTemplate(template([mvt]), source, { parts: ['all'] });
    expect(whole.template.schemas[0][0]).toEqual({ ...source, id: 'target-id' });
  });

  it('replaces the field on any page', () => {
    const result = applyLabelFieldToTemplate(template([other], [target]), source, {
      parts: ['all'],
    });
    expect(result.action).toBe('replaced');
    expect(result.template.schemas[0]).toEqual([other]);
    expect(result.template.schemas[1][0].fontSize).toBe(20);
  });

  it('appends the whole field to page 0 when missing', () => {
    const result = applyLabelFieldToTemplate(
      template([other], []),
      { ...source, id: 'source-id' },
      { parts: ['geometry'] },
    );
    expect(result.action).toBe('added');
    expect(result.template.schemas[0]).toEqual([other, source]);
    expect(result.template.schemas[1]).toEqual([]);
  });

  it('removes the estimated sign only when asked', () => {
    const base = template([other, sign]);
    const kept = applyLabelFieldToTemplate(base, source, { parts: ['all'] });
    expect(kept.removedEstimatedSign).toBe(false);
    expect(kept.template.schemas[0]).toContainEqual(sign);

    const removed = applyLabelFieldToTemplate(base, source, {
      parts: ['all'],
      removeEstimatedSign: true,
    });
    expect(removed.removedEstimatedSign).toBe(true);
    expect(removed.template.schemas[0]).toEqual([other, source]);
  });

  it('does not mutate the input', () => {
    const base = template([structuredClone(target)]);
    applyLabelFieldToTemplate(base, source, { parts: ['all'] });
    expect(base.schemas[0][0]).toEqual(target);
  });

  it('rejects invalid input', () => {
    expect(() => applyLabelFieldToTemplate(template([]), source, { parts: [] })).toThrow();
    expect(() => applyLabelFieldToTemplate(template([]), {}, { parts: ['all'] })).toThrow();
    expect(() =>
      applyLabelFieldToTemplate(template([]), sign, { parts: ['all'], removeEstimatedSign: true }),
    ).toThrow();
  });
});
