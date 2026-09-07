/**
 * Генерує externalId для замовлення з автоматичним додаванням префіксу "SD"
 *
 * Логіка додавання префіксу "SD":
 * - Якщо sajt = 31, 38, null, "", undefined:
 *   - externalId порожній/null → "SD{id}"
 *   - externalId === String(id) → "SD{id}" (SD інколи дублює id у полі externalId;
 *     голий id колізить зі старими замовленнями)
 *   - інакше → оригінальний externalId (вже з префіксом SD або інший ключ)
 * - Інакше → оригінальний externalId або fallback на id
 *
 * @param rawOrder - Об'єкт замовлення з SalesDrive API
 * @returns externalId з префіксом SD (якщо потрібно) або оригінальний externalId
 */
export function generateExternalId(rawOrder: {
  id: number;
  externalId?: string | null;
  sajt?: number | string | null;
}): string {
  const sajt = rawOrder.sajt;
  const externalId = rawOrder.externalId;

  // Якщо externalId вже має префікс SD, повертаємо як є
  if (externalId && externalId.startsWith('SD')) {
    return externalId;
  }

  const sajtStr = sajt != null && sajt !== '' ? String(sajt) : '';
  const isSdPrefixedChannel =
    sajtStr === '31' || sajtStr === '38' || sajtStr === '';

  if (isSdPrefixedChannel && rawOrder.id) {
    if (!externalId || externalId === String(rawOrder.id)) {
      return `SD${rawOrder.id}`;
    }
  }

  // Повертаємо оригінальний externalId або fallback на id
  return externalId || rawOrder.id?.toString() || '';
}
