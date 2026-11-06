import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/utils.js', () => ({ prisma: {} }));
vi.mock('./orderDatabaseService.js', () => ({ orderDatabaseService: {} }));
vi.mock('./ordersCacheService.js', () => ({ ordersCacheService: {} }));

const { composeShipmentEvents } = await import('./shipmentEvents.js');

const order24453 = {
  id: 17501,
  externalId: '24453',
  status: '4',
  items: JSON.stringify([{ sku: '02028', quantity: 3 }]),
  payloadData: null,
  dilovodSaleExportDate: new Date('2026-11-05T13:42:29Z'),
};

describe('composeShipmentEvents', () => {
  it('кожен документ sale – окрема подія зі своєю датою; без циклу – поточний склад', () => {
    const events = composeShipmentEvents(
      [
        { orderId: 17501, dilovodId: 's1', number: '0007621', docDate: new Date('2026-10-02T05:35:32Z'), shipment: null },
        { orderId: 17501, dilovodId: 's2', number: '0009363', docDate: new Date('2026-11-05T13:42:29Z'), shipment: null },
      ],
      new Map([[17501, order24453]]),
      [],
    );
    expect(events.map((event) => [event.reportKey, new Date(event.dilovodSaleExportDate!).toISOString(), event.saleDocumentNumber])).toEqual([
      ['24453#s1', '2026-10-02T05:35:32.000Z', '0007621'],
      ['24453#s2', '2026-11-05T13:42:29.000Z', '0009363'],
    ]);
    expect(events[0].items).toBe(order24453.items);
    expect(events[0].cycleItems).toBeNull();
  });

  it('документ з циклом: склад і моноліти циклу (v2), номер циклу', () => {
    const [event] = composeShipmentEvents(
      [{
        orderId: 17501, dilovodId: 's3', number: '1', docDate: new Date('2026-11-10T10:00:00Z'),
        shipment: {
          cycle: 3,
          summary: {
            version: 2, mode: 'mixed',
            items: [{ sku: '07141', quantity: 1, itemMode: 'monolithic' }, { sku: '02028', quantity: 2, itemMode: 'regular' }],
            monolithic: { '07141': 1 },
            totals: { items: 2, monolithicItems: 1, boxes: 1 },
          },
        },
      }],
      new Map([[17501, order24453]]),
      [],
    );
    expect(event.shipmentCycle).toBe(3);
    expect(JSON.parse(event.items as string)).toEqual([
      { sku: '07141', quantity: 1, itemMode: 'monolithic' },
      { sku: '02028', quantity: 2, itemMode: 'regular' },
    ]);
    expect(event.payloadData).toMatchObject({ shipment: { bySku: { '07141': { quantity: 1 } } } });
    expect(event.cycleItems).toHaveLength(2);
  });

  it('замовлення без документів – як раніше, ключ = externalId', () => {
    const legacy = { ...order24453, id: 1, externalId: '100' };
    const [event] = composeShipmentEvents([], new Map(), [legacy]);
    expect(event).toMatchObject({ reportKey: '100', shipmentCycle: null, cycleItems: null, items: legacy.items });
  });

  it('документ замовлення, якого немає серед завантажених, пропускається', () => {
    expect(composeShipmentEvents(
      [{ orderId: 999, dilovodId: 'x', number: null, docDate: new Date(), shipment: null }],
      new Map(),
      [],
    )).toEqual([]);
  });
});
