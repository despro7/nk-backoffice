import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditLogPageDto } from '@shared/types/audit';
import type { CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';

type Loader = (cursor: number | null) => Promise<AuditLogPageDto<CatalogGoodAuditLogDto>>;

/** Стрічка журналу з пагінацією курсором; перезавантажується при зміні `deps`. */
export function useCatalogAuditFeed(load: Loader | null, deps: unknown[]) {
  const [items, setItems] = useState<CatalogGoodAuditLogDto[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (cursor: number | null, append: boolean) => {
      if (!load) return;
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const page = await load(cursor);
        if (id !== requestId.current) return;
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Не вдалося завантажити журнал');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) void fetchPage(nextCursor, true);
  }, [fetchPage, nextCursor, loading]);

  const reload = useCallback(() => void fetchPage(null, false), [fetchPage]);

  return { items, loading, error, hasMore: nextCursor != null, loadMore, reload };
}
