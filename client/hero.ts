import { heroui } from '@heroui/theme';

/** Primary = neutral grey (#374151), не default HeroUI blue. Синхронно з @theme у global.css. */
const primaryScale = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e5e7eb',
  300: '#d1d5db',
  400: '#9ca3af',
  500: '#6b7280',
  600: '#4b5563',
  700: '#374151',
  800: '#1f2937',
  900: '#111827',
  DEFAULT: '#374151',
  foreground: '#ffffff',
};

const successScale = {
  100: '#e9f2e0',
  200: '#bfef90',
  400: '#cbdeb7',
  500: '#5bb434',
  600: '#409b18',
  700: '#5e8f2d',
  DEFAULT: '#5bb434',
  foreground: '#ffffff',
};

const warningScale = {
  400: '#ffc700',
  500: '#cc9800',
  600: '#a37600',
  700: '#7a5700',
  800: '#543c00',
  DEFAULT: '#cc9800',
  foreground: '#ffffff',
};

export default heroui({
  themes: {
    light: {
      colors: {
        primary: primaryScale,
        success: successScale,
        warning: warningScale,
      },
    },
    dark: {
      colors: {
        primary: primaryScale,
        success: successScale,
        warning: warningScale,
      },
    },
  },
});
