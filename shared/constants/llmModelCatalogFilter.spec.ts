import { describe, expect, it } from 'vitest';
import {
  isGeminiPlatformChatModel,
  isOpenAiPlatformChatModel,
  isOpenRouterPlatformChatModel,
} from './llmModelCatalogFilter.js';

describe('isOpenAiPlatformChatModel', () => {
  it('allows gpt-5+ and chatgpt', () => {
    expect(isOpenAiPlatformChatModel('gpt-5.4-nano')).toBe(true);
    expect(isOpenAiPlatformChatModel('gpt-6-luna')).toBe(true);
    expect(isOpenAiPlatformChatModel('gpt-5.1-terra')).toBe(true);
    expect(isOpenAiPlatformChatModel('chatgpt-4o-latest')).toBe(true);
  });

  it('blocks gpt-4, o-series, live, legacy', () => {
    expect(isOpenAiPlatformChatModel('gpt-4.1-mini')).toBe(false);
    expect(isOpenAiPlatformChatModel('gpt-4o')).toBe(false);
    expect(isOpenAiPlatformChatModel('gpt-3.5-turbo')).toBe(false);
    expect(isOpenAiPlatformChatModel('o1')).toBe(false);
    expect(isOpenAiPlatformChatModel('o3-mini')).toBe(false);
    expect(isOpenAiPlatformChatModel('o4-mini')).toBe(false);
    expect(isOpenAiPlatformChatModel('gpt-live-1')).toBe(false);
    expect(isOpenAiPlatformChatModel('text-embedding-3-small')).toBe(false);
  });
});

describe('isGeminiPlatformChatModel', () => {
  it('allows gemini 2.0 / 3.x text (not 2.5)', () => {
    expect(isGeminiPlatformChatModel('models/gemini-2.0-flash')).toBe(true);
    expect(isGeminiPlatformChatModel('gemini-3-flash-preview')).toBe(true);
    expect(isGeminiPlatformChatModel('gemini-3.5-flash')).toBe(true);
    expect(isGeminiPlatformChatModel('gemini-2.5-flash')).toBe(false);
  });

  it('blocks embed, 1.x, image models', () => {
    expect(isGeminiPlatformChatModel('gemini-1.5-pro')).toBe(false);
    expect(isGeminiPlatformChatModel('gemini-3-pro-image-preview')).toBe(false);
    expect(isGeminiPlatformChatModel('imagen-3.0-generate-001')).toBe(false);
  });

  it('hides gemini 2.5 family', () => {
    expect(isGeminiPlatformChatModel('gemini-2.5-flash-lite')).toBe(false);
    expect(isGeminiPlatformChatModel('gemini-2.5-pro')).toBe(false);
    expect(isGeminiPlatformChatModel('gemini-3.5-flash-lite')).toBe(true);
  });
});

describe('isOpenRouterPlatformChatModel', () => {
  it('requires tools and applies provider id rules', () => {
    expect(
      isOpenRouterPlatformChatModel({
        id: 'openai/gpt-5.4-nano',
        supported_parameters: ['tools', 'max_tokens'],
        architecture: { output_modalities: ['text'], modality: 'text->text' },
      }),
    ).toBe(true);
    expect(
      isOpenRouterPlatformChatModel({
        id: 'openai/gpt-4.1-mini',
        supported_parameters: ['tools'],
        architecture: { output_modalities: ['text'] },
      }),
    ).toBe(false);
    expect(
      isOpenRouterPlatformChatModel({
        id: 'openai/o1',
        supported_parameters: ['tools'],
        architecture: { output_modalities: ['text'] },
      }),
    ).toBe(false);
  });
});
