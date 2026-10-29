import type { LlmProvider } from '../types/llm.js';

export const LLM_PROVIDERS: readonly LlmProvider[] = ['openai', 'google', 'openrouter'];

export function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}
