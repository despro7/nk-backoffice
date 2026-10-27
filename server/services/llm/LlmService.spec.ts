import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LlmService } from './LlmService.js';
import { llmSettingsService } from './LlmSettingsService.js';
import * as openaiProvider from './providers/openaiLlmProvider.js';

describe('LlmService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(llmSettingsService, 'getSettings').mockResolvedValue({
      defaultProvider: 'openai',
      openaiApiKey: 'test-key',
      googleApiKey: '',
      openaiDefaultModel: 'gpt-test',
      googleDefaultModel: 'gemini-test',
      maxOutputTokens: 512,
    });
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
    vi.spyOn(llmSettingsService, 'getSettings').mockResolvedValue({
      defaultProvider: 'openai',
      openaiApiKey: '',
      googleApiKey: '',
      openaiDefaultModel: 'gpt-test',
      googleDefaultModel: 'gemini-test',
      maxOutputTokens: 512,
    });
    const svc = new LlmService();
    await expect(svc.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      /Missing API key/,
    );
  });
});
