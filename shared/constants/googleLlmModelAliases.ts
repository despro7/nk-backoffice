/**
 * Моделі, які Google вимкнув для нових користувачів / застарілі — підміняємо перед викликом API.
 * @see https://ai.google.dev/gemini-api/docs/deprecations
 */
export const GOOGLE_LLM_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite-preview-09-2025': 'gemini-3.5-flash-lite',
};

export function resolveGoogleLlmModelId(model: string): string {
  const id = model.replace(/^models\//, '').trim();
  if (!id) return id;
  return GOOGLE_LLM_MODEL_ALIASES[id] ?? id;
}
