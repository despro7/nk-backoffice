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
// Сортує товари за обраним критерієм та напрямком
// ---------------------------------------------------------------------------

export const sortItems = (
  items: InventoryProduct[],
  sortBy: 'name' | 'sku' | 'balance' | 'deviation',
  direction: 'asc' | 'desc'
): InventoryProduct[] => {
  const sorted = [...items];

  sorted.sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'name') {
      compareValue = a.name.localeCompare(b.name, 'uk-UA');
    } else if (sortBy === 'sku') {
      compareValue = a.sku.localeCompare(b.sku);
    } else if (sortBy === 'balance') {
      compareValue = (a.systemBalance ?? 0) - (b.systemBalance ?? 0);
    } else if (sortBy === 'deviation') {
      const deviationA = totalPortions(a) ?? 0;
      const deviationB = totalPortions(b) ?? 0;
      compareValue = Math.abs(deviationA - (a.systemBalance ?? 0)) - Math.abs(deviationB - (b.systemBalance ?? 0));
    }

    return direction === 'asc' ? compareValue : -compareValue;
  });

  return sorted;
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

export type SerializedInventoryItem = {
  type: 'product' | 'material';
  id: string;
  sku: string;
  name: string;
  systemBalance: number;
  unit: 'portions' | 'pcs';
  portionsPerBox: number;
  actualCount: number | null;
  boxCount: number | null;
  checked: boolean;
  categoryName?: string;
};

export const serializeItems = (prods: InventoryProduct[], mats: InventoryProduct[]): SerializedInventoryItem[] => [
  ...prods.map(({ id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName }) => ({
    type: 'product' as const, id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName,
  })),
  ...mats.map(({ id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName }) => ({
    type: 'material' as const, id, sku, name, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName,
  })),
];
