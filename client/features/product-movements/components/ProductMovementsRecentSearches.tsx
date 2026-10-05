import { useEffect, useState } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ProductMovementsMetaResponse } from '../types';
import type { ProductMovementsRecentSearch } from '../productMovementsRecentSearches';
import {
  formatRecentSearchHint,
  loadProductMovementsRecentSearches,
  removeProductMovementsRecentSearch,
  subscribeProductMovementsRecentSearches,
} from '../productMovementsRecentSearches';

interface ProductMovementsRecentSearchesProps {
  meta?: ProductMovementsMetaResponse | null;
  onSelect: (item: ProductMovementsRecentSearch) => void;
}

export default function ProductMovementsRecentSearches({
  meta,
  onSelect,
}: ProductMovementsRecentSearchesProps) {
  const [items, setItems] = useState(() => loadProductMovementsRecentSearches(meta));

  useEffect(() => {
    return subscribeProductMovementsRecentSearches(() => {
      setItems(loadProductMovementsRecentSearches(meta));
    });
  }, [meta]);

  useEffect(() => {
    setItems(loadProductMovementsRecentSearches(meta));
  }, [meta]);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-default-500">Останні запити</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="group/chip relative inline-flex max-w-full"
          >
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-default-200 bg-default-50 py-1.5 pl-2.5 pr-2 text-left text-xs transition-colors hover:border-primary-200 hover:bg-primary-50/60"
              title={item.hint}
            >
              <DynamicIcon name="history" size={13} className="shrink-0 text-default-400" />
              <span className="truncate font-medium text-foreground">{item.label}</span>
              <span className="hidden sm:inline truncate text-default-400">
                {formatRecentSearchHint(item.hint)}
              </span>
            </button>
            <button
              type="button"
              aria-label="Видалити збережений запит"
              onClick={(event) => {
                event.stopPropagation();
                removeProductMovementsRecentSearch(item.id);
              }}
              className="pointer-events-none absolute inset-y-[1px] right-[1px] z-10 flex w-12 items-center justify-end pr-2 rounded-r-lg bg-gradient-to-l from-primary-100 from-35% via-primary-100/85 to-transparent opacity-0 transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100"
            >
              <DynamicIcon name="x" size={12} strokeWidth={3} className="text-default-500 hover:text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
