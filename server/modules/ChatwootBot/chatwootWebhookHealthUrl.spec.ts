import { describe, expect, it } from 'vitest';
import { chatwootWebhookHealthUrlFromOutgoingHint } from './chatwootWebhookHealthUrl.js';

describe('chatwootWebhookHealthUrlFromOutgoingHint', () => {
  it('appends /health to full webhook URL', () => {
    expect(
      chatwootWebhookHealthUrlFromOutgoingHint(
        'https://backoffice.nk-food.shop/api/webhooks/chatwoot',
      ),
    ).toBe('https://backoffice.nk-food.shop/api/webhooks/chatwoot/health');
  });
});
