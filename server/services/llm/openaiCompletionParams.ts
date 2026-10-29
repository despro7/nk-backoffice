/** Нові моделі OpenAI (GPT-5, o-series, ChatGPT-branded) вимагають max_completion_tokens замість max_tokens. */
export function openAiUsesMaxCompletionTokens(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (id.startsWith('gpt-5') || id.startsWith('gpt-6')) return true;
  if (id.includes('/gpt-5') || id.includes('/gpt-6')) return true;
  if (/^o\d/.test(id)) return true;
  if (id.startsWith('chatgpt-')) return true;
  return false;
}

export function buildOpenAiMaxOutputTokens(
  modelId: string,
  maxOutputTokens?: number,
): { max_tokens?: number; max_completion_tokens?: number } {
  if (maxOutputTokens == null) return {};
  if (openAiUsesMaxCompletionTokens(modelId)) {
    return { max_completion_tokens: maxOutputTokens };
  }
  return { max_tokens: maxOutputTokens };
}

/** GPT-5 / o-series: лише default temperature (1) — параметр не передаємо. */
export function openAiUsesFixedDefaultTemperature(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return false;
  if (id.startsWith('gpt-5') || id.startsWith('gpt-6')) return true;
  if (id.includes('/gpt-5') || id.includes('/gpt-6')) return true;
  if (/^o\d/.test(id)) return true;
  if (id.startsWith('chatgpt-')) return true;
  return false;
}

export function buildOpenAiTemperature(
  modelId: string,
  temperature?: number,
): { temperature?: number } {
  if (openAiUsesFixedDefaultTemperature(modelId)) {
    return {};
  }
  return { temperature: temperature ?? 0.4 };
}

function openAiModelBaseId(modelId: string): string {
  const id = modelId.trim().toLowerCase();
  const slash = id.lastIndexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

/** GPT-5/6 + tools на /v1/chat/completions вимагають reasoning_effort: none. */
export function openAiUsesReasoningEffortNoneWithTools(modelId: string): boolean {
  const base = openAiModelBaseId(modelId);
  return base.startsWith('gpt-5') || base.startsWith('gpt-6');
}

export function buildOpenAiReasoningEffortForTools(
  modelId: string,
  hasTools: boolean,
): { reasoning_effort?: 'none' } {
  if (!hasTools || !openAiUsesReasoningEffortNoneWithTools(modelId)) {
    return {};
  }
  return { reasoning_effort: 'none' };
}
