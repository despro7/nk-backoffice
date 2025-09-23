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