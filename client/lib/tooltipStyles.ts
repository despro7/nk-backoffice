/**
 * Стилі HeroUI Tooltip зі стрілочкою (`showArrow`). Вітрина: /settings/design, секція «Tooltip».
 *
 * Використання:
 *   <Tooltip content="…" placement="top" showArrow delay={300} classNames={TOOLTIP_CLASS_NAMES.dark}>
 *
 * `base` фарбує стрілку (`before:`), `content` – саму підказку. Стрілка `z-[10]` з легкою тінню,
 * щоб не зливалась з рамкою.
 */

const ARROW = 'before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]';
const CONTENT = 'rounded-sm text-xs border-0';

export type TooltipVariant =
  | 'white'
  | 'dark'
  | 'primary'
  | 'secondary'
  | 'warning'
  | 'danger'
  | 'success'
  | 'yellow'
  | 'blue';

export const TOOLTIP_CLASS_NAMES: Record<TooltipVariant, { base: string; content: string }> = {
  white: { base: `before:bg-white ${ARROW}`, content: `${CONTENT} bg-white text-gray-700` },
  // gray-900: майже чорний, відрізняється від primary (#374151)
  dark: { base: `before:bg-gray-900 ${ARROW}`, content: `${CONTENT} bg-gray-900 text-white` },
  primary: { base: `before:bg-primary ${ARROW}`, content: `${CONTENT} bg-primary text-primary-foreground` },
  secondary: { base: `before:bg-secondary ${ARROW}`, content: `${CONTENT} bg-secondary text-secondary-foreground` },
  warning: { base: `before:bg-warning ${ARROW}`, content: `${CONTENT} bg-warning text-warning-foreground` },
  danger: { base: `before:bg-danger ${ARROW}`, content: `${CONTENT} bg-danger text-danger-foreground` },
  success: { base: `before:bg-success ${ARROW}`, content: `${CONTENT} bg-success text-success-foreground` },
  yellow: { base: `before:bg-yellow-400 ${ARROW}`, content: `${CONTENT} bg-yellow-400 text-yellow-950` },
  blue: { base: `before:bg-blue-500 ${ARROW}`, content: `${CONTENT} bg-blue-500 text-white` },
};

export const TOOLTIP_VARIANT_LABELS: Record<TooltipVariant, string> = {
  white: 'Білий',
  dark: 'Темний',
  primary: 'Primary',
  secondary: 'Secondary',
  warning: 'Warning',
  danger: 'Danger',
  success: 'Success',
  yellow: 'Яскраво-жовтий',
  blue: 'Синій',
};
