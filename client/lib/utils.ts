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
 * @returns розрахована похибка в грамах з точністю до 2 знаків після коми
 */
export function calcTolerance(
  portions: number,
  maxTolerance: number = 30,
  minTolerance: number = 10,
  minPortions: number = 1,
  maxPortions: number = 12
): number {
  if (portions <= minPortions) return maxTolerance;
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
 * @param toleranceSettings - налаштування похибки (maxTolerance, minTolerance, minPortions, maxPortions)
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
  }
): number {
  const boxTolerance = calcBoxTolerance(boxWeight);
  const itemTolerance = calcTolerance(
    totalPortions,
    toleranceSettings.maxTolerance,
    toleranceSettings.minTolerance,
    toleranceSettings.minPortions,
    toleranceSettings.maxPortions
  ) * totalPortions;

  return boxTolerance + itemTolerance;
}
