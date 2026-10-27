/** Витягує зрозуміле повідомлення з ApiError Google GenAI (часто JSON у message). */
export function formatGoogleGenAiError(error: unknown): string {
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
      if (msg) return msg;
    } catch {
      // ignore
    }
  }
  return raw || 'LLM provider error';
}
