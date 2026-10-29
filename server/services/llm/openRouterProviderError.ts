/** OpenRouter: {"error":{"code":402,"message":"..."}} */
export function formatOpenRouterError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'LLM provider error';
  }
  const raw = error.message.trim();
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string; code?: number };
      };
      const msg = parsed.error?.message?.trim();
      if (msg) {
        const code = parsed.error?.code;
        return code != null ? `${msg} (code ${code})` : msg;
      }
    } catch {
      // ignore
    }
  }
  return raw || 'LLM provider error';
}
