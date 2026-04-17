/**
 * Shared типи для імпорту "Надходження грошей" (Cash-In Import)
 * Використовуються на клієнті та сервері
 */

// Статус одного рядка після парсингу та валідації
export type CashInRowStatus = 'ok' | 'amount_mismatch' | 'ambiguous' | 'not_found' | 'duplicate_cash_in';

// Кандидат замовлення для вибору (при статусі "ambiguous")
export interface CashInOrderCandidate {
  orderNumber: string;
  orderDate: string;          // ISO date string
  totalPrice: number;
}

// Один розпарсений рядок з Excel
export interface CashInRow {
  /** Порядковий номер рядка в Excel (для відображення) */
  rowIndex: number;
  /** Дата перерахунку (колонка C) */
  transferDate: string;        // ISO date string
  /** Сума прийнятих коштів (колонка D) */
  amountReceived: number;
  /** Сума утриманої винагороди (колонка E) */
  commissionAmount: number;
  /** ПІБ Покупця (колонка H) */
  buyerName: string;
  /** Номер замовлення (колонка J) */
  orderNumber: string | null;

  // --- Результат валідації ---
  status: CashInRowStatus;
  /** Знайдений номер замовлення (після резолву) */
  resolvedOrderNumber?: string;
  /** dilovodDocId замовлення з БД (для Payload.baseDoc) */
  dilovodDocId?: string | null;
  /** Сума замовлення в БД (для порівняння) */
  dbOrderAmount?: number;
  /** Список кандидатів (при status === "ambiguous") */
  candidates?: CashInOrderCandidate[];
  /** Повідомлення про помилку (для відображення) */
  errorMessage?: string;
  /**
   * Дозвіл менеджера на відправку попри дублікат (для статусу duplicate_cash_in).
   * За замовчуванням false — рядок-дублікат пропускається.
   */
  allowDuplicate?: boolean;
}

// Відповідь сервера на POST /api/dilovod/cash-in/preview
export interface CashInPreviewResponse {
  rows: CashInRow[];
  totalRows: number;
  okCount: number;
  mismatchCount: number;
  ambiguousCount: number;
  notFoundCount: number;
  duplicateCount: number;
}

// Підтверджений рядок для відправки (після ручного редагування)
export interface CashInConfirmedRow {
  rowIndex: number;
  transferDate: string;
  amountReceived: number;
  commissionAmount: number;
  orderNumber: string;
  dilovodDocId: string | null;
}

// Тіло запиту POST /api/dilovod/cash-in/export
export interface CashInExportRequest {
  rows: CashInConfirmedRow[];
}

// Відповідь сервера на POST /api/dilovod/cash-in/export
export interface CashInExportResponse {
  success: boolean;
  exportedCount: number;
  errors: Array<{ rowIndex: number; orderNumber: string; error: string }>;
}
