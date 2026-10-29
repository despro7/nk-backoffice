/** Макс. ітерацій tool loop у LlmService (для попереджень у тест-логах). */
export const LLM_TEST_MAX_TOOL_LOOP_ITERATIONS = 8;

export function buildLlmTestWarnings(opts: {
  finishReason: string;
  emptyReply?: boolean;
  apiCallCount?: number;
  usedFallback?: boolean;
}): string[] {
  const warnings: string[] = [];
  if (opts.finishReason === 'length') {
    warnings.push('відповідь обрізана (ліміт max_output_tokens)');
  }
  if (opts.finishReason === 'tool_calls') {
    warnings.push('останній раунд — tool_calls (зазвичай проміжний крок агента)');
  }
  if (opts.finishReason === 'error') {
    warnings.push('помилка або вичерпано ліміт ітерацій tool loop');
  }
  if (opts.emptyReply) {
    warnings.push('порожня відповідь моделі');
  }
  if (opts.usedFallback) {
    warnings.push('показано fallback замість тексту LLM');
  }
  if (
    opts.apiCallCount != null &&
    opts.apiCallCount >= LLM_TEST_MAX_TOOL_LOOP_ITERATIONS
  ) {
    warnings.push('досягнуто максимум ітерацій tool loop');
  }
  return warnings;
}
