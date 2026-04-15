// ---------------------------------------------------------------------------
// Types for WarehouseMovement feature
// ---------------------------------------------------------------------------

export type MovementStatus = 'draft' | 'active' | 'finalized';

/** Представляє окрему партію товару для переміщення */
export interface MovementBatch {
  id: string;          // Унікальний ідентифікатор для React key
  batchId: string;     // ID партії в Діловоді (goodPart) — для поля goodPart у payload
  batchNumber: string; // Номер/назва партії для відображення у UI
  storage: string;     // ID складу обраної партії
  quantity: number;    // Доступний залишок обраної партії
  boxes: number;       // Кількість коробок для цієї партії
  portions: number;    // Кількість додаткових порцій для цієї партії
}

export interface MovementProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  dilovodId: string | null; // ID товару в Діловоді (для payload)
  portionsPerBox: number; // Кількість порцій в коробці (для розрахунку загальної суми)
  details: {
    batches: MovementBatch[]; // Масив партій для цього товару
    forecast: number; // Прогноз (довідково)
    deviation: number; // Відхилення (якщо є)
  };
  stockData: {
    mainStock: number; // Залишок на основному складі (порції)
    smallStock: number; // Залишок на малому складі (порції)
  };
}

export interface MovementItem {
  sku: string;
  productName: string;
  boxQuantity: number;
  portionQuantity: number;
  batchNumber: string;
  batchId: string;      // ID партії в Діловоді (goodPart) — для поля goodPart у payload
  batchStorage: string; // ID складу обраної партії
  forecast: number;
}

export interface MovementDeviation {
  sku: string;
  batchNumber: string;
  deviation: number;
}

export interface MovementDraft {
  id: number;
  status: MovementStatus;
  sourceWarehouse: string;
  destinationWarehouse: string;
  items: MovementItem[];
  deviations?: MovementDeviation[];
  notes?: string;
  movementDate?: string; // Дата документа переміщення (локальний час, формат "YYYY-MM-DD HH:mm:ss")
  draftCreatedAt?: string;
  sentToDilovodAt?: string | null;       // Перша відправка до Діловода
  lastSentToDilovodAt?: string | null;   // Остання відправка (проміжна або фінальна)
  internalDocNumber?: string;   // Внутрішній номер документа
  dilovodDocId?: string;        // ID документа в Діловоді (для редагування документів з історії)
  docNumber?: string;           // Номер документа від Діловода (після відправки)
  createdBy?: string;           // Автор чернетки (ID користувача)
  createdByName?: string;       // Автор чернетки (ім'я користувача)
  dilovodPayload?: {
    header: any;
    tableParts: any;
  };
}

export interface MovementSession {
  id: string;
  createdAt: string;
  status: MovementStatus;
  sentToDilovodAt: string | null;
  items: MovementItem[];
  deviations: MovementDeviation[];
}
