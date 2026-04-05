import type { InventoryProduct, InventoryStatus } from './WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// Обчислює загальну кількість порцій для продукту
// ---------------------------------------------------------------------------

export const totalPortions = (p: InventoryProduct): number | null => {
  if (p.unit !== 'portions') return p.actualCount;
  if (p.boxCount === null && p.actualCount === null) return null;
  return ((p.boxCount ?? 0) * p.portionsPerBox) + (p.actualCount ?? 0);
};

// ---------------------------------------------------------------------------
// Форматує довільну кількість порцій у вигляді "N кор. + M пор.".
// Використовується як для фактичного підрахунку, так і для системного залишку.
// ---------------------------------------------------------------------------

export const formatBalanceBreakdown = (total: number, portionsPerBox: number): string => {
  if (total === 0) return '0 пор.';
  const boxes = Math.floor(total / portionsPerBox);
  const rest = total % portionsPerBox;
  if (boxes === 0) return `${rest} пор.`;
  if (rest === 0) return `${boxes} кор.`;
  return `${boxes} кор. + ${rest} пор.`;
};

// ---------------------------------------------------------------------------
// Словники для відображення статусу
// ---------------------------------------------------------------------------

export const statusLabel: Record<InventoryStatus, string> = {
  draft: 'Чернетка',
  in_progress: 'В процесі',
  completed: 'Завершена',
};

export const statusColor: Record<InventoryStatus, 'default' | 'warning' | 'success'> = {
  draft: 'default',
  in_progress: 'warning',
  completed: 'success',
};

// ---------------------------------------------------------------------------
// Серіалізує поточний стан items для збереження в БД
// ---------------------------------------------------------------------------

export const serializeItems = (prods: InventoryProduct[], mats: InventoryProduct[]) =>
  [...prods, ...mats].map(({ id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked }) => ({
    id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked,
  }));
