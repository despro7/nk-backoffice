import { describe, expect, it } from 'vitest';
import {
  buildCorrectionDocTrailFromLayers,
  getCorrectionLayerStepPrefix,
  isCorrectionHistoryComplete,
  pickPrimaryCorrectionUnkit,
  sortCorrectionLayersForDisplay,
} from './releaseCorrectionLayers';

function layer(
  partial: Record<string, unknown>,
): Record<string, unknown> {
  return {
    operationType: 'unkit',
    status: 'sent',
    createdAt: '2026-10-15T10:00:00.000Z',
    internalDocNumber: 'K-000500',
    ...partial,
  };
}

describe('releaseCorrectionLayers', () => {
  it('512/513/514: trail kit+successful unkit, complete, failed attempt labeled', () => {
    const layers = [
      layer({ operationType: 'kit', internalDocNumber: 'K-000512', createdAt: '2026-10-15T09:19:00.000Z' }),
      layer({
        operationType: 'unkit',
        internalDocNumber: 'K-000513',
        status: 'send_failed',
        createdAt: '2026-10-15T09:25:00.000Z',
      }),
      layer({
        operationType: 'unkit',
        internalDocNumber: 'K-000514',
        status: 'sent',
        createdAt: '2026-10-15T10:20:00.000Z',
      }),
    ];
    const sorted = sortCorrectionLayersForDisplay(layers);
    expect(sorted.map((l) => l.internalDocNumber)).toEqual(['K-000512', 'K-000513', 'K-000514']);
    expect(pickPrimaryCorrectionUnkit(layers)?.internalDocNumber).toBe('K-000514');
    expect(buildCorrectionDocTrailFromLayers(layers)).toBe('№512/514');
    expect(isCorrectionHistoryComplete(layers)).toBe(true);
    expect(getCorrectionLayerStepPrefix(layers[1] as typeof layers[0], sorted)).toMatch(/Помилкова спроба/);
    expect(getCorrectionLayerStepPrefix(layers[2] as typeof layers[0], sorted)).toMatch(/Крок 2/);
  });

  it('only kit → incomplete', () => {
    const layers = [layer({ operationType: 'kit', internalDocNumber: 'K-000512' })];
    expect(isCorrectionHistoryComplete(layers)).toBe(false);
  });

  it('kit + failed unkit only → incomplete', () => {
    const layers = [
      layer({ operationType: 'kit', internalDocNumber: 'K-000512' }),
      layer({ operationType: 'unkit', status: 'send_failed', internalDocNumber: 'K-000513' }),
    ];
    expect(isCorrectionHistoryComplete(layers)).toBe(false);
  });
});
