export interface WarehouseDocumentEditOpenParams {
  dilovodDocumentId: string;
  documentLabel: string;
  /** Dilovod type id, напр. documents.goodMoving */
  documentTypeId?: string;
}
