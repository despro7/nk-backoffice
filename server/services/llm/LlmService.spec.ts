import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LlmService } from './LlmService.js';
import { llmSettingsService } from './LlmSettingsService.js';
import * as openaiProvider from './providers/openaiLlmProvider.js';
import { DEFAULT_LLM_PLATFORM_SETTINGS, type LlmPlatformSettings } from '../../../shared/types/llm.js';

/** Повні налаштування платформи: дефолти + тестовий OpenAI. */
function testSettings(overrides: Partial<LlmPlatformSettings> = {}): LlmPlatformSettings {
  return {
    ...DEFAULT_LLM_PLATFORM_SETTINGS,
    defaultProvider: 'openai',
    openaiApiKey: 'test-key',
    openaiDefaultModel: 'gpt-test',
    googleDefaultModel: 'gemini-test',
    openrouterDefaultModel: 'openai/gpt-6-luna-pro',
    maxOutputTokens: 512,
    modelPriceHighlight: { enabled: true, greenMaxUsdPerM: 5, yellowMaxUsdPerM: 10 },
    ...overrides,
  };
}

describe('LlmService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(llmSettingsService, 'getSettings').mockResolvedValue(testSettings());
  });

  it('complete delegates to openai provider', async () => {
    vi.spyOn(openaiProvider, 'openaiComplete').mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop',
    });
    const svc = new LlmService();
    const result = await svc.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.text).toBe('hello');
  });

  it('throws when api key missing', async () => {
    vi.spyOn(llmSettingsService, 'getSettings').mockResolvedValue(testSettings({ openaiApiKey: '' }));
    const svc = new LlmService();
    await expect(svc.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      /Missing API key/,
    );
  });
});
