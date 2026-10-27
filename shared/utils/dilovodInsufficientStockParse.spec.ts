import { describe, expect, it } from 'vitest';
import { parseDilovodInsufficientStockRows } from './dilovodInsufficientStockParse.js';

describe('parseDilovodInsufficientStockRows', () => {
  it('parses span blocks from applicationLayerError', () => {
    const raw = `applicationLayerError Документ не збережено. Недостатня кількість.
<span>Квасоля червона варена</span> | Код: 000000527 | Артикул: 02009 |
Партія: 60608 | Потрібно: 5.000 шт | Вільний залишок: 0 шт | Недостатньо: 5.000 шт.
<span>Цибуля маринована</span> | Артикул: 02015 | Партія: 60908 | Потрібно: 5.000 шт | Вільний залишок: 0 шт | Недостатньо: 5.000 шт.`;

    const rows = parseDilovodInsufficientStockRows(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Квасоля червона варена',
      sku: '02009',
      batch: '60608',
      needed: '5.000',
      stock: '0',
      missing: '5.000',
    });
  });
});
