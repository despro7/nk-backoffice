import type { Request } from 'express';
import type { AuditSource } from '../../../shared/constants/auditEntities.js';
import { catalogGoodAuditService, type CatalogAuditTrackOptions } from './CatalogGoodAuditService.js';

export function catalogAuditUserId(req: Request): number | null {
  const raw = req.user?.userId;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Обгортка HTTP-дії над товарами журналом змін.
 * Масова дія (>1 товару) позначається source = bulk, якщо явно не задано інше.
 */
export function trackCatalogAction<T>(
  req: Request,
  action: string,
  ids: string[],
  fn: () => Promise<T>,
  extra: Partial<Omit<CatalogAuditTrackOptions<T>, 'action' | 'ids' | 'userId'>> = {},
): Promise<T> {
  const source: AuditSource = extra.source ?? (ids.length > 1 ? 'bulk' : 'ui');
  return catalogGoodAuditService.track(
    { ...extra, action, ids, source, userId: catalogAuditUserId(req) },
    fn,
  );
}
