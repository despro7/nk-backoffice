import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHATWOOT_BOT_SITE_PAGES_CACHE_TTL_MS } from '../../../shared/constants/chatwootBotSitePages.js';

vi.mock('../Storefront/StorefrontService.js', () => ({
  storefrontService: {
    getSettings: vi.fn(),
    getWooCredentialsInternal: vi.fn(),
  },
}));

import { storefrontService } from '../Storefront/StorefrontService.js';
import { chatwootBotStorefrontSiteToolService } from './ChatwootBotStorefrontSiteToolService.js';

describe('ChatwootBotStorefrontSiteToolService', () => {
  beforeEach(() => {
    chatwootBotStorefrontSiteToolService.clearCache();
    vi.mocked(storefrontService.getSettings).mockResolvedValue({
      wooCommerce: { enabled: true, siteUrl: 'https://shop.test' },
    } as never);
    vi.mocked(storefrontService.getWooCredentialsInternal).mockResolvedValue({
      siteUrl: 'https://shop.test',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    chatwootBotStorefrontSiteToolService.clearCache();
  });

  it('loads pages from WP REST and filters by query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            slug: 'dostavka',
            title: { rendered: 'Доставка' },
            excerpt: { rendered: '<p>Нова пошта</p>' },
            content: { rendered: '<p>Доставка по Україні</p>' },
          },
          {
            slug: 'about',
            title: { rendered: 'Про нас' },
            excerpt: { rendered: '' },
            content: { rendered: '<p>Компанія</p>' },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await chatwootBotStorefrontSiteToolService.listSitePages({
      query: 'достав',
      limit: 5,
    });

    expect(result.source).toBe('wp_rest');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.slug).toBe('dostavka');
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('reuses cache within TTL', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T12:00:00Z') });
    const pageJson = JSON.stringify([
      {
        slug: 'home',
        title: { rendered: 'Home' },
        excerpt: { rendered: '' },
        content: { rendered: '<p>Hi</p>' },
      },
    ]);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(pageJson, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await chatwootBotStorefrontSiteToolService.listSitePages({});
    await chatwootBotStorefrontSiteToolService.listSitePages({});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHATWOOT_BOT_SITE_PAGES_CACHE_TTL_MS + 1);
    await chatwootBotStorefrontSiteToolService.listSitePages({});
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockRestore();
    vi.useRealTimers();
  });
});
