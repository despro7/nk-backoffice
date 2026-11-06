import { describe, expect, it } from 'vitest';
import {
  buildShipmentRecord,
  collectMonolithicSkus,
  monolithicSkusToLegacyPayload,
  parseShipmentRecordV2,
  readMonolithicSkus,
} from './shipmentRecord.js';
import { SHIPMENT_MONOLITHIC_ACC_GOOD } from './dilovodShipmentCycle.js';

/** Стара логіка `OrderView.shipmentPayloadData` (еталон для еквівалентності). */
function legacyShipmentPayloadData(expandedItems: Array<{ type?: string; sku?: string; quantity?: number; dynamicMonolithic?: boolean }>) {
  const bySku: Record<string, { accGood: string; quantity: number }> = {};
  for (const item of expandedItems) {
    if (item.type !== 'product' || !item.sku || !item.dynamicMonolithic) continue;
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;
    const existing = bySku[item.sku] ?? { accGood: SHIPMENT_MONOLITHIC_ACC_GOOD, quantity: 0 };
    bySku[item.sku] = { accGood: SHIPMENT_MONOLITHIC_ACC_GOOD, quantity: existing.quantity + quantity };
  }
  return Object.keys(bySku).length > 0 ? { shipment: { bySku } } : null;
}

const expandedItems = [
  { type: 'product', sku: '07141', quantity: 1, dynamicMonolithic: true },
  { type: 'product', sku: '07141', quantity: 1, dynamicMonolithic: true },
  { type: 'product', sku: '03009', quantity: 4 },
  { type: 'product', sku: '02028', quantity: 4 },
  { type: 'box', sku: undefined, quantity: 1 },
];

const baseInput = {
  orderItems: [
    { sku: '07141', quantity: 2, productName: 'Набір', price: 1800 },
    { sku: '07091', quantity: 1, productName: 'Набір 2' },
    { sku: '02028', quantity: '4' },
  ],
  expandedItems,
  checklistItems: [
    { type: 'box', name: 'NK', boxIndex: 0, boxSettings: { name: 'NK', qntTo: 24 } },
    { type: 'box', name: 'NK2', boxIndex: 1, boxSettings: { name: 'NK2', qntTo: '12' } },
    { type: 'product', sku: '07141', name: 'Набір', quantity: 1, boxIndex: 0, portionsPerItem: 20, dynamicMonolithic: true },
    { type: 'product', sku: '07141', name: 'Набір', quantity: 1, boxIndex: 1, portionsPerItem: 8, dynamicMonolithic: true, monolithicSplitIndex: 0, monolithicSplitTotal: 2 },
    { type: 'product', sku: '02028', name: 'Суп', quantity: 4, boxIndex: 1 },
    { type: 'product', sku: '05000', name: 'Без коробки', quantity: 1 },
  ],
  forcedRegularSkus: ['07091'],
  unallocatedItems: [{ name: 'Котлети', quantity: 2 }, { name: 'Нуль', quantity: 0 }],
};

describe('collectMonolithicSkus', () => {
  it('еквівалентно старому payloadData (облік не змінюється)', () => {
    expect(monolithicSkusToLegacyPayload(collectMonolithicSkus(expandedItems))).toEqual(legacyShipmentPayloadData(expandedItems));
    expect(monolithicSkusToLegacyPayload(collectMonolithicSkus([{ type: 'product', sku: '1', quantity: 2 }]))).toBeNull();
  });
});

describe('buildShipmentRecord', () => {
  const { summary, manifest } = buildShipmentRecord(baseInput);

  it('summary: режими позицій, моноліти, підсумки', () => {
    expect(summary).toEqual({
      version: 2,
      mode: 'mixed',
      items: [
        { sku: '07141', quantity: 2, itemMode: 'monolithic', productName: 'Набір', price: 1800 },
        { sku: '07091', quantity: 1, itemMode: 'forced_regular', productName: 'Набір 2' },
        { sku: '02028', quantity: 4, itemMode: 'regular' },
      ],
      monolithic: { '07141': 2 },
      totals: { items: 3, monolithicItems: 1, boxes: 2 },
    });
  });

  it('manifest: коробки, split, позиції поза коробками, рішення', () => {
    expect(manifest.boxes).toEqual([
      {
        boxNum: 1, boxName: 'NK', hardCap: 24, usedPortions: 20,
        lines: [{ sku: '07141', name: 'Набір', quantity: 1, lineType: 'monolithic_set', portionsPerItem: 20 }],
      },
      {
        boxNum: 2, boxName: 'NK2', hardCap: 12, usedPortions: 12,
        lines: [
          { sku: '07141', name: 'Набір', quantity: 1, lineType: 'monolithic_set', portionsPerItem: 8, split: { index: 0, total: 2 } },
          { sku: '02028', name: 'Суп', quantity: 4, lineType: 'product' },
        ],
      },
    ]);
    expect(manifest.looseLines).toEqual([{ sku: '05000', name: 'Без коробки', quantity: 1, lineType: 'product' }]);
    expect(manifest.unallocated).toEqual([{ name: 'Котлети', quantity: 2 }]);
    expect(manifest.decisions).toEqual([{ sku: '07091', decision: 'forced_regular', reason: 'operator_override' }]);
  });

  it('одна коробка: усі товари в ній; набір монолітної категорії – set_unit', () => {
    const record = buildShipmentRecord({
      ...baseInput,
      expandedItems: [],
      forcedRegularSkus: [],
      checklistItems: [
        { type: 'box', name: 'NK', boxIndex: 0, boxSettings: { name: 'NK' } },
        { type: 'product', sku: '07144', name: 'Мікс', quantity: 1, portionsPerItem: 10 },
      ],
    });
    expect(record.summary.mode).toBe('regular');
    expect(record.manifest.boxes[0]).toMatchObject({ hardCap: null, usedPortions: 10, lines: [{ lineType: 'set_unit' }] });
    expect(record.manifest.looseLines).toEqual([]);
  });
});

describe('parseShipmentRecordV2', () => {
  it('приймає власний результат і відкидає сміття', () => {
    const record = buildShipmentRecord(baseInput);
    expect(parseShipmentRecordV2(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(parseShipmentRecordV2(null)).toBeNull();
    expect(parseShipmentRecordV2({ summary: { ...record.summary, version: 3 }, manifest: record.manifest })).toBeNull();
    expect(parseShipmentRecordV2({ summary: { ...record.summary, items: [{ sku: 'x', quantity: 1, itemMode: 'weird' }] }, manifest: record.manifest })).toBeNull();
  });
});

describe('readMonolithicSkus', () => {
  it('v2, v1 і старий payloadData дають однаковий результат', () => {
    const expected = { '07141': 2 };
    expect(readMonolithicSkus({ version: 2, monolithic: expected })).toEqual(expected);
    expect(readMonolithicSkus({ version: 1, items: [], monolithicBySku: expected })).toEqual(expected);
    expect(readMonolithicSkus({ shipment: { bySku: { '07141': { accGood: 'x', quantity: 2 } } } })).toEqual(expected);
    expect(readMonolithicSkus(null)).toBeNull();
  });
});
