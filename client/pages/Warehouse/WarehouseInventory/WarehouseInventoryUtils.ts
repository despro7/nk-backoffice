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
// Обчислює загальну кількість порцій для продукту по складу ГП (готова продукція)
// ---------------------------------------------------------------------------

export const totalPortionsGp = (p: InventoryProduct): number | null => {
  if (p.unit !== 'portions') return p.actualCountGp;
  if (p.boxCountGp === null && p.actualCountGp === null) return null;
  return ((p.boxCountGp ?? 0) * p.portionsPerBox) + (p.actualCountGp ?? 0);
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
// Форматує кількість (total) у компактний вигляд з кількістю коробок/залишком
// Використовується у таблицях інвентаризацій для відображення як "N (boxes/rest)"
// ---------------------------------------------------------------------------
export const formatCompact = (total: number | null | undefined, portionsPerBox: number | null | undefined, sessionItem?: any): any => {
  if (total === null || total === undefined) return '–';
  if (!portionsPerBox || portionsPerBox <= 0) return String(total);
  if (sessionItem && sessionItem.boxCount !== undefined && sessionItem.boxCount !== null) {
    const bc = sessionItem.boxCount ?? 0;
    const ac = sessionItem.actualCount ?? 0;
    return (
      `${total} (${bc}/${ac})`
    );
  }
  const boxes = Math.floor(Number(total) / portionsPerBox);
  const rest = Number(total) % portionsPerBox;
  return `${total} (${boxes}/${rest})`;
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
  revising: 'Редагується',
  removed: 'Видалена',
};

export const statusColor: Record<InventoryStatus, 'default' | 'warning' | 'success' | 'danger' | 'secondary'> = {
  draft: 'default',
  in_progress: 'warning',
  completed: 'success',
  revising: 'secondary',
  removed: 'danger',
};

export const statusClass: Partial<Record<InventoryStatus, string>> = {
  revising: 'bg-violet-200 text-violet-800/80',
};

// ---------------------------------------------------------------------------
// Серіалізує поточний стан items для збереження в БД
// ---------------------------------------------------------------------------

export type SerializedInventoryItem = {
  type: 'product' | 'material' | 'set';
  id: string;
  sku: string;
  name: string;
  isOutdated?: boolean;
  systemBalance: number;
  unit: 'portions' | 'pcs';
  portionsPerBox: number;
  actualCount: number | null;
  boxCount: number | null;
  checked: boolean;
  categoryName?: string;
  // Склад готової продукції (ГП)
  systemBalanceGp: number;
  actualCountGp: number | null;
  boxCountGp: number | null;
};

export const serializeItems = (
  prods: InventoryProduct[],
  mats: InventoryProduct[],
  sets?: InventoryProduct[],
): SerializedInventoryItem[] => [
  ...prods.map(({ id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp }) => ({
    type: 'product' as const, id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp,
  })),
  ...mats.map(({ id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp }) => ({
    type: 'material' as const, id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp,
  })),
  ...(sets ?? []).map(({ id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp }) => ({
    type: 'set' as const, id, sku, name, isOutdated, systemBalance, unit, portionsPerBox, actualCount, boxCount, checked, categoryName, systemBalanceGp, actualCountGp, boxCountGp,
  })),
];
