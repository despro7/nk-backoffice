import { parseDate, type DateValue } from '@internationalized/date';
import {
  DEFAULT_LLM_PLATFORM_SETTINGS,
  type LlmModelPriceHighlightSettings,
  type LlmProvider,
} from '@shared/types/llm';
import type { FormState } from './chatwootBotFormState';

export type LlmPlatformSnapshot = {
  defaultProvider: LlmProvider;
  modelPriceHighlight: LlmModelPriceHighlightSettings;
  hasOpenaiApiKey: boolean;
  hasGoogleApiKey: boolean;
  hasOpenrouterApiKey: boolean;
  hasTypesafeApiKey: boolean;
  openaiDefaultModel: string;
  googleDefaultModel: string;
  openrouterDefaultModel: string;
};

export function verifyTestDateToDateValue(value: string): DateValue | null {
  if (!value.trim()) return null;
  try {
    return parseDate(value.trim());
  } catch {
    return null;
  }
}

export function dateValueToVerifyTestDate(value: DateValue | null): string {
  if (!value) return '';
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function llmProviderHasApiKey(snapshot: LlmPlatformSnapshot, provider: LlmProvider): boolean {
  if (provider === 'openai') return snapshot.hasOpenaiApiKey;
  if (provider === 'google') return snapshot.hasGoogleApiKey;
  return snapshot.hasOpenrouterApiKey;
}

export function defaultLlmPlatformSnapshot(): LlmPlatformSnapshot {
  return {
    defaultProvider: DEFAULT_LLM_PLATFORM_SETTINGS.defaultProvider,
    modelPriceHighlight: DEFAULT_LLM_PLATFORM_SETTINGS.modelPriceHighlight,
    hasOpenaiApiKey: false,
    hasGoogleApiKey: false,
    hasOpenrouterApiKey: false,
    hasTypesafeApiKey: false,
    openaiDefaultModel: DEFAULT_LLM_PLATFORM_SETTINGS.openaiDefaultModel,
    googleDefaultModel: DEFAULT_LLM_PLATFORM_SETTINGS.googleDefaultModel,
    openrouterDefaultModel: DEFAULT_LLM_PLATFORM_SETTINGS.openrouterDefaultModel,
  };
}

export function llmDefaultModelForProvider(snapshot: LlmPlatformSnapshot, provider: LlmProvider): string {
  if (provider === 'google') return snapshot.googleDefaultModel;
  if (provider === 'openrouter') return snapshot.openrouterDefaultModel;
  return snapshot.openaiDefaultModel;
}

export function defaultChatwootAiModelForProvider(
  snapshot: LlmPlatformSnapshot,
  aiProvider: FormState['aiProvider'],
): string {
  const provider = aiProvider || snapshot.defaultProvider;
  return llmDefaultModelForProvider(snapshot, provider);
}
