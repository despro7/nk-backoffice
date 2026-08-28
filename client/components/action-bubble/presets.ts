import type { ActionBubbleColorPreset, ActionBubblePlacement } from './types';

export const ACTION_BUBBLE_COLOR_PRESETS: Record<ActionBubbleColorPreset, string> = {
  sky: 'bg-gradient-to-b from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-600/30',
  purple: 'bg-gradient-to-b from-purple-400 to-purple-600 text-white shadow-lg shadow-danger',
  orange: 'bg-gradient-to-b from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-600/30',
  red: 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-lg shadow-red-600/30',
  lime: 'bg-gradient-to-b from-lime-400 to-lime-600 text-white shadow-lg shadow-lime-600/40',
};

export const DEFAULT_PANEL_WIDTH = 'min(20rem, calc(100vw - 1.5rem))';

export const DEFAULT_IGNORE_CLOSE_SELECTOR = [
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[data-slot="popover"]',
  '[data-slot="calendar"]',
].join(', ');

export const DOCK_PLACEMENT_CLASS: Record<ActionBubblePlacement, string> = {
  'bottom-end':
    'right-4 items-end bottom-22 lg:bottom-6',
  'bottom-start':
    'left-4 items-start bottom-22 lg:bottom-6',
  'top-end': 'right-4 top-[calc(4.5rem+env(safe-area-inset-top))] items-end',
  'top-start': 'left-4 top-[calc(4.5rem+env(safe-area-inset-top))] items-start',
};
