import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Об'єднує класи Tailwind CSS в один рядок
 * @param inputs - масив класів
 * @returns рядок з об'єднаними класами
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Розраховує динамічну похибку ваги для заданої кількості порцій
 * @param portions - кількість порцій
 * @param maxTolerance - максимальна похибка (г)
 * @param minTolerance - мінімальна похибка (г)
 * @param minPortions - мінімальна кількість порцій для максимальної похибки
 * @param maxPortions - максимальна кількість порцій для мінімальної похибки
 * @param portionMultiplier - коефіцієнт множення для екстра-зменшення похибки
 * @param toleranceReductionPercent - відсоток від minTolerance для екстра-зменшення
 * @returns розрахована похибка в грамах з точністю до 2 знаків після коми
 */
export function calcTolerance(
  portions: number,
  maxTolerance: number = 30,
  minTolerance: number = 10,
  minPortions: number = 1,
  maxPortions: number = 12,
  portionMultiplier: number = 2,
  toleranceReductionPercent: number = 60
): number {
  if (portions <= minPortions) return maxTolerance;
  
  // Якщо кількість порцій >= portionMultiplier * maxPortions, похибка зменшується до toleranceReductionPercent% від minTolerance
  if (portions >= portionMultiplier * maxPortions) {
    return +(minTolerance * (toleranceReductionPercent / 100)).toFixed(2);
  }
  
  if (portions >= maxPortions) return minTolerance;

  const t = (portions - minPortions) / (maxPortions - minPortions);
  return +(maxTolerance - t * (maxTolerance - minTolerance)).toFixed(2);
}

/**
 * Розраховує похибку для коробки (10% від ваги коробки, мінімум 10г)
 * @param expectedWeight - очікувана вага коробки в кг
 * @returns розрахована похибка в грамах
 */
export function calcBoxTolerance(expectedWeight: number): number {
  return Math.max(expectedWeight * 0.1, 0.01) * 1000; // переводимо в грами
}

/**
 * Розраховує накопичену похибку для всіх елементів на платформі
 * @param boxWeight - вага коробки в кг
 * @param totalPortions - загальна кількість порцій всіх товарів на платформі
 * @param toleranceSettings - налаштування похибки
 * @returns загальна накопичена похибка в грамах
 */
export function calcCumulativeTolerance(
  boxWeight: number,
  totalPortions: number,
  toleranceSettings: {
    maxTolerance: number;
    minTolerance: number;
    minPortions: number;
    maxPortions: number;
    portionMultiplier?: number;
    toleranceReductionPercent?: number;
  }
): number {
  const boxTolerance = calcBoxTolerance(boxWeight);
  const itemTolerance = calcTolerance(
    totalPortions,
    toleranceSettings.maxTolerance,
    toleranceSettings.minTolerance,
    toleranceSettings.minPortions,
    toleranceSettings.maxPortions,
    toleranceSettings.portionMultiplier || 2,
    toleranceSettings.toleranceReductionPercent || 60
  ) * totalPortions;

  return boxTolerance + itemTolerance;
}

/**
 * Повертає CSS-класи для кольорової градації значення відносно масиву значень.
 * Використовується для візуального виділення комірок таблиць звітів.
 * @param value - поточне значення
 * @param values - масив усіх значень у стовпці
 * @param colored - якщо false, кольорове форматування вимкнено (за замовчуванням true)
 * @returns об'єкт з класами `base` (фон) та `content` (текст)
 */
export function getValueColor(
  value: number,
  values: number[],
  colored: boolean = true
): { base: string; content: string } {
  if (!colored || values.length === 0 || value === 0) {
    return {
      base: "bg-transparent",
      content: value === 0 ? "text-gray-400 font-medium" : "text-gray-700 font-medium",
    };
  }

  const min = Math.min(...values.filter((v) => v > 0));
  const max = Math.max(...values);

  if (min === max) {
    return {
      base: "bg-neutral-100/50",
      content: "text-gray-700 font-medium",
    };
  }

  const normalized = (value - min) / (max - min);

  if (normalized < 0.1) {
    return {
      base: "bg-danger/10",
      content: "text-danger-700/80 font-medium",
    };
  } else if (normalized < 0.5) {
    return {
      base: "bg-amber-400/20",
      content: "text-amber-800/70 font-medium",
    };
  } else if (normalized < 0.7) {
    return {
      base: "bg-lime-500/10",
      content: "text-lime-600/80 font-medium",
    };
  } else if (normalized > 2) {
    return {
      base: "bg-lime-600/90 shadow-lg shadow-lime-700/40",
      content: "text-white font-medium text-shadow-sm",
    };
  } else if (normalized > 1) {
    return {
      base: "bg-lime-500/30 shadow-lg shadow-lime-700/20 ring-1 ring-lime-600/50",
      content: "text-lime-700 font-medium",
    };
  } else {
    return {
      base: "bg-lime-500/20",
      content: "text-lime-600 font-medium",
    };
  }
}
