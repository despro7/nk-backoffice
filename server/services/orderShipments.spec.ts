import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/utils.js', () => ({ prisma: {} }));

const {
  buildShipmentSummaryV1,
  planReturnLinks,
  planSaleLinks,
  shipmentSummaryToLegacyPayload,
} = await import('./orderShipments.js');

const d = (iso: string) => new Date(iso);

describe('buildShipmentSummaryV1', () => {
  it('знімок позицій + моноліти з payloadData (рядки JSON теж)', () => {
    const summary = buildShipmentSummaryV1(
      JSON.stringify([
        { sku: '07141', quantity: 1, productName: 'Набір', price: 900 },
        { sku: '02028', quantity: '4' },
        { sku: '', quantity: 1 },
        { sku: '03001', quantity: 0 },
      ]),
      JSON.stringify({ shipment: { bySku: { '07141': { accGood: '1119000000001079', quantity: 1 } } } }),
    );
    expect(summary).toEqual({
      version: 1,
      items: [
        { sku: '07141', quantity: 1, productName: 'Набір', price: 900 },
        { sku: '02028', quantity: 4 },
      ],
      monolithicBySku: { '07141': 1 },
    });
  });

  it('без payloadData: моноліти порожні', () => {
    expect(buildShipmentSummaryV1([{ sku: '1', quantity: 2 }], null).monolithicBySku).toEqual({});
  });
});

describe('shipmentSummaryToLegacyPayload', () => {
  it('повертає shipment.bySku або null', () => {
    expect(shipmentSummaryToLegacyPayload({ version: 1, items: [], monolithicBySku: { A: 2 } }, 'ACC')).toEqual({
      shipment: { bySku: { A: { accGood: 'ACC', quantity: 2 } } },
    });
    expect(shipmentSummaryToLegacyPayload({ version: 1, items: [], monolithicBySku: {} }, 'ACC')).toBeNull();
  });
});

describe('planSaleLinks', () => {
  const sale1 = { id: 11, dilovodId: 's1', docDate: d('2026-10-02T05:35:32Z') };
  const sale2 = { id: 12, dilovodId: 's2', docDate: d('2026-11-05T13:42:29Z') };

  it('відкритий цикл отримує відвантаження після комплектації, старе відвантаження не чіпає', () => {
    const plan = planSaleLinks(
      [{ id: 1, cycle: 1, pickedAt: d('2026-11-05T13:42:29.500Z'), saleDocumentId: null, returnDocumentId: null }],
      [sale1, sale2],
      new Set(),
    );
    expect(plan.links).toEqual([{ cycleId: 1, saleDocumentId: 12 }]);
    expect(plan.creates).toEqual([]);
  });

  it('допуск 12 год: документ трохи раніше за комплектацію', () => {
    const plan = planSaleLinks(
      [{ id: 1, cycle: 1, pickedAt: d('2026-10-02T06:35:32Z'), saleDocumentId: null, returnDocumentId: null }],
      [sale1],
      new Set(),
    );
    expect(plan.links).toEqual([{ cycleId: 1, saleDocumentId: 11 }]);
  });

  it('новий цикл лише для щойно експортованого відвантаження без відкритого циклу', () => {
    const plan = planSaleLinks(
      [{ id: 1, cycle: 1, pickedAt: d('2026-10-02T06:35:32Z'), saleDocumentId: 11, returnDocumentId: null }],
      [sale1, sale2, { id: 13, dilovodId: 's3', docDate: d('2026-11-06T10:00:00Z') }],
      new Set(['s2']),
    );
    expect(plan.links).toEqual([]);
    expect(plan.creates.map((sale) => sale.id)).toEqual([12]);
  });
});

describe('planReturnLinks', () => {
  it('повернення йде до циклу з найпізнішим відвантаженням до нього', () => {
    const cycles = [
      { id: 1, cycle: 1, pickedAt: d('2026-10-02T06:00:00Z'), saleDocumentId: 11, returnDocumentId: null, saleDate: d('2026-10-02T05:35:32Z') },
      { id: 2, cycle: 2, pickedAt: d('2026-11-05T13:42:00Z'), saleDocumentId: 12, returnDocumentId: null, saleDate: d('2026-11-05T13:42:29Z') },
    ];
    expect(planReturnLinks(cycles, [{ id: 21, dilovodId: 'r1', docDate: d('2026-10-13T07:52:17Z') }])).toEqual([
      { cycleId: 1, returnDocumentId: 21 },
    ]);
  });

  it('два повернення – два різні цикли; вже привʼязане не повторюється', () => {
    const cycles = [
      { id: 1, cycle: 1, pickedAt: d('2026-10-01T00:00:00Z'), saleDocumentId: 11, returnDocumentId: 21, saleDate: d('2026-10-02T00:00:00Z') },
      { id: 2, cycle: 2, pickedAt: d('2026-11-01T00:00:00Z'), saleDocumentId: 12, returnDocumentId: null, saleDate: d('2026-11-02T00:00:00Z') },
    ];
    expect(planReturnLinks(cycles, [
      { id: 21, dilovodId: 'r1', docDate: d('2026-10-13T00:00:00Z') },
      { id: 22, dilovodId: 'r2', docDate: d('2026-11-20T00:00:00Z') },
    ])).toEqual([{ cycleId: 2, returnDocumentId: 22 }]);
  });

  it('повернення без відвантаженого циклу не привʼязується', () => {
    expect(planReturnLinks(
      [{ id: 1, cycle: 1, pickedAt: d('2026-11-01T00:00:00Z'), saleDocumentId: null, returnDocumentId: null, saleDate: null }],
      [{ id: 21, dilovodId: 'r1', docDate: d('2026-11-20T00:00:00Z') }],
    )).toEqual([]);
  });
});
