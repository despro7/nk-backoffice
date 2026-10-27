import { describe, expect, it } from 'vitest';
import { formatGoogleGenAiError } from './googleLlmProviderError.js';

describe('formatGoogleGenAiError', () => {
  it('extracts nested error.message from ApiError-style string', () => {
    const err = new Error(
      'ApiError: {"error":{"code":404,"message":"Model not found","status":"NOT_FOUND"}}',
    );
    expect(formatGoogleGenAiError(err)).toBe('Model not found');
  });
});
