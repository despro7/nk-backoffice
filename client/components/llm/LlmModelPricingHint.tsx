import React from 'react';
import type { LlmModelPriceHighlightSettings } from '@shared/types/llm';
import {
  llmModelPriceTierTextClass,
  parseLlmPricingHint,
  resolveLlmModelPriceTier,
} from '@shared/utils/llmModelPriceHighlight';

type Props = {
  hint: string | null | undefined;
  placeholder: string;
  highlight: LlmModelPriceHighlightSettings;
  className?: string;
};

export function LlmModelPricingHint({ hint, placeholder, highlight, className }: Props) {
  const baseClass = `text-tiny truncate ${className ?? ''}`.trim();

  if (!hint?.trim()) {
    return <span className={`${baseClass} text-default-400`}>{placeholder}</span>;
  }

  if (!highlight.enabled) {
    return <span className={`${baseClass} text-default-400`}>{hint}</span>;
  }

  const parsed = parseLlmPricingHint(hint);
  if (!parsed) {
    return <span className={`${baseClass} text-default-400`}>{hint}</span>;
  }

  const inTier = resolveLlmModelPriceTier(parsed.inputUsdPerM, highlight);
  const outTier = resolveLlmModelPriceTier(parsed.outputUsdPerM, highlight);
  const inMatch = hint.match(/^\$[\d.]+\/1M in/);
  const outMatch = hint.match(/\$[\d.]+\/1M out$/);
  const inText = inMatch?.[0] ?? `$${parsed.inputUsdPerM}/1M in`;
  const outText = outMatch?.[0] ?? `$${parsed.outputUsdPerM}/1M out`;

  return (
    <span className={baseClass}>
      <span className={llmModelPriceTierTextClass(inTier)}>{inText}</span>
      <span className="text-default-400"> · </span>
      <span className={llmModelPriceTierTextClass(outTier)}>{outText}</span>
    </span>
  );
}
