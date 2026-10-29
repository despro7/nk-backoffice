import { describe, expect, it } from 'vitest';
import {
  buildOpenAiMaxOutputTokens,
  buildOpenAiReasoningEffortForTools,
  buildOpenAiTemperature,
  openAiUsesMaxCompletionTokens,
} from './openaiCompletionParams.js';

describe('openAiUsesMaxCompletionTokens', () => {
  it('detects GPT-5 and o-series', () => {
    expect(openAiUsesMaxCompletionTokens('gpt-5.4-nano')).toBe(true);
    expect(openAiUsesMaxCompletionTokens('o3-mini')).toBe(true);
    expect(openAiUsesMaxCompletionTokens('gpt-4.1-mini')).toBe(false);
  });
});

describe('buildOpenAiMaxOutputTokens', () => {
  it('maps to the correct API field', () => {
    expect(buildOpenAiMaxOutputTokens('gpt-5.4-nano', 512)).toEqual({
      max_completion_tokens: 512,
    });
    expect(buildOpenAiMaxOutputTokens('gpt-4.1-mini', 512)).toEqual({ max_tokens: 512 });
  });
});

describe('buildOpenAiTemperature', () => {
  it('omits temperature for GPT-5', () => {
    expect(buildOpenAiTemperature('gpt-5.6-luna', 0.2)).toEqual({});
    expect(buildOpenAiTemperature('gpt-4.1-mini', 0.2)).toEqual({ temperature: 0.2 });
  });
});

describe('buildOpenAiReasoningEffortForTools', () => {
  it('sets none for GPT-6 with tools', () => {
    expect(buildOpenAiReasoningEffortForTools('gpt-6-luna-pro', true)).toEqual({
      reasoning_effort: 'none',
    });
    expect(buildOpenAiReasoningEffortForTools('openai/gpt-6-luna', true)).toEqual({
      reasoning_effort: 'none',
    });
    expect(buildOpenAiReasoningEffortForTools('gpt-4.1-mini', true)).toEqual({});
    expect(buildOpenAiReasoningEffortForTools('gpt-6-luna', false)).toEqual({});
  });
});
