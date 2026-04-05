// ---------------------------------------------------------------------------
// Types for WarehouseInventory feature
// ---------------------------------------------------------------------------

export type InventoryStatus = 'draft' | 'in_progress' | 'completed';

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  systemBalance: number; // Залишок за системою (порції або штуки)
  actualCount: number | null; // Фактична кількість (порції або штуки)
  boxCount: number | null; // Кількість повних коробок (тільки для порційних товарів)
  unit: 'portions' | 'pcs'; // Визначає, як інтерпретувати systemBalance та actualCount
  portionsPerBox: number; // Кількість порцій в коробці (тільки для порційних товарів)
  checked: boolean; // Чи перевірено позицію (підтверджено фактичну кількість)
}

export interface InventorySession {
  id: string;
  createdAt: string;
  status: InventoryStatus;
  completedAt: string | null;
  comment: string;
  items: InventoryProduct[];
}
