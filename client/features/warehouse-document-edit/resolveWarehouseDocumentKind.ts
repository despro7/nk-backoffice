export type WarehouseDocumentKind =
  | 'goodMoving'
  | 'writeOff'
  | 'surplus'
  | 'saleReturn'
  | 'release'
  | 'shipment'
  | 'unknown';

export function resolveWarehouseDocumentKind(
  documentLabel: string,
  documentTypeId?: string,
): WarehouseDocumentKind {
  const typeId = (documentTypeId ?? '').trim().toLowerCase();
  if (typeId.includes('goodmoving')) return 'goodMoving';
  if (typeId.includes('goodwriteoff')) return 'writeOff';
  if (typeId.includes('goodwriteon')) return 'surplus';
  if (typeId.includes('salereturn')) return 'saleReturn';
  if (typeId.includes('goodkit') || typeId.includes('release')) return 'release';
  if (typeId.includes('sale') || typeId.includes('shipment') || typeId.includes('відвантаж')) {
    return 'shipment';
  }

  const text = documentLabel.trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('переміщен')) return 'goodMoving';
  if (text.includes('списан')) return 'writeOff';
  if (text.includes('оприбуткуван')) return 'surplus';
  if (text.includes('повернен')) return 'saleReturn';
  if (text.includes('комплектац') || text.includes('розкомплект') || text.includes('розукомплект') || text.includes('випуск')) {
    return 'release';
  }
  if (text.includes('відвантаж')) return 'shipment';
  return 'unknown';
}
