import { Button, Spinner } from '@heroui/react';
import type { CatalogGoodAuditLogDto } from '@shared/types/catalogAudit';
import type { CatalogAuditDictionaries } from '@shared/utils/catalogGoodAuditFormat';
import { CatalogAuditEntry } from './CatalogAuditEntry';

interface Props {
  items: CatalogGoodAuditLogDto[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  dictionaries?: CatalogAuditDictionaries;
  showGood?: boolean;
  onGoodClick?: (goodId: string) => void;
  emptyText?: string;
}

/** Список записів журналу каталогу + «Показати ще». */
export function CatalogAuditFeed({
  items,
  loading,
  error,
  hasMore,
  onLoadMore,
  dictionaries,
  showGood,
  onGoodClick,
  emptyText = 'Змін ще немає...',
}: Props) {
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }
  if (items.length === 0) return <p className="text-sm text-default-500/75">{emptyText}</p>;

  return (
    <div>
      <div className="divide-y divide-default-100 [&>*]:py-4 [&>*:first-child]:pt-1">
        {items.map((item) => (
          <CatalogAuditEntry
            key={item.id}
            item={item}
            dictionaries={dictionaries}
            showGood={showGood}
            onGoodClick={onGoodClick}
          />
        ))}
      </div>
      {hasMore ? (
        <div className="flex justify-center pt-4">
          <Button size="sm" variant="flat" isDisabled={loading} onPress={onLoadMore}>
            {loading ? 'Завантаження…' : 'Показати ще'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
