// ============================================================================
// Типи для документів переміщення товарів (documents.goodMoving з Діловода)
// ============================================================================

/**
 * Товар у переміщенні з таблиці tpGoods
 */
export interface GoodMovingItem {
  id: string; // Унікальний ID рядка в таблиці
  rowNum: string;
  good: string; // ID товару
  good__pr: string; // Назва товару
	goodPart__pr: string;
  sku: string; // Артикул
  qty: string; // Кількість
  unit: string; // ID одиниці виміру
  unit__pr: string; // Назва одиниці (шт, кг, л)
	accGood__pr: string; // Назва облікової одиниці
  price: string; // Ціна за одиницю
  amountCost: string; // Вартість за собівартістю
  amountCur: string; // Сума по цені
  vatTax?: string; // ID ПДВ
  vatTax__pr?: string; // Ставка ПДВ (20%, 0%)
}

/**
 * Деталі переміщення з Діловода (getObject)
 */
export interface GoodMovingDocumentDetails {
  header: {
    id: {
      id: string;
      pr: string;
    };
    number: string;
    date: string;
    remark: string;
    storage: {
      id: string;
      pr: string;
    };
    storageTo: {
      id: string;
      pr: string;
    };
    firm: {
      id: string;
      pr: string;
    };
    author: {
      id: string;
      pr: string;
    };
    amountCost: string;
    [key: string]: any; // Інші поля заголовка
  };
  tableParts: {
    tpGoods: Record<string, GoodMovingItem>;
  };
  misc?: boolean;
}

/**
 * Документ переміщення товарів з Діловода
 * Поле __pr містять локалізовані значення для дисплея (від Діловода)
 */
export interface GoodMovingDocument {
  id: string;
  number: string;
  date: string; // ISO datetime: "2026-03-05 09:59:34"
  remark: string;
  storage: string; // ID складу-донора
  storageTo: string; // ID складу-реципієнта
  firm: string; // ID компанії/фірми
  author: string; // ID автора документа

  // __pr поля з відповіді Діловода (для дисплея)
  id__pr?: string; // Приклад: "05.03.2026 Переміщення M000031"
  number__pr?: string;
  date__pr?: string;
  storage__pr?: string; // Приклад: "Склад готової продукції"
  storageTo__pr?: string; // Приклад: "Малий склад"
  firm__pr?: string; // Приклад: "Бубнова М.В. ФОП"
  author__pr?: string; // Приклад: "Зав.виробництвом"

  // Деталі (завантажуються окремо)
  details?: GoodMovingDocumentDetails;
}

/**
 * Фільтри для запиту до Діловода
 */
export interface GoodMovingFilter {
  storageId?: string; // ID складу-донора (dilovod_main_storage_id)
  storageToId?: string; // ID складу-реципієнта (dilovod_small_storage_id)
  fromDate?: string; // Дата від (ISO: "2026-01-01 00:00:00")
  toDate?: string; // Дата по (ISO: "2026-01-31 23:59:59"); якщо не передано — без обмеження
  remark?: string; // Пошук за примітками (опціонально)
}

/**
 * Структурована відповідь історії переміщень
 */
export interface MovementHistoryResponse {
  documents: GoodMovingDocument[];
  total: number;
  filters: {
    storageId: string;
    storageToId: string;
    fromDate: string;
    toDate?: string;
  };
}

/**
 * Запит на отримання історії переміщень (для frontend)
 */
export interface MovementHistoryRequest {
  filters: GoodMovingFilter;
}

// ============================================================================
// Типи для налаштувань переміщень та payload для Діловода
// ============================================================================

/**
 * Статус документа переміщення
 * - draft     : чернетка, ще не відправлялась
 * - active    : відправлено в Діловод, але комірник може продовжувати редагувати
 * - finalized : фінальна відправка, документ заблоковано для редагування
 */
export type MovementStatus = 'draft' | 'active' | 'finalized';

/**
 * Локальний запис документа переміщення (з БД / відповідь сервера)
 */
export interface MovementDraft {
  id: number;
  internalDocNumber: string;
  docNumber: string | null;
  dilovodDocId: string | null;
  status: MovementStatus;
  sourceWarehouse: string;
  destinationWarehouse: string;
  notes: string | null;
  items: string;
  deviations: string | null;
  movementDate: string | null;
  draftCreatedAt: string;
  draftLastEditedAt: string;
  sentToDilovodAt: string | null;
  lastSentToDilovodAt: string | null;
  createdBy: number;
  createdByName?: string | null;
}

/**
 * Налаштування переміщень між складами (зберігаються в settings_base з category='warehouse_movement')
 */
export interface WarehouseMovementSettings {
  numberGeneration: 'server' | 'dilovod'; // wm_numberGeneration
  numberTemplate: string;                  // wm_numberTemplate
  firmId: string;                          // wm_firmId
  businessId: string;                      // wm_businessId (Напрям бізнесу — аналітичний вимір Діловода)
  storageFrom: string;                     // wm_storageFrom
  storageTo: string;                       // wm_storageTo
  docMode: string;                         // wm_docMode
  unitId: string;                          // wm_unitId
  accountId: string;                       // wm_accountId
}

/**
 * Один рядок таблиці товарів у payload переміщення
 */
export interface DilovodMovementGoodItem {
  rowNum: number;
  good: number;       // ID товару в Діловоді (число, не рядок!)
  qty: number;        // Кількість (порції)
  unit: number;       // ID одиниці виміру (число)
  goodPart: number;   // Партія (batchId — число)
  accGood: number;    // Рахунок обліку товару (число)
}

/**
 * Payload для відправки документа переміщення до Діловода
 */
export interface DilovodMovementPayload {
  /**
   * Режим збереження:
   * 1 - REGISTER (зберегти з проведенням — використовується завжди)
   * 2 - UNREGISTER (скасування проведення)
   */
  saveType: 1 | 2;
  header: {
    id?: string;        // Для нових документів — 'documents.goodMoving'; для редагування — ID документа в Діловоді
    date: string;       // Дата документа (локальний час "YYYY-MM-DD HH:mm:ss")
    number?: string;    // Номер документа (не передавати якщо numberGeneration='dilovod')
    firm: string;       // ID підприємства
    storage: string;    // ID складу-донора
    storageTo: string;  // ID складу-реципієнта
    docMode: string;    // Режим документа
    business?: string;  // Напрям бізнесу (аналітичний вимір Діловода — wm_businessId)
    taxAccount: number; // Рахунок ПДВ (завжди 1)
    remark: string;     // Примітка
    author: string;     // ID автора в Діловоді (dilovodUserId з таблиці users)
  };
  tableParts: {
    tpGoods: DilovodMovementGoodItem[];
  };
}

/**
 * Результат dry-run (preview) або фактичної відправки до Діловода
 */
export interface MovementSendResult {
  dryRun: boolean;
  payload: DilovodMovementPayload;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  // Заповнюється лише при фактичній відправці
  dilovodDocId?: string;
  docNumber?: string;
}
