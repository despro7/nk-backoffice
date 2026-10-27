import { describe, expect, it } from 'vitest';
import { resolveGoogleLlmModelId } from './googleLlmModelAliases.js';

describe('resolveGoogleLlmModelId', () => {
  it('strips models/ prefix and applies alias', () => {
    expect(resolveGoogleLlmModelId('models/gemini-2.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(resolveGoogleLlmModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });
});
