/** Тип документа Dilovod, повʼязаного із замовленням (`order_dilovod_documents.type`). */
export type OrderDilovodDocumentType = 'saleOrder' | 'cashIn' | 'sale' | 'saleReturn';

/** Документ Dilovod замовлення для UI (дата ISO). */
export interface OrderDilovodDocumentDto {
  type: OrderDilovodDocumentType;
  dilovodId: string;
  number: string | null;
  docDate: string;
}
