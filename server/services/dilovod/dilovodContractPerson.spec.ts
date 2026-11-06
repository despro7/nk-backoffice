import { describe, expect, it } from 'vitest';
import { dilovodRefId, parseContractPersonMismatch } from './dilovodContractPerson.js';

describe('parseContractPersonMismatch', () => {
  it('парсить договір і контрагента з помилки Dilovod (24453)', () => {
    expect(
      parseContractPersonMismatch('%contract% зареєстровано на %person%|1109100000023322|1100100000015532'),
    ).toEqual({ contractId: '1109100000023322', personId: '1100100000015532' });
  });

  it('працює з обʼєктом помилки', () => {
    expect(
      parseContractPersonMismatch({ error: '%contract% зареєстровано на %person%|11|22' }),
    ).toEqual({ contractId: '11', personId: '22' });
  });

  it('null для інших помилок', () => {
    expect(parseContractPersonMismatch('Недостатньо залишку')).toBeNull();
    expect(parseContractPersonMismatch(undefined)).toBeNull();
  });
});

describe('dilovodRefId', () => {
  it('рядок і { id, pr }', () => {
    expect(dilovodRefId('1100100000016564')).toBe('1100100000016564');
    expect(dilovodRefId({ id: '1100100000015532', pr: 'X' })).toBe('1100100000015532');
  });

  it('порожнє і 0: null', () => {
    expect(dilovodRefId({ id: '0', pr: null })).toBeNull();
    expect(dilovodRefId(undefined)).toBeNull();
  });
});
