/** Реєстр Dilovod для перевірки історичних складських документів (action request `from`). */
export const WAREHOUSE_HISTORY_DILOVOD_FROM = {
  movement: 'documents.goodMoving',
  writeOff: 'documents.goodWriteOff',
  surplus: 'documents.goodWriteOn',
  releaseSet: 'documents.goodWriteOff',
  return: 'documents.saleReturn',
} as const;

export type WarehouseHistoryDilovodRecordType = keyof typeof WAREHOUSE_HISTORY_DILOVOD_FROM;

export function resolveWarehouseHistoryDilovodFrom(
  recordType?: WarehouseHistoryDilovodRecordType,
): string {
  if (!recordType) {
    return WAREHOUSE_HISTORY_DILOVOD_FROM.movement;
  }
  return WAREHOUSE_HISTORY_DILOVOD_FROM[recordType];
}
