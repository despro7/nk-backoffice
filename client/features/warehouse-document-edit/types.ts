export interface WarehouseDocumentEditOpenParams {
  dilovodDocumentId: string;
  documentLabel: string;
  /** Dilovod type id, напр. documents.goodMoving */
  documentTypeId?: string;
  /** Викликається після видалення документа (оновити викликаючий список/звіт). */
  onDeleted?: () => void;
}
