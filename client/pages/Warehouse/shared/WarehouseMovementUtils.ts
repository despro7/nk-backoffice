import type { MovementProduct, MovementStatus } from './WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// Обчислює загальну кількість порцій для переміщення по всіх партіях
// ---------------------------------------------------------------------------

export const totalPortions = (p: MovementProduct): number => {
  return p.details.batches.reduce(
    (sum, batch) => sum + (batch.boxes * p.portionsPerBox + batch.portions),
    0
  );
};

// ---------------------------------------------------------------------------
// Словники для відображення статусу
// ---------------------------------------------------------------------------

export const statusLabel: Record<MovementStatus, string> = {
  draft: 'Чернетка',
  active: 'Активний',
  finalized: 'Фіналізований',
};

export const statusColor: Record<MovementStatus, 'default' | 'warning' | 'success'> = {
  draft: 'default',
  active: 'warning',
  finalized: 'success',
};

// ---------------------------------------------------------------------------
// Форматує дату у форматі uk-UA
// ---------------------------------------------------------------------------

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('uk-UA');
};

// ---------------------------------------------------------------------------
// Серіалізує товари для збереження в БД
// Розгортає масив партій: один товар → багато рядків (по одному на партію)
// ---------------------------------------------------------------------------

export const serializeMovementItems = (products: MovementProduct[]) => {
  const items: any[] = [];

  products.forEach(({ sku, name, portionsPerBox, details: { batches, forecast } }) => {
    batches.forEach(batch => {
      if (batch.boxes > 0 || batch.portions > 0) {
        // totalPortions — загальна кількість порцій (коробки * порцій/коробку + залишок).
        // Зберігаємо окремо, щоб MovementHistoryService міг відобразити qty без знання portionsPerBox.
        const total = batch.boxes * portionsPerBox + batch.portions;
        items.push({
          sku,
          productName: name,
          boxQuantity: batch.boxes,
          portionQuantity: batch.portions,
          totalPortions: total,
          batchNumber: batch.batchNumber || '',
          batchId: batch.batchId || '',
          batchStorage: batch.storage || '',
          forecast,
        });
      }
    });
  });

  return items;
};
