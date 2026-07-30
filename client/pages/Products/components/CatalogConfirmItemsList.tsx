import type { CatalogItemLabel } from '../ProductsUtils';

interface CatalogConfirmItemsListProps {
  items: CatalogItemLabel[];
  /** Скільки рядків показувати до «і ще N» */
  maxVisible?: number;
}

export function CatalogConfirmItemsList({
  items,
  maxVisible = 8,
}: CatalogConfirmItemsListProps) {
  if (items.length === 0) return null;

  const shown = items.slice(0, maxVisible);
  const rest = items.length - shown.length;

  return (
    <ul className="mt-2 max-h-44 list-none overflow-auto rounded-md border border-default-200 bg-default-50/60 py-1">
      {shown.map((item) => (
        <li
          key={item.id}
          className="flex items-baseline gap-2 px-3 py-1.5 text-sm"
        >
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {item.name}
          </span>
          {item.isGroup ? (
            <span className="shrink-0 text-xs text-default-400">папка</span>
          ) : item.sku ? (
            <span className="shrink-0 font-mono text-xs text-default-500">
              {item.sku}
            </span>
          ) : null}
        </li>
      ))}
      {rest > 0 && (
        <li className="px-3 py-1.5 text-xs text-default-500">
          …і ще {rest}
        </li>
      )}
    </ul>
  );
}
