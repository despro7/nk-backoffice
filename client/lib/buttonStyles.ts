/**
 * Еталонні className для кнопок backoffice.
 * Див. /settings/design — секція «Кнопки» (id для copy: design:btn-*).
 */

/** Primary-blue solid — toolbar, коли синій акцент доречніший за theme primary. */
export const BTN_PRIMARY_BLUE = 'bg-blue-500 text-white font-medium';

/** Primary-blue flat — другорядні сині дії (явний className, не global override). */
export const BTN_PRIMARY_BLUE_FLAT = 'bg-blue-100 text-blue-700 font-medium';

/** Яскравий success — додатковий варіант поверх HeroUI color=success. */
export const BTN_VIVID_SUCCESS = 'bg-lime-500 text-white font-medium hover:bg-lime-600';

/** Яскравий warning — додатковий варіант поверх HeroUI color=warning. */
export const BTN_VIVID_WARNING = 'bg-amber-500 text-white font-medium hover:bg-amber-600';

/** Glow-тіні для акcent-кнопок — див. shadow-button-* у global.css @theme. */
export const BTN_GLOW_PRIMARY = 'shadow-button-primary';
export const BTN_GLOW_SUCCESS = 'shadow-button-success';
export const BTN_GLOW_DANGER = 'shadow-button-danger';

/** @deprecated Alias — використовуй BTN_PRIMARY_BLUE */
export const HR_BTN_PRIMARY = BTN_PRIMARY_BLUE;

/** @deprecated Alias — використовуй BTN_VIVID_SUCCESS */
export const HR_BTN_SUCCESS = BTN_VIVID_SUCCESS;

/** @deprecated Alias — використовуй BTN_VIVID_WARNING */
export const HR_BTN_WARNING = BTN_VIVID_WARNING;
