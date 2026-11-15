import type { SortingStrategy } from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';

/**
 * Стратегія сортування для flex-wrap списків з елементами різної ширини/висоти.
 *
 * `rectSortingStrategy` пересуває елемент у прямокутник сусіда, тому при різних розмірах
 * чіпи наїжджають один на одного. Тут перераховується повний flow-layout (перенос рядків,
 * gap) для нового порядку за виміряними розмірами, а transform кожного елемента =
 * різниця між його новою та початковою позицією. Анімацію зміщення дає `transition` useSortable.
 */
export function createWrapSortingStrategy(opts: {
  getContainerWidth: () => number | null;
  gapX: number;
  gapY: number;
}): SortingStrategy {
  return ({ activeIndex, overIndex, index, rects }) => {
    if (activeIndex < 0 || overIndex < 0 || !rects[index]) return null;
    if (activeIndex === overIndex) return null;

    const originLeft = Math.min(...rects.map((r) => r.left));
    const originTop = Math.min(...rects.map((r) => r.top));
    const measuredWidth = Math.max(...rects.map((r) => r.left + r.width)) - originLeft;
    const maxWidth = Math.max(opts.getContainerWidth() ?? 0, measuredWidth);

    const order = arrayMove(
      rects.map((_, i) => i),
      activeIndex,
      overIndex,
    );

    const positions = new Map<number, { x: number; y: number }>();
    let x = originLeft;
    let y = originTop;
    let rowHeight = 0;
    for (const i of order) {
      const { width, height } = rects[i];
      if (x > originLeft && x - originLeft + width > maxWidth + 0.5) {
        x = originLeft;
        y += rowHeight + opts.gapY;
        rowHeight = 0;
      }
      positions.set(i, { x, y });
      x += width + opts.gapX;
      rowHeight = Math.max(rowHeight, height);
    }

    const target = positions.get(index);
    if (!target) return null;
    const dx = target.x - rects[index].left;
    const dy = target.y - rects[index].top;
    return { x: dx, y: dy, scaleX: 1, scaleY: 1 };
  };
}
