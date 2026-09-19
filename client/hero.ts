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

export default heroui({
  themes: {
    light: {
      colors: {
        primary: primaryScale,
      },
    },
    dark: {
      colors: {
        primary: primaryScale,
      },
    },
  },
});
