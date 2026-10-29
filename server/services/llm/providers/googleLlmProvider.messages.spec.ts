import { describe, expect, it } from 'vitest';
import {
  normalizeGeminiFunctionResponsePayload,
  toGeminiContentsForTest,
} from './googleLlmProvider.js';

describe('toGeminiContents (tool loop)', () => {
  it('ends with user functionResponse after model functionCall', () => {
    const contents = toGeminiContentsForTest([
      { role: 'user', content: 'Що на вітрині?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'get_storefront_catalog', arguments: { limit: 5 } }],
      },
      {
        role: 'tool',
        name: 'get_storefront_catalog',
        toolCallId: 'c1',
        content: '{"items":[]}',
      },
    ]);
    expect(contents.at(-1)?.role).toBe('user');
    expect(contents.at(-1)?.parts[0]).toHaveProperty('functionResponse');
    expect(contents.some((c) => c.role === 'model' && c.parts.some((p) => 'functionCall' in p))).toBe(
      true,
    );
  });

  it('replays verbatim googleModelParts for model turn', () => {
    const modelParts = [
      { thought: true, text: 'internal' },
      {
        functionCall: { name: 'get_storefront_catalog', args: { limit: 5 } },
        thoughtSignature: 'sig-abc',
      },
    ];
    const contents = toGeminiContentsForTest([
      { role: 'user', content: 'Що на вітрині?' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'get_storefront_catalog', arguments: { limit: 5 } }],
        googleModelParts: modelParts,
      },
      {
        role: 'tool',
        name: 'get_storefront_catalog',
        toolCallId: 'c1',
        content: '{"items":[]}',
      },
    ]);
    const modelTurn = contents.find((c) => c.role === 'model');
    expect(modelTurn?.parts).toEqual(modelParts);
  });

  it('wraps array tool JSON in items for functionResponse', () => {
    const contents = toGeminiContentsForTest([
      { role: 'user', content: 'каталог' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'get_storefront_catalog', arguments: {} }],
      },
      {
        role: 'tool',
        name: 'get_storefront_catalog',
        toolCallId: 'c1',
        content: '[{"sku":"A1","name":"Test"}]',
      },
    ]);
    const fr = contents.at(-1)?.parts[0] as { functionResponse: { response: { items: unknown[] } } };
    expect(fr.functionResponse.response).toEqual({
      items: [{ sku: 'A1', name: 'Test' }],
    });
  });
});

describe('normalizeGeminiFunctionResponsePayload', () => {
  it('wraps arrays', () => {
    expect(normalizeGeminiFunctionResponsePayload([1, 2])).toEqual({ items: [1, 2] });
  });
});
