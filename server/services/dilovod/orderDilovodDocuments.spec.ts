import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils.js', () => ({ prisma: {} }));

const { toOrderDilovodDocumentInput, toOrderDilovodDocumentInputs } = await import('./orderDilovodDocuments.js');

describe('toOrderDilovodDocumentInput', () => {
  it('рядок Dilovod (Europe/Kyiv) → UTC Date, номер, id', () => {
    expect(
      toOrderDilovodDocumentInput('sale', {
        id: '1106800000030865',
        date: '2026-11-05 15:42:29',
        number: '0009363',
      }),
    ).toEqual({
      type: 'sale',
      dilovodId: '1106800000030865',
      number: '0009363',
      docDate: new Date('2026-11-05T13:42:29.000Z'),
    });
  });

  it('id у форматі { id, pr }, порожній номер: null', () => {
    expect(
      toOrderDilovodDocumentInput('saleReturn', { id: { id: '1109800000001364', pr: 'X' }, date: '2026-10-13 10:52:17', number: ' ' }),
    ).toMatchObject({ dilovodId: '1109800000001364', number: null });
  });

  it('без id або дати: null', () => {
    expect(toOrderDilovodDocumentInput('sale', { id: '0', date: '2026-10-02 08:35:32' })).toBeNull();
    expect(toOrderDilovodDocumentInput('sale', { id: '1', date: '' })).toBeNull();
    expect(toOrderDilovodDocumentInput('sale', undefined)).toBeNull();
  });
});

describe('toOrderDilovodDocumentInputs', () => {
  it('відкидає невалідні і дублікати за dilovodId', () => {
    const inputs = toOrderDilovodDocumentInputs('sale', [
      { id: '1', date: '2026-10-02 08:35:32', number: 'A' },
      { id: '1', date: '2026-10-02 08:35:32', number: 'A' },
      { id: '2', date: 'bad' },
      { id: '3', date: '2026-11-05 15:42:29' },
    ]);
    expect(inputs.map((doc) => doc.dilovodId)).toEqual(['1', '3']);
  });
});
