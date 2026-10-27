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
});
