/**
 * Генерує externalId для замовлення з автоматичним додаванням префіксу "SD"
 * 
 * Логіка додавання префіксу "SD":
 * - Якщо sajt = 31, 38, null, "", undefined ТА externalId порожній/null → "SD{id}"
 * - Інакше → оригінальний externalId
 * 
 * @param rawOrder - Об'єкт замовлення з SalesDrive API
 * @returns externalId з префіксом SD (якщо потрібно) або оригінальний externalId
 * 
 */
export function generateExternalId(rawOrder: { 
  id: number; 
  externalId?: string | null; 
  sajt?: number | string | null 
}): string {
  const sajt = rawOrder.sajt;
  const externalId = rawOrder.externalId;
  
  // Якщо externalId вже має префікс SD, повертаємо як є
  if (externalId && externalId.startsWith('SD')) {
    return externalId;
  }
  
  // Перевіряємо умови для додавання префіксу SD
  const needsPrefix = (sajt === 31 || sajt === 38 || !sajt) && !externalId;
  
  if (needsPrefix && rawOrder.id) {
    const generated = `SD${rawOrder.id}`;
    // console.log(`🏷️ [ExternalID] Auto-generated: ${generated} (sajt: ${sajt}, original: ${externalId || 'empty'})`);
    return generated;
  }
  
  // Повертаємо оригінальний externalId або fallback на id
  return externalId || rawOrder.id?.toString() || '';
}
