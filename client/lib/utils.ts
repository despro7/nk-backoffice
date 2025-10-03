import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Объединяет классы Tailwind CSS в одну строку
 * @param inputs - массив классов
 * @returns строка с объединенными классами
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Рассчитывает динамическую похибку ваги для заданного количества порций
 * @param portions - количество порций
 * @param maxTolerance - максимальная похибка (г)
 * @param minTolerance - минимальная похибка (г)
 * @param minPortions - минимальное количество порций для максимальной похибки
 * @param maxPortions - максимальное количество порций для минимальной похибки
 * @returns рассчитанная похибка в граммах с точностью до 2 знаков после запятой
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
 * Рассчитывает похибку для коробки (10% от веса коробки, минимум 10г)
 * @param expectedWeight - ожидаемый вес коробки в кг
 * @returns рассчитанная похибка в граммах
 */
export function calcBoxTolerance(expectedWeight: number): number {
  return Math.max(expectedWeight * 0.1, 0.01) * 1000; // переводим в граммы
}

/**
 * Рассчитывает накопленную похибку для всех элементов на платформе
 * @param boxWeight - вес коробки в кг
 * @param totalPortions - общее количество порций всех товаров на платформе
 * @param toleranceSettings - настройки похибки (maxTolerance, minTolerance, minPortions, maxPortions)
 * @returns общая накопиченная похибка в граммах
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
