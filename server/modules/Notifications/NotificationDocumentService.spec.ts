import { describe, expect, it } from 'vitest';
import { detectDocumentKind, parseShortageError, readableError } from './NotificationDocumentService';

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
});
