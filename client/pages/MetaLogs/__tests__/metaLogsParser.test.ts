import { describe, it, expect } from 'vitest';
import type { MetaLogRow } from '@shared/types/metaLog';
import { parseShipmentMessage, dedupeAndNormalize } from '@/lib/metaLogsParser';

const sampleRaw = `[Авто] Помилка відвантаження замовлення SD9547: Недостатня кількість: - Фрикадельки у томатному соусі, 200г | арт: 03018 | потрібно: 2.000 шт | залишок: 1 шт | бракує: 1 шт - Котлети курячі, 360г | арт: 03021 | потрібно: 1.000 шт | залишок: 0 шт | бракує: 1.000 шт`;

const row: MetaLogRow = {
  id: 1 as any,
  createdAt: new Date().toISOString(),
  rawMessage: sampleRaw,
  dilovodResponse: null,
  productName: undefined,
  sku: undefined,
  needed: undefined as any,
  stock: undefined as any,
  missing: undefined as any,
  orderNumber: 'SD9547',
  initiator: null,
  attempts: 1,
  attemptsList: [] as any,
  occurrenceCount: 1,
  sourceIds: [1]
} as any;

describe('metaLogsParser', () => {
  it('parses shipment message into items', () => {
    const parsed = parseShipmentMessage(row);
    expect(parsed.names.length).toBeGreaterThanOrEqual(2);
    expect(parsed.skus).toContain('03018');
    expect(parsed.skus).toContain('03021');
    expect(parsed.needed[0]).toContain('2');
  });

  it('dedupes and normalizes items', () => {
    const parsed = parseShipmentMessage(row);
    const dedup = dedupeAndNormalize(parsed);
    expect(dedup.skus).toEqual(['03018', '03021']);
    expect(dedup.needed).toEqual(['2', '1']);
    expect(dedup.missing).toEqual(['1', '1']);
  });
});
