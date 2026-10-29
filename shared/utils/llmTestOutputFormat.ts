import type { LlmTestModelResponse } from '../types/llm.js';
import { formatLlmUsdCost } from './llmUsageCostEstimate.js';
import { formatLlmToolTraceSection } from './llmToolTraceFormat.js';

export type LlmTestOutputMeta = Omit<LlmTestModelResponse, 'reply'> & {
  usedFallback?: boolean;
};

function formatToolsInvoked(tools: Record<string, number>): string {
  return Object.entries(tools)
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
    .join(', ');
}

function formatTemperature(value: number | null | undefined): string {
  if (value == null) return 'default (провайдер)';
  return String(value);
}

/** Текстовий блок для UI тестів LLM / Chatwoot AI. */
export function formatLlmTestOutput(meta: LlmTestOutputMeta, reply: string): string {
  const lines = [
    `provider: ${meta.provider}`,
    `model: ${meta.model}`,
  ];

  if (meta.requestedModel && meta.requestedModel !== meta.model) {
    lines.push(`requested model: ${meta.requestedModel}`);
  }

  if (meta.providerSource) {
    lines.push(`provider source: ${meta.providerSource}`);
  }

  if (meta.maskId || meta.maskName) {
    const maskLabel = [meta.maskName, meta.maskId ? `(${meta.maskId})` : ''].filter(Boolean).join(' ');
    lines.push(`mask: ${maskLabel.trim()}`);
  }

  if (meta.systemPromptChars != null) {
    lines.push(`system prompt: ${meta.systemPromptChars} chars`);
  }

  lines.push(
    `finish: ${meta.finishReason}`,
    `latency: ${meta.latencyMs} ms`,
  );

  if (meta.maxOutputTokens != null) {
    lines.push(`max_output_tokens: ${meta.maxOutputTokens}`);
  }

  lines.push(`temperature: ${formatTemperature(meta.temperature)}`);

  if (meta.usage) {
    let tokenLine = `tokens: ${meta.usage.promptTokens} in / ${meta.usage.completionTokens} out (${meta.usage.totalTokens} total)`;
    if (meta.usage.estimatedCostUsd != null && Number.isFinite(meta.usage.estimatedCostUsd)) {
      const approximate = meta.provider !== 'openrouter';
      tokenLine += ` · ${formatLlmUsdCost(meta.usage.estimatedCostUsd, approximate)}`;
    }
    lines.push(tokenLine);
  }

  if (meta.apiCallCount != null && meta.apiCallCount > 0) {
    lines.push(`api calls: ${meta.apiCallCount}`);
  }

  if (meta.providerRequestIds && meta.providerRequestIds.length > 1) {
    lines.push(`request ids: ${meta.providerRequestIds.join(', ')}`);
  } else if (meta.providerRequestId) {
    lines.push(`request id: ${meta.providerRequestId}`);
  }

  if (meta.toolsInvoked && Object.keys(meta.toolsInvoked).length > 0) {
    lines.push(`tools: ${formatToolsInvoked(meta.toolsInvoked)}`);
  }

  const warnings = [...(meta.warnings ?? [])];
  if (meta.usedFallback && !warnings.some((w) => w.includes('fallback'))) {
    warnings.push('показано fallback (LLM порожньо або вимкнено)');
  }

  if (warnings.length > 0) {
    lines.push(`warnings: ${warnings.join('; ')}`);
  }

  const toolTraceBlock = meta.toolTrace ? formatLlmToolTraceSection(meta.toolTrace) : '';
  if (toolTraceBlock) {
    lines.push('', toolTraceBlock);
  }

  lines.push('', '--- відповідь ---', reply);
  return lines.join('\n');
}
