/**
 * Універсальний мапінг кольорів для довідників / специфікацій
 * (accPolicies, типи, статуси тощо).
 *
 * На вхід — масив `{ id, name?, code? }`, на вихід — Record<id, tokens>
 * з Tailwind-класами: світле тло + темний текст (soft)
 * або темне тло + світлий текст (hard).
 *
 * Класи мають бути повними літералами (не `bg-${x}`), щоб Tailwind JIT їх підхопив.
 */

export type SpecColorTheme = 'light' | 'dark';
/** soft = світле тло + темний текст; hard = темне тло + світлий текст */
export type SpecColorIntensity = 'soft' | 'medium' | 'hard';

export interface SpecColorItem {
  id: string;
  name?: string;
  code?: string | null;
}

export interface SpecColorTokens {
  /** Tailwind class, напр. `text-emerald-800` */
  text: string;
  /** Tailwind class, напр. `bg-emerald-100` */
  bg: string;
  /** Tailwind class, напр. `border-emerald-300` */
  border: string;
  /** Назва hue-родини (для дебагу / легенди / override) */
  hue: string;
  theme: SpecColorTheme;
  intensity: SpecColorIntensity;
}

export interface BuildSpecColorMapOptions {
  theme?: SpecColorTheme;
  intensity?: SpecColorIntensity;
  /** Чи застосовувати колір рамки (default: true). Якщо false — border-transparent. */
  border?: boolean;
  /**
   * Закріплені hue за id (`accPolicyId` → `'emerald'` тощо).
   * Мають пріоритет над авто-призначенням за індексом.
   */
  pinnedHues?: Record<string, string>;
  /**
   * Додаткові синтетичні ключі (напр. `__group__`),
   * яким теж призначається колір з тієї ж палітри.
   */
  extras?: SpecColorItem[];
}

export interface SpecColorClassOptions {
  border?: boolean;
  theme?: SpecColorTheme;
  intensity?: SpecColorIntensity;
}

interface HueVariant {
  bg: string;
  text: string;
  border: string;
}

interface HuePair {
  name: string;
  light: { soft: HueVariant; medium: HueVariant; hard: HueVariant };
  dark: { soft: HueVariant; medium: HueVariant; hard: HueVariant };
}

/**
 * Фіксована палітра hue-родин. Індекс елемента в (відсортованому) списку
 * циклічно мапиться на ці кольори — однаковий порядок → однакові кольори.
 */
const HUE_PALETTE: HuePair[] = [
  {
    name: 'emerald',
    light: {
      soft: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
      medium: { bg: 'bg-emerald-200', text: 'text-emerald-800', border: 'border-emerald-700' },
      hard: { bg: 'bg-emerald-600', text: 'text-emerald-50', border: 'border-emerald-700' },
    },
    dark: {
      soft: { bg: 'bg-emerald-900', text: 'text-emerald-300', border: 'border-emerald-700' },
      medium: { bg: 'bg-emerald-600', text: 'text-emerald-50', border: 'border-emerald-700' },
      hard: { bg: 'bg-emerald-400', text: 'text-emerald-950', border: 'border-emerald-400' },
    },
  },
  {
    name: 'blue',
    light: {
      soft: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
      medium: { bg: 'bg-blue-200', text: 'text-blue-800', border: 'border-blue-700' },
      hard: { bg: 'bg-blue-600', text: 'text-blue-50', border: 'border-blue-700' },
    },
    dark: {
      soft: { bg: 'bg-blue-900', text: 'text-blue-300', border: 'border-blue-700' },
      medium: { bg: 'bg-blue-600', text: 'text-blue-50', border: 'border-blue-700' },
      hard: { bg: 'bg-blue-400', text: 'text-blue-950', border: 'border-blue-400' },
    },
  },
  {
    name: 'violet',
    light: {
      soft: { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-200' },
      medium: { bg: 'bg-violet-200', text: 'text-violet-800', border: 'border-violet-700' },
      hard: { bg: 'bg-violet-600', text: 'text-violet-50', border: 'border-violet-700' },
    },
    dark: {
      soft: { bg: 'bg-violet-900', text: 'text-violet-300', border: 'border-violet-700' },
      medium: { bg: 'bg-violet-600', text: 'text-violet-50', border: 'border-violet-700' },
      hard: { bg: 'bg-violet-400', text: 'text-violet-950', border: 'border-violet-400' },
    },
  },
  {
    name: 'amber',
    light: {
      soft: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
      medium: { bg: 'bg-amber-200', text: 'text-amber-800', border: 'border-amber-700' },
      hard: { bg: 'bg-amber-600', text: 'text-amber-50', border: 'border-amber-700' },
    },
    dark: {
      soft: { bg: 'bg-amber-900', text: 'text-amber-300', border: 'border-amber-700' },
      medium: { bg: 'bg-amber-600', text: 'text-amber-50', border: 'border-amber-700' },
      hard: { bg: 'bg-amber-400', text: 'text-amber-950', border: 'border-amber-400' },
    },
  },
  {
    name: 'rose',
    light: {
      soft: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
      medium: { bg: 'bg-rose-200', text: 'text-rose-800', border: 'border-rose-700' },
      hard: { bg: 'bg-rose-600', text: 'text-rose-50', border: 'border-rose-700' },
    },
    dark: {
      soft: { bg: 'bg-rose-900', text: 'text-rose-300', border: 'border-rose-700' },
      medium: { bg: 'bg-rose-600', text: 'text-rose-50', border: 'border-rose-700' },
      hard: { bg: 'bg-rose-400', text: 'text-rose-950', border: 'border-rose-400' },
    },
  },
  {
    name: 'cyan',
    light: {
      soft: { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
      medium: { bg: 'bg-cyan-200', text: 'text-cyan-800', border: 'border-cyan-700' },
      hard: { bg: 'bg-cyan-600', text: 'text-cyan-50', border: 'border-cyan-700' },
    },
    dark: {
      soft: { bg: 'bg-cyan-900', text: 'text-cyan-300', border: 'border-cyan-700' },
      medium: { bg: 'bg-cyan-600', text: 'text-cyan-50', border: 'border-cyan-700' },
      hard: { bg: 'bg-cyan-400', text: 'text-cyan-950', border: 'border-cyan-400' },
    },
  },
  {
    name: 'orange',
    light: {
      soft: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
      medium: { bg: 'bg-orange-200', text: 'text-orange-800', border: 'border-orange-700' },
      hard: { bg: 'bg-orange-600', text: 'text-orange-50', border: 'border-orange-700' },
    },
    dark: {
      soft: { bg: 'bg-orange-900', text: 'text-orange-300', border: 'border-orange-700' },
      medium: { bg: 'bg-orange-600', text: 'text-orange-50', border: 'border-orange-700' },
      hard: { bg: 'bg-orange-400', text: 'text-orange-950', border: 'border-orange-400' },
    },
  },
  {
    name: 'teal',
    light: {
      soft: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
      medium: { bg: 'bg-teal-200', text: 'text-teal-800', border: 'border-teal-700' },
      hard: { bg: 'bg-teal-600', text: 'text-teal-50', border: 'border-teal-700' },
    },
    dark: {
      soft: { bg: 'bg-teal-900', text: 'text-teal-300', border: 'border-teal-700' },
      medium: { bg: 'bg-teal-600', text: 'text-teal-50', border: 'border-teal-700' },
      hard: { bg: 'bg-teal-400', text: 'text-teal-950', border: 'border-teal-400' },
    },
  },
  {
    name: 'indigo',
    light: {
      soft: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
      medium: { bg: 'bg-indigo-200', text: 'text-indigo-800', border: 'border-indigo-700' },
      hard: { bg: 'bg-indigo-600', text: 'text-indigo-50', border: 'border-indigo-700' },
    },
    dark: {
      soft: { bg: 'bg-indigo-900', text: 'text-indigo-300', border: 'border-indigo-700' },
      medium: { bg: 'bg-indigo-600', text: 'text-indigo-50', border: 'border-indigo-700' },
      hard: { bg: 'bg-indigo-400', text: 'text-indigo-950', border: 'border-indigo-400' },
    },
  },
  {
    name: 'pink',
    light: {
      soft: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200' },
      medium: { bg: 'bg-pink-200', text: 'text-pink-800', border: 'border-pink-700' },
      hard: { bg: 'bg-pink-600', text: 'text-pink-50', border: 'border-pink-700' },
    },
    dark: {
      soft: { bg: 'bg-pink-900', text: 'text-pink-300', border: 'border-pink-700' },
      medium: { bg: 'bg-pink-600', text: 'text-pink-50', border: 'border-pink-700' },
      hard: { bg: 'bg-pink-400', text: 'text-pink-950', border: 'border-pink-400' },
    },
  },
  {
    name: 'lime',
    light: {
      soft: { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-200' },
      medium: { bg: 'bg-lime-200', text: 'text-lime-800', border: 'border-lime-700' },
      hard: { bg: 'bg-lime-600', text: 'text-lime-50', border: 'border-lime-700' },
    },
    dark: {
      soft: { bg: 'bg-lime-900', text: 'text-lime-300', border: 'border-lime-700' },
      medium: { bg: 'bg-lime-600', text: 'text-lime-50', border: 'border-lime-700' },
      hard: { bg: 'bg-lime-400', text: 'text-lime-950', border: 'border-lime-400' },
    },
  },
  {
    name: 'slate',
    light: {
      soft: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
      medium: { bg: 'bg-slate-200', text: 'text-slate-800', border: 'border-slate-700' },
      hard: { bg: 'bg-slate-600', text: 'text-slate-50', border: 'border-slate-700' },
    },
    dark: {
      soft: { bg: 'bg-slate-900', text: 'text-slate-300', border: 'border-slate-600' },
      medium: { bg: 'bg-slate-600', text: 'text-slate-50', border: 'border-slate-700' },
      hard: { bg: 'bg-slate-400', text: 'text-slate-950', border: 'border-slate-400' },
    },
  },
];

/** Нейтральний фолбек (група / невідомий id). */
export const SPEC_COLOR_FALLBACK: SpecColorTokens = {
  ...HUE_PALETTE[HUE_PALETTE.length - 1].light.soft,
  hue: 'slate',
  theme: 'light',
  intensity: 'soft',
};

/** Імена всіх hue-родин палітри (для селекта закріплення). */
export const SPEC_COLOR_HUE_NAMES: string[] = HUE_PALETTE.map((h) => h.name);

/** Токени для конкретної hue (preview / пікер). */
export function getSpecColorByHue(
  hueName: string,
  theme: SpecColorTheme = 'light',
  intensity: SpecColorIntensity = 'soft'
): SpecColorTokens {
  const hue = findHueByName(hueName);
  if (!hue) {
    return { ...SPEC_COLOR_FALLBACK, theme, intensity };
  }
  return pickTokens(hue, theme, intensity);
}

function compareSpecItems(a: SpecColorItem, b: SpecColorItem): number {
  const ac = a.code != null && String(a.code).trim() !== '' ? String(a.code) : null;
  const bc = b.code != null && String(b.code).trim() !== '' ? String(b.code) : null;
  if (ac != null && bc != null) {
    const an = Number(ac);
    const bn = Number(bc);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return ac.localeCompare(bc, 'uk');
  }
  if (ac != null) return -1;
  if (bc != null) return 1;
  return String(a.name || a.id).localeCompare(String(b.name || b.id), 'uk');
}

function pickTokens(
  hue: HuePair,
  theme: SpecColorTheme,
  intensity: SpecColorIntensity
): SpecColorTokens {
  const pair = hue[theme][intensity];
  return { ...pair, hue: hue.name, theme, intensity };
}

function findHueByName(name: string): HuePair | undefined {
  return HUE_PALETTE.find((h) => h.name === name);
}

/**
 * Перебудовує токени з тієї ж hue-родини під інший theme/intensity.
 * Якщо hue невідома — повертає вихідні tokens.
 */
export function resolveSpecColorTokens(
  tokens: SpecColorTokens,
  options: SpecColorClassOptions = {}
): SpecColorTokens {
  const theme = options.theme ?? tokens.theme;
  const intensity = options.intensity ?? tokens.intensity;
  const hue = findHueByName(tokens.hue);

  const next =
    hue != null ? pickTokens(hue, theme, intensity) : tokens;

  if (options.border === false) {
    return { ...next, border: 'border-transparent' };
  }
  return next;
}

/**
 * Будує мапінг id → кольорові токени для масиву специфікацій/довідників.
 * Порядок стабільний: спочатку за `code` (числово, якщо можливо), інакше за name/id.
 */
export function buildSpecColorMap(
  items: SpecColorItem[],
  options: BuildSpecColorMapOptions = {}
): Record<string, SpecColorTokens> {
  const theme = options.theme ?? 'light';
  const intensity = options.intensity ?? 'soft';
  const withBorder = options.border !== false;
  const pinnedHues = options.pinnedHues ?? {};
  const extras = options.extras ?? [];

  const seen = new Set<string>();
  const unique: SpecColorItem[] = [];
  for (const item of [...items, ...extras]) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  unique.sort(compareSpecItems);

  const map: Record<string, SpecColorTokens> = {};
  unique.forEach((item, index) => {
    const pinnedName = pinnedHues[item.id];
    const pinned = pinnedName ? findHueByName(pinnedName) : undefined;
    const hue = pinned ?? HUE_PALETTE[index % HUE_PALETTE.length];
    const tokens = pickTokens(hue, theme, intensity);
    map[item.id] = withBorder ? tokens : { ...tokens, border: 'border-transparent' };
  });

  return map;
}

/** Дістає токени за id; якщо немає — повертає fallback. */
export function getSpecColor(
  map: Record<string, SpecColorTokens>,
  id: string | null | undefined,
  fallback: SpecColorTokens = SPEC_COLOR_FALLBACK
): SpecColorTokens {
  if (!id) return fallback;
  return map[id] ?? fallback;
}

/**
 * Tailwind className-рядок для Chip / Badge / span тощо.
 *
 * `theme` / `intensity` — опційний override поверх токенів з мапи.
 * `border` — default true; при false рамка `border-transparent` і без `border` width.
 */
export function specColorToClassNames(
  tokens: SpecColorTokens,
  options: SpecColorClassOptions = {}
): string {
  const resolved = resolveSpecColorTokens(tokens, options);
  const withBorder = options.border !== false;

  const parts = [resolved.bg, resolved.text];
  if (withBorder) {
    parts.push('border', resolved.border);
  }
  return parts.join(' ');
}

/** Alias для зворотної сумісності зі старими імпортами / HMR. */
export const specColorToStyle = specColorToClassNames;
