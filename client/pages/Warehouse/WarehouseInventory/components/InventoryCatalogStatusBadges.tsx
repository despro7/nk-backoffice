import { Chip, Tooltip } from '@heroui/react';

export type InventoryCatalogStatusItem = {
  /** Товар у папці «Архів – …» (поле isOutdated у інвентаризації). */
  isOutdated?: boolean;
  doNotPublish?: boolean;
};

export function inventoryCatalogItemIsArchived(item: InventoryCatalogStatusItem): boolean {
  return Boolean(item.isOutdated);
}

export function inventoryCatalogItemIsOff(item: InventoryCatalogStatusItem): boolean {
  return Boolean(item.doNotPublish);
}

export function inventoryCatalogItemNeedsStockToShow(item: InventoryCatalogStatusItem): boolean {
  return inventoryCatalogItemIsArchived(item) || inventoryCatalogItemIsOff(item);
}

interface Props {
  item: InventoryCatalogStatusItem;
  className?: string;
}

/** OFF (магазин) та «Архів» для рядків інвентаризації. */
export function InventoryCatalogStatusBadges({ item, className = '' }: Props) {
  const showOff = inventoryCatalogItemIsOff(item);
  const showArchive = inventoryCatalogItemIsArchived(item);
  if (!showOff && !showArchive) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {showOff && (
        <Tooltip
          content="Товар відключений в магазині"
          placement="top"
          offset={5}
          delay={200}
          showArrow
          classNames={{
            base: 'before:bg-danger before:rounded-[3px] before:z-10 before:shadow-none',
            content: 'bg-danger border-0 text-white text-xs text-shadow-sm shadow-inner-md shadow-lg',
          }}
        >
          <span
            className="inline-flex shrink-0"
            aria-label="Товар відключений в магазині"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Chip
              size="sm"
              variant="flat"
              color="danger"
              classNames={{
                base: 'bg-danger-500 text-white text-shadow-sm shadow-inner-sm px-1.5 py-0.5 h-5 min-h-5',
                content: 'font-semibold text-[10px] px-0',
              }}
            >
              OFF
            </Chip>
          </span>
        </Tooltip>
      )}
      {showArchive && (
        <Tooltip
          content="Архівний товар"
          placement="top"
          offset={5}
          delay={200}
          showArrow
          classNames={{
            base: 'before:bg-yellow-500 before:rounded-[3px] before:z-10 before:shadow-none',
            content: 'bg-yellow-500 text-white text-xs text-shadow-sm shadow-inner-md shadow-lg',
          }}
        >
          <span
            className="inline-flex shrink-0"
            aria-label="Архівний товар"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Chip
              size="sm"
              variant="flat"
              classNames={{
                base: 'bg-yellow-500 text-white text-shadow-sm shadow-inner-sm uppercase px-1.5 py-0.5 h-5 min-h-5',
                content: 'font-semibold text-[10px] px-0',
              }}
            >
              Архів
            </Chip>
          </span>
        </Tooltip>
      )}
    </span>
  );
}
