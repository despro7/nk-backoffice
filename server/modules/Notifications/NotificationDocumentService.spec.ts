import { describe, expect, it } from 'vitest';
import { computeTotals, detectDocumentKind, mergeShortage, parseShortageError, readableError } from './NotificationDocumentService';

describe('NotificationDocumentService', () => {
  it('detects warehouse document kind from log data', () => {
    expect(detectDocumentKind({ category: 'dilovod', title: 'x', data: { releaseId: 654 } })).toBe('release');
    expect(detectDocumentKind({ category: 'dilovod', title: 'x', data: { draftId: 507 } })).toBe('movement');
    expect(detectDocumentKind({ category: 'warehouse_movement', title: 'x', data: JSON.stringify({ docId: 128 }) })).toBe('movement');
    expect(detectDocumentKind({ category: 'dilovod', title: 'WriteOff export failed', data: { payload: {} } })).toBe('writeOff');
    expect(detectDocumentKind({ category: 'dilovod', title: 'x', data: { orderNumber: '1' } })).toBeNull();
  });

  it('unwraps Dilovod JSON error text', () => {
    const raw = JSON.stringify({ error: 'applicationLayerError Документ не збережено. Недостатня кількість.', clientMessages: [] });
    expect(readableError(raw)).toBe('Документ не збережено. Недостатня кількість.');
    const broken = '{\n  "error": "applicationLayerError Документ не збережено.\n- Код: 1",\n  "clientMessages": []\n}';
    expect(readableError(broken)).toBe('Документ не збережено.\n- Код: 1');
    expect(readableError('просто текст')).toBe('просто текст');
    expect(readableError(null)).toBeNull();
  });

  it('parses Dilovod shortage error into rows', () => {
    const text = [
      'Документ не збережено. Недостатня кількість. Біла квасоля з куркою',
      '- Код: 0000000795 | Артикул: 02032 | Партія: K-61026 | Рахунок Готова продукція. Потрібно: 40.000 шт | Вільний залишок: 0 шт | Недостатньо: 40.000 шт.',
      '- Червона квасоля зі свининою | Код: 0000000794 | Артикул: 02033 | Партія: 20.08.2026 Комплектація 0000630 | Рахунок Готова продукція. Потрібно: 20.000 шт | Вільний залишок: 1.5 шт | Недостатньо: 18.5 шт.',
    ].join('\n');
    const { summary, rows } = parseShortageError(text);
    expect(summary).toBe('Документ не збережено. Недостатня кількість.');
    expect(rows).toEqual([
      { name: 'Біла квасоля з куркою', sku: '02032', batch: 'K-61026', needed: 40, stock: 0, missing: 40 },
      { name: 'Червона квасоля зі свининою', sku: '02033', batch: '20.08.2026 Комплектація 0000630', needed: 20, stock: 1.5, missing: 18.5 },
    ]);
    expect(parseShortageError('Інша помилка')).toEqual({ summary: null, rows: [] });
  });

  it('parses write-off shortage format', () => {
    const text = 'Недостатня кількість:\n- Печеня зі свининою | арт: 03001 | партія: 60722 | потрібно: 6.000 шт | залишок: 0 шт | бракує: 6.000 шт';
    expect(parseShortageError(text)).toEqual({
      summary: 'Недостатня кількість',
      rows: [{ name: 'Печеня зі свининою', sku: '03001', batch: '60722', needed: 6, stock: 0, missing: 6 }],
    });
  });

  it('merges shortage into item rows by sku and batch', () => {
    const items = [
      { sku: '02033', name: 'Квасоля', quantity: 20, batch: 'A' },
      { sku: '02033', name: 'Квасоля', quantity: 20, batch: 'B' },
      { sku: '03001', name: 'Печеня', quantity: 6, batch: null },
    ];
    const merged = mergeShortage(items, [
      { name: 'Квасоля', sku: '02033', batch: 'B', needed: 20, stock: 0, missing: 20 },
      { name: 'Печеня', sku: '03001', batch: '60722', needed: 6, stock: 1, missing: 5 },
      { name: 'Інше', sku: '09999', batch: null, needed: 2, stock: 0, missing: 2 },
    ]);
    expect(merged.map((i) => i.missing ?? null)).toEqual([null, 20, 5, 2]);
    expect(merged[3]).toMatchObject({ sku: '09999', quantity: 2 });
  });

  it('counts positions, dishes and portions with nested sets', () => {
    const sets: Record<string, Array<{ sku: string; qty: number }>> = {
      K24: [{ sku: '01001', qty: 12 }, { sku: 'K12', qty: 1 }],
      K12: [{ sku: '03001', qty: 12 }],
    };
    const lookup = { composition: (sku: string) => sets[sku] ?? null };
    const items = [
      { sku: 'K24', name: 'Набір', quantity: 2, batch: null },
      { sku: '03001', name: 'Печеня', quantity: 6, batch: null },
    ];
    expect(computeTotals(items, lookup)).toEqual({ positions: 2, dishes: 8, portions: 54 });
    expect(computeTotals(items, null).portions).toBeNull();
  });
});
