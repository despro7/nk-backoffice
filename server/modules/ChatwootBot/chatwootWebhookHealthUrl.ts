/** URL healthcheck для Outgoing URL з налаштувань (повний webhook або origin). */
export function chatwootWebhookHealthUrlFromOutgoingHint(outgoingUrlHint: string): string | null {
  const raw = outgoingUrlHint.trim();
  if (!raw) return null;

  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    let path = u.pathname.replace(/\/+$/, '');
    if (path.endsWith('/health')) {
      return u.toString();
    }
    if (path.endsWith('/chatwoot')) {
      u.pathname = `${path}/health`;
      return u.toString();
    }
    if (path.includes('/api/webhooks/chatwoot')) {
      u.pathname = '/api/webhooks/chatwoot/health';
      return u.toString();
    }
    u.pathname = '/api/webhooks/chatwoot/health';
    return u.toString();
  } catch {
    return null;
  }
}
