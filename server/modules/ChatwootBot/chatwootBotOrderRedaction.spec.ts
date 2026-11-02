import { describe, expect, it } from 'vitest';
import { toVerifiedOrderDto } from './chatwootBotOrderRedaction.js';

describe('toVerifiedOrderDto', () => {
  it('omits PII fields and maps items', () => {
    const dto = toVerifiedOrderDto({
      orderNumber: '10001',
      status: '3',
      statusText: 'Відправлено',
      ttn: '59000000000000',
      items: [{ name: 'Борщ', quantity: 2, sku: 'SKU1', price: 100 }],
    });
    expect(dto).toEqual({
      orderNumber: '10001',
      status: '3',
      statusText: 'Відправлено',
      ttn: '59000000000000',
      items: [{ name: 'Борщ', quantity: 2, sku: 'SKU1', price: 100 }],
    });
    expect(dto).not.toHaveProperty('customerPhone');
  });

  it('reads productName from stored order items', () => {
    const dto = toVerifiedOrderDto({
      orderNumber: '26103',
      status: '4',
      statusText: 'Відправлено',
      ttn: '',
      items: JSON.stringify([{ productName: 'Біла квасоля з куркою', quantity: 2, price: 227, sku: '02032' }]),
    });
    expect(dto.items).toEqual([{ name: 'Біла квасоля з куркою', quantity: 2, sku: '02032', price: 227 }]);
  });
});
