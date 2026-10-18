export type InventoryRowKind = 'product' | 'material' | 'set';

/** Відступ зверху з урахуванням sticky-панелі інвентаризації */
const STICKY_TOP_OFFSET_PX = 140;

export const inventoryRowDomId = (kind: InventoryRowKind, id: string): string => `${kind}:${id}`;

export function scrollInventoryRowIntoViewIfNeeded(kind: InventoryRowKind, id: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-inventory-row="${inventoryRowDomId(kind, id)}"]`);
    if (!(el instanceof HTMLElement)) return;

    const rect = el.getBoundingClientRect();
    const needsScroll =
      rect.top < STICKY_TOP_OFFSET_PX ||
      rect.bottom > window.innerHeight - 24;

    if (needsScroll) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
