import { describe, expect, it } from 'vitest';
import {
  isGoogleLlmModelSupersededInCatalog,
  resolveGoogleLlmModelId,
} from './googleLlmModelAliases.js';

describe('resolveGoogleLlmModelId', () => {
  it('strips models/ prefix and maps 2.5 family to 3.5', () => {
    expect(resolveGoogleLlmModelId('models/gemini-2.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(resolveGoogleLlmModelId('gemini-2.5-flash')).toBe('gemini-3.5-flash');
    expect(resolveGoogleLlmModelId('gemini-2.5-pro')).toBe('gemini-3.5-pro');
    expect(resolveGoogleLlmModelId('gemini-3.5-flash')).toBe('gemini-3.5-flash');
  });
});

describe('isGoogleLlmModelSupersededInCatalog', () => {
  it('flags entire 2.5 family', () => {
    expect(isGoogleLlmModelSupersededInCatalog('gemini-2.5-flash-lite')).toBe(true);
    expect(isGoogleLlmModelSupersededInCatalog('gemini-2.5-flash')).toBe(true);
    expect(isGoogleLlmModelSupersededInCatalog('gemini-3.5-flash-lite')).toBe(false);
  });
});
