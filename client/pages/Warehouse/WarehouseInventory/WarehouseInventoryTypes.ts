// ---------------------------------------------------------------------------
// Types for WarehouseInventory feature
// ---------------------------------------------------------------------------

export type InventoryStatus = 'draft' | 'in_progress' | 'completed' | 'revising' | 'removed';

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  categoryName?: string;
  systemBalance: number; // Залишок за системою (порції або штуки)
  isBalanceRefreshing?: boolean; // Локальний loader для оновлення залишку на дату
  actualCount: number | null; // Фактична кількість (порції або штуки)
  boxCount: number | null; // Кількість повних коробок (тільки для порційних товарів)
  unit: 'portions' | 'pcs'; // Визначає, як інтерпретувати systemBalance та actualCount
  portionsPerBox: number; // Кількість порцій в коробці (тільки для порційних товарів)
  checked: boolean; // Чи перевірено позицію (підтверджено фактичну кількість)
}

export interface InventorySession {
  id: string;
  inventoryDate: string;
  createdAt: string;
  createdBy: string;
  
  status: InventoryStatus;
  completedAt: string | null;
  comment: string;
  items: InventoryProduct[];
}

export interface ProductHistoryEntry {
  sessionId: number;
  date: string;
  systemBalance: number | null;
  actual: number | null;
  deviation: number | null;
  // Нові поля для аналізу руху залишків
  shipped?: number | null; // Відвантаження
  returned?: number | null; // Повернення
  writtenOff?: number | null; // Списання
}
