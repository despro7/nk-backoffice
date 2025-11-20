export default {
  plugins: {
    // Конвертує OKLCH кольори в RGB з фолбеком для старіших браузерів
    "@csstools/postcss-oklab-function": {
      preserve: true, // Зберігає оригінальний OKLCH + додає RGB фолбек
    },
    "@tailwindcss/postcss": {},
  },
};