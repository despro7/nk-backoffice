import { afterEach, describe, expect, it, vi } from 'vitest';
import { WooCommerceApiClient } from './WooCommerceApiClient.js';

const creds = {
  siteUrl: 'https://shop.example.com',
  consumerKey: 'ck_test',
  consumerSecret: 'cs_test',
};

describe('WooCommerceApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds auth URL and returns product by sku', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 42, sku: 'SKU-1', name: 'Test' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WooCommerceApiClient(creds);
    const product = await client.getProductBySku('SKU-1');

    expect(product?.id).toBe(42);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/wp-json/wc/v3/products');
    expect(calledUrl).toContain('consumer_key=ck_test');
    expect(calledUrl).toContain('sku=SKU-1');
  });

  it('returns null for 404 product by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WooCommerceApiClient(creds);
    const product = await client.getProductById(999);
    expect(product).toBeNull();
  });

  it('testConnection returns ok on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 1 }],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = new WooCommerceApiClient(creds);
    const result = await client.testConnection();
    expect(result.ok).toBe(true);
  });
});
