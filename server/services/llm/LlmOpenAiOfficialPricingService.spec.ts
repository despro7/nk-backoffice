import { describe, expect, it } from 'vitest';
import {
  formatOpenAiPricingHint,
  parseOpenAiPricingMarkdown,
} from './LlmOpenAiOfficialPricingService.js';

const SAMPLE = `
| Model | Short context input | Short context cached input | Short context cache writes | Short context output |
| --- | --- | --- | --- | --- |
| gpt-4.1-mini | $0.40 | $0.10 | - | $1.60 |
| Embedding | text-embedding-3-small | $0.02 | - | - |
`;

describe('parseOpenAiPricingMarkdown', () => {
  it('parses chat and embedding rows', () => {
    const map = parseOpenAiPricingMarkdown(SAMPLE);
    expect(map.get('gpt-4.1-mini')).toEqual({ inputUsdPerM: 0.4, outputUsdPerM: 1.6 });
    expect(map.get('text-embedding-3-small')).toEqual({ inputUsdPerM: 0.02, outputUsdPerM: null });
    expect(formatOpenAiPricingHint(map.get('gpt-4.1-mini')!)).toContain('0.4');
  });
});
