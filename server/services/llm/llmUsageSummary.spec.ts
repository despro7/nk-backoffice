import { describe, expect, it } from 'vitest';
import { jevCostUsd, kyivDayKey, summarizeLlmUsage, type LlmUsageRow } from './llmUsageSummary.js';

const now = new Date('2026-10-31T10:00:00Z');

function row(partial: Partial<LlmUsageRow>): LlmUsageRow {
  return {
    createdAt: new Date('2026-10-30T10:00:00Z'),
    provider: 'openai',
    model: 'gpt-4.1-mini',
    feature: 'chatwoot_bot_reply',
    inputTokens: 100,
    outputTokens: 20,
    costUsd: 0.01,
    ok: true,
    ...partial,
  };
}

describe('summarizeLlmUsage', () => {
  it('totals by provider, feature and model, most expensive first', () => {
    const summary = summarizeLlmUsage(
      [
        row({}),
        row({ costUsd: 0.02 }),
        row({ provider: 'typesafe', model: 'jev-latest', feature: 'topics_jev', costUsd: 0.5, outputTokens: 0 }),
        row({ costUsd: null }),
        row({ costUsd: null, ok: false, inputTokens: 0, outputTokens: 0 }),
      ],
      7,
      now,
    );
    expect(summary.total).toMatchObject({ calls: 5, errors: 1, inputTokens: 400, unpricedCalls: 1 });
    expect(summary.total.costUsd).toBeCloseTo(0.53);
    expect(summary.byProvider.map((p) => p.provider)).toEqual(['typesafe', 'openai']);
    expect(summary.byFeature[0]).toMatchObject({ feature: 'topics_jev', calls: 1 });
    expect(summary.byModel[1]).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini', calls: 4 });
  });

  it('skips rows outside the period and fills every day', () => {
    const summary = summarizeLlmUsage(
      [row({ createdAt: new Date('2026-10-20T10:00:00Z') }), row({ createdAt: new Date('2026-10-31T09:00:00Z') })],
      7,
      now,
    );
    expect(summary.total.calls).toBe(1);
    expect(summary.byDay).toHaveLength(8);
    expect(summary.byDay.at(-1)).toMatchObject({ day: '2026-10-31', calls: 1 });
    expect(summary.byDay.filter((d) => d.calls === 0)).toHaveLength(7);
  });

  it('groups days by Kyiv time', () => {
    expect(kyivDayKey(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-31');
  });
});

describe('jevCostUsd', () => {
  it('prices input tokens only when the price is set', () => {
    expect(jevCostUsd(2_000_000, 0.05)).toBeCloseTo(0.1);
    expect(jevCostUsd(1000, 0)).toBeNull();
  });
});
