/**
 * Gemini 2.5 недоступні новим користувачам — у каталозі приховані, перед API → 3.5.
 * @see https://ai.google.dev/gemini-api/docs/deprecations
 */
export const GOOGLE_LLM_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite-preview-09-2025': 'gemini-3.5-flash-lite',
};

const GEMINI_25_ID_RE = /^gemini-2\.5/i;

export function isGoogleGemini25ModelId(modelId: string): boolean {
  const id = modelId.replace(/^models\//, '').trim();
  return GEMINI_25_ID_RE.test(id);
}

export function resolveGoogleLlmModelId(model: string): string {
  const id = model.replace(/^models\//, '').trim();
  if (!id) return id;
  if (GOOGLE_LLM_MODEL_ALIASES[id]) return GOOGLE_LLM_MODEL_ALIASES[id];
  if (GEMINI_25_ID_RE.test(id)) {
    return id.replace(GEMINI_25_ID_RE, 'gemini-3.5');
  }
  return id;
}

/** Не показувати в autocomplete (усі gemini-2.5*). */
export function isGoogleLlmModelSupersededInCatalog(modelId: string): boolean {
  return isGoogleGemini25ModelId(modelId);
}
