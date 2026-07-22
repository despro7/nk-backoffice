// ---------------------------------------------------------------------------
// Types for WarehouseInventory feature
// ---------------------------------------------------------------------------

export type InventoryStatus = 'draft' | 'in_progress' | 'completed' | 'revising' | 'removed';

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  categoryName?: string;
  isOutdated?: boolean;
  systemBalance: number; // Залишок за системою (порції або штуки)
  isBalanceRefreshing?: boolean; // Локальний loader для оновлення залишку на дату
  actualCount: number | null; // Фактична кількість (порції або штуки)
  boxCount: number | null; // Кількість повних коробок (тільки для порційних товарів)
  unit: 'portions' | 'pcs'; // Визначає, як інтерпретувати systemBalance та actualCount
  portionsPerBox: number; // Кількість порцій в коробці (тільки для порційних товарів)
  checked: boolean; // Чи перевірено позицію (підтверджено фактичну кількість)
  componentsSnapshot?: any[]; // Склад набору, якщо це комплект

  // --- Склад готової продукції (ГП / основний склад) ---
  systemBalanceGp: number; // Залишок за системою по складу ГП (порції або штуки)
  isBalanceGpRefreshing?: boolean; // Локальний loader для оновлення залишку ГП на дату
  actualCountGp: number | null; // Фактична кількість по складу ГП (порції або штуки)
  boxCountGp: number | null; // Кількість повних коробок по складу ГП (тільки для порційних товарів)
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
  // Нові поля для аналізу руху залишків (МС)
  kit?: number | null; // Комплектування / розкомплектація (малий склад)
  shipped?: number | null; // Відвантаження
  moved?: number | null; // Переміщення відносно малого складу: + на малий, − з малого
  returned?: number | null; // Повернення на малий склад
  writtenOff?: number | null; // Списання з малого складу
  // GP (склад готової продукції) поля
  kitGp?: number | null; // Комплектування / розкомплектація (ГП)
  movedGp?: number | null; // Переміщення відносно складу ГП: + на ГП, − з ГП
  writtenOffGp?: number | null; // Списання зі складу ГП
  /** Деталі комплектацій для tooltip (коли SKU був компонентом наборів) */
  kitDetails?: Array<{
    setSku: string;
    setName: string | null;
    operationType: 'kit' | 'unkit';
    quantity: number;
    signedQuantity: number;
    storage: 'ms' | 'gp';
  }>;
  systemBalanceGp?: number | null;
  actualGp?: number | null;
  deviationGp?: number | null;
  // Tooltip дані для ГП
  systemBalanceGpBoxCount?: number | null;
  systemBalanceGpActualCount?: number | null;
  actualGpBoxCount?: number | null;
  actualGpActualCount?: number | null;
}
