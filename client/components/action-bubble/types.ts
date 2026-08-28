import type { ReactNode } from 'react';
import type { IconName } from 'lucide-react/dynamic';

export type ActionBubbleColorPreset = 'sky' | 'purple' | 'orange' | 'red' | 'lime';

export type ActionBubblePlacement =
  | 'bottom-end'
  | 'bottom-start'
  | 'top-end'
  | 'top-start';

export interface ActionBubbleOffset {
  x?: number;
  y?: number;
}

export interface ActionBubbleDockProps {
  children: ReactNode;
  placement?: ActionBubblePlacement;
  offset?: ActionBubbleOffset;
  className?: string;
  /** Якщо не задано — `useTouchUi()`. */
  visible?: boolean;
}

export interface ActionConfirmBubbleProps {
  id?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Другий тап після розкриття. */
  onConfirm?: () => void;
  confirmLabel: string;
  icon?: IconName;
  iconSize?: number;
  /** Розмір тексту підтвердження, px. */
  labelSize?: number;
  /** Сховати іконку, коли кнопка розкрита. */
  hideIconWhenOpen?: boolean;
  ariaLabel: string;
  colorPreset?: ActionBubbleColorPreset;
  className?: string;
  buttonClassName?: string;
  placement?: ActionBubblePlacement;
  offset?: ActionBubbleOffset;
}

export interface ActionBubbleProps {
  children: ReactNode;
  id?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  icon: IconName;
  openIcon?: IconName;
  iconSize?: number;
  ariaLabel: string;
  title?: string;
  header?: ReactNode;
  hideHeader?: boolean;
  colorPreset?: ActionBubbleColorPreset;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  panelBodyClassName?: string;
  panelWidth?: string;
  ignoreCloseSelector?: string;
  badge?: boolean;
  placement?: ActionBubblePlacement;
  offset?: ActionBubbleOffset;
}
