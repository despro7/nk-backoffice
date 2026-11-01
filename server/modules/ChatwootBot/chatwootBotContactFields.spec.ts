import { describe, expect, it } from 'vitest';
import { extractContactEmail, extractPageContext } from './chatwootBotContactFields.js';

describe('extractContactEmail', () => {
  it('finds and lowercases an email', () => {
    expect(extractContactEmail('мій email Ivan.P@Gmail.com.')).toBe('ivan.p@gmail.com');
    expect(extractContactEmail('без пошти')).toBeNull();
  });
});

describe('extractPageContext', () => {
  it('prefers site custom attributes over referer', () => {
    const ctx = extractPageContext({
      conversation: {
        custom_attributes: { page_url: 'https://nk-food.shop/product/plov/', product_sku: '03001' },
        additional_attributes: { referer: 'https://nk-food.shop/' },
      },
    });
    expect(ctx).toEqual({ url: 'https://nk-food.shop/product/plov/', productSku: '03001' });
  });

  it('uses widget referer and ignores non-http values', () => {
    expect(extractPageContext({ conversation: { additional_attributes: { referer: 'https://nk-food.shop/' } } })?.url).toBe(
      'https://nk-food.shop/',
    );
    expect(extractPageContext({ conversation: { additional_attributes: { referer: 'javascript:1' } } })).toBeNull();
  });
});
