import { describe, expect, it } from 'vitest';
import {
  isBatchCorrectionComment,
  isReleaseBatchCorrection,
  normalizeCorrectionSessionId,
} from './releaseBatchCorrection.js';

describe('normalizeCorrectionSessionId', () => {
  it('відсікає null/порожнє', () => {
    expect(normalizeCorrectionSessionId(null)).toBeNull();
    expect(normalizeCorrectionSessionId('null')).toBeNull();
    expect(normalizeCorrectionSessionId('')).toBeNull();
    expect(normalizeCorrectionSessionId('  ')).toBeNull();
  });

  it('повертає UUID', () => {
    expect(normalizeCorrectionSessionId('44f9a4e6-6c67-4f14-b3aa-b10c33055084'))
      .toBe('44f9a4e6-6c67-4f14-b3aa-b10c33055084');
  });
});

describe('isBatchCorrectionComment', () => {
  it('розпізнає обидва написання', () => {
    expect(isBatchCorrectionComment('Коригування парт. обліку – REBATCH: Борщ')).toBe(true);
    expect(isBatchCorrectionComment('Корегування парт. обліку – Борщ')).toBe(true);
    expect(isBatchCorrectionComment('Звичайний коментар')).toBe(false);
  });
});

describe('isReleaseBatchCorrection', () => {
  it('true за session id', () => {
    expect(isReleaseBatchCorrection({ correctionSessionId: 'abc' })).toBe(true);
  });

  it('true за comment навіть без session', () => {
    expect(isReleaseBatchCorrection({
      correctionSessionId: null,
      comment: 'Коригування парт. обліку – REBATCH: Борщ (377 шт.)',
    })).toBe(true);
  });

  it('true за rebatch sku', () => {
    expect(isReleaseBatchCorrection({
      setSku: '01010_rebatch',
      items: [{ set_sku: '01010_rebatch', correction_session_id: null }],
    })).toBe(true);
  });

  it('false для звичайного випуску', () => {
    expect(isReleaseBatchCorrection({
      comment: '5 х Мікс',
      setSku: '01010',
      items: [{ set_sku: '01010' }],
    })).toBe(false);
  });
});
