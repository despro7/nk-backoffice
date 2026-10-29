import { describe, expect, it } from 'vitest';
import {
  formatOpenAiPricingHint,
  parseOpenAiPricingMarkdown,
  resolveOpenAiPricingRow,
} from './LlmOpenAiOfficialPricingService.js';

const LEGACY_WIDE = `
| Model | Short context input | Short context cached input | Short context cache writes | Short context output |
| --- | --- | --- | --- | --- |
| gpt-4.1-mini | $0.40 | $0.10 | - | $1.60 |
| Embedding | text-embedding-3-small | $0.02 | - | - |
`;

const CURRENT_COMPACT = `
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5.4-nano | $0.20 | $1.25 | $0.02 |
`;

const CURRENT_FLAGSHIP = `
| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6-luna | $0.10 | $0.50 | $0.01 | $0.125 | $0.25 | $0.20 | $0.75 | $0.02 | $0.25 | $0.50 |
`;

const WITH_BATCH_SECTION = `
### Standard pricing data
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6-astra | $10.00 | $50.00 | $1.00 |
### Batch pricing data
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-6-astra | $5.00 | $25.00 | $0.50 |
`;

describe('parseOpenAiPricingMarkdown', () => {
  it('parses legacy wide table (output after cache writes)', () => {
    const map = parseOpenAiPricingMarkdown(LEGACY_WIDE);
    expect(map.get('gpt-4.1-mini')).toEqual({ inputUsdPerM: 0.4, outputUsdPerM: 1.6 });
    expect(map.get('text-embedding-3-small')).toEqual({ inputUsdPerM: 0.02, outputUsdPerM: null });
    expect(formatOpenAiPricingHint(map.get('gpt-4.1-mini')!)).toContain('0.4');
  });

  it('parses current compact Input | Output table', () => {
    const map = parseOpenAiPricingMarkdown(CURRENT_COMPACT);
    expect(map.get('gpt-5.4-nano')).toEqual({ inputUsdPerM: 0.2, outputUsdPerM: 1.25 });
    expect(formatOpenAiPricingHint(map.get('gpt-5.4-nano')!)).toBe('$0.2/1M in · $1.25/1M out');
  });

  it('parses current flagship table (output in column 2)', () => {
    const map = parseOpenAiPricingMarkdown(CURRENT_FLAGSHIP);
    expect(map.get('gpt-6-luna')).toEqual({ inputUsdPerM: 0.1, outputUsdPerM: 0.5 });
  });

  it('ignores batch pricing tables', () => {
    const map = parseOpenAiPricingMarkdown(WITH_BATCH_SECTION);
    expect(map.get('gpt-6-astra')).toEqual({ inputUsdPerM: 10, outputUsdPerM: 50 });
  });

  it('does not match gpt-5 prefix to gpt-5.1-terra', () => {
    const map = parseOpenAiPricingMarkdown(`
| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5 | $1.25 | $10.00 | $0.125 |
| gpt-5.1 | $2.00 | $12.00 | $0.20 |
`);
    expect(resolveOpenAiPricingRow(map, 'gpt-5.1-terra')).toEqual({
      inputUsdPerM: 2,
      outputUsdPerM: 12,
    });
  });
});
