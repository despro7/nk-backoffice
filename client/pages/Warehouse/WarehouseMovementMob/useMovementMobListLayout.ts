import { useHasTouchScreen, useTouchUi, useViewportMinWidth } from '@/hooks/useTouchUi';

/** Touch-планшети ширше цього порогу — desktop-верстка списку (фільтри в ряд, 2 колонки). */
export const MOVEMENT_MOB_DESKTOP_MIN_WIDTH_PX = 501;

/**
 * Чи показувати touch-chrome (ActionBubble, stacked filters) на списку переміщень.
 * Touch + ширина ≥ 501px → desktop; вузький touch або compact без touch — як раніше.
 */
export function useMovementMobListTouchChrome(): boolean {
  const touchUi = useTouchUi();
  const hasTouch = useHasTouchScreen();
  const isDesktopWidth = useViewportMinWidth(MOVEMENT_MOB_DESKTOP_MIN_WIDTH_PX);
  return touchUi && !(hasTouch && isDesktopWidth);
}
