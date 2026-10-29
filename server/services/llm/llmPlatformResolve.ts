import type { LlmPlatformSettings, LlmProvider } from '../../../shared/types/llm.js';

export function resolveLlmApiKey(settings: LlmPlatformSettings, provider: LlmProvider): string {
  switch (provider) {
    case 'google':
      return settings.googleApiKey;
    case 'openrouter':
      return settings.openrouterApiKey;
    default:
      return settings.openaiApiKey;
  }
}

export function resolveLlmDefaultModel(settings: LlmPlatformSettings, provider: LlmProvider): string {
  switch (provider) {
    case 'google':
      return settings.googleDefaultModel;
    case 'openrouter':
      return settings.openrouterDefaultModel;
    default:
      return settings.openaiDefaultModel;
  }
}
