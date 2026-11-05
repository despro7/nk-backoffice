import { useCallback } from 'react';
import type { CatalogDictionariesDto } from '@shared/types/catalog';
import { catalogApi } from '../../catalogApi';
import { CatalogAuditFeed } from '../audit/CatalogAuditFeed';
import { useCatalogAuditFeed } from '../audit/useCatalogAuditFeed';

interface Props {
  goodId: string;
  dictionaries: CatalogDictionariesDto;
  /** Змінюється після збереження картки — перезавантажує журнал. */
  refreshKey?: number | string;
}

/** Вкладка «Історія» картки товару: хто, що і коли змінював. */
export function ProductHistoryTab({ goodId, dictionaries, refreshKey }: Props) {
  const load = useCallback((cursor: number | null) => catalogApi.fetchGoodAudit(goodId, cursor), [goodId]);
  const feed = useCatalogAuditFeed(load, [load, refreshKey]);

  return (
    <div className="pb-6">
      <CatalogAuditFeed
        items={feed.items}
        loading={feed.loading}
        error={feed.error}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
        dictionaries={dictionaries}
      />
    </div>
  );
}
