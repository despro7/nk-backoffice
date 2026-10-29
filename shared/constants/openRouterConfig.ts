/** Base URL OpenRouter Chat Completions (глобальний або EU: https://eu.openrouter.ai/api/v1). */
export function getOpenRouterBaseUrl(): string {
  const raw = process.env.LLM_OPENROUTER_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return 'https://openrouter.ai/api/v1';
}

export function getOpenRouterDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const referer = process.env.LLM_OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.LLM_OPENROUTER_APP_TITLE?.trim() || 'NK Food Backoffice';
  if (referer) headers['HTTP-Referer'] = referer;
  headers['X-Title'] = title;
  return headers;
}
