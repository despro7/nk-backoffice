import { describe, expect, it } from 'vitest';
import {
  isLastShipmentReturned,
  isShippedWithoutPicking,
  isRepeatPicking,
  isReshippedAfterReturn,
  isReturnDuplicate,
  isSaleDuplicate,
  latestDocDate,
  needsNewSaleDoc,
  resolveShipmentCycle,
} from './dilovodShipmentCycle.js';

describe('resolveShipmentCycle', () => {
  it('first: відвантаження ще не було', () => {
    expect(resolveShipmentCycle({ saleExportDate: null, returnDate: null })).toBe('first');
  });

  it('already_shipped: відвантаження без повернення', () => {
    expect(resolveShipmentCycle({ saleExportDate: '2026-10-02T08:35:32Z', returnDate: null })).toBe(
      'already_shipped',
    );
  });

  it('repeat_candidate: після відвантаження було повернення', () => {
    expect(
      resolveShipmentCycle({ saleExportDate: '2026-10-02T08:35:32Z', returnDate: '2026-10-20T10:00:00Z' }),
    ).toBe('repeat_candidate');
  });
});

describe('needsNewSaleDoc', () => {
  it('потрібен, коли всі відвантаження повернуті', () => {
    expect(needsNewSaleDoc(1, 1)).toBe(true);
    expect(needsNewSaleDoc(2, 2)).toBe(true);
  });

  it('не потрібен, коли повторне відвантаження вже є', () => {
    expect(needsNewSaleDoc(2, 1)).toBe(false);
  });
});

describe('isSaleDuplicate', () => {
  it('2 sale без повернень: дублікат', () => {
    expect(isSaleDuplicate(2, 0)).toBe(true);
    expect(isSaleDuplicate(2, null)).toBe(true);
  });

  it('2 sale і 1 повернення: повторний цикл, не дублікат', () => {
    expect(isSaleDuplicate(2, 1)).toBe(false);
  });

  it('3 sale і 1 повернення: дублікат', () => {
    expect(isSaleDuplicate(3, 1)).toBe(true);
  });

  it('1 sale: не дублікат', () => {
    expect(isSaleDuplicate(1, 0)).toBe(false);
  });
});

describe('isReturnDuplicate', () => {
  it('2 повернення на 1 відвантаження: дублікат', () => {
    expect(isReturnDuplicate(2, 1)).toBe(true);
  });

  it('2 повернення на 2 відвантаження: не дублікат', () => {
    expect(isReturnDuplicate(2, 2)).toBe(false);
  });

  it('1 повернення без підрахунку sale: не дублікат', () => {
    expect(isReturnDuplicate(1, null)).toBe(false);
  });
});

describe('isReshippedAfterReturn', () => {
  it('true, коли відвантаження пізніше за повернення', () => {
    expect(isReshippedAfterReturn('2026-11-05T14:21:00Z', '2026-10-20T10:00:00Z')).toBe(true);
  });

  it('false, коли повернення останнє або дат немає', () => {
    expect(isReshippedAfterReturn('2026-10-02T08:35:32Z', '2026-10-20T10:00:00Z')).toBe(false);
    expect(isReshippedAfterReturn(null, '2026-10-20T10:00:00Z')).toBe(false);
  });
});

describe('latestDocDate', () => {
  it('бере найпізнішу дату (Europe/Kyiv)', () => {
    const latest = latestDocDate([
      { date: '2026-10-02 10:35:32' },
      { date: '2026-11-05 16:21:00' },
      { date: undefined },
    ]);
    expect(latest?.toISOString()).toBe('2026-11-05T14:21:00.000Z');
  });

  it('null без дат', () => {
    expect(latestDocDate([])).toBeNull();
  });
});

describe('isRepeatPicking', () => {
  it('відлуння статусу 3 і зсув TZ (до 6 год): не повторна', () => {
    expect(isRepeatPicking('2026-10-02T06:35:34Z', '2026-10-02T06:35:32Z')).toBe(false);
    expect(isRepeatPicking('2026-10-02T06:35:32Z', '2026-10-02T05:35:32Z')).toBe(false);
  });

  it('комплектація через місяць після першої: повторна (24453)', () => {
    expect(isRepeatPicking('2026-11-05T13:42:29Z', '2026-10-02T06:35:32Z')).toBe(true);
  });

  it('без дат: false', () => {
    expect(isRepeatPicking(null, '2026-10-02T06:35:32Z')).toBe(false);
  });
});

describe('isLastShipmentReturned', () => {
  it('немає повернень: можна повертати', () => {
    expect(isLastShipmentReturned({ saleDocsCount: 1, saleExportDate: '2026-10-02T05:35:32Z' })).toBe(false);
  });

  it('одне відвантаження, одне повернення: недоступно', () => {
    expect(isLastShipmentReturned({
      saleDocsCount: 1, saleExportDate: '2026-10-02T05:35:32Z',
      returnDocsCount: 1, returnDate: '2026-10-13T07:52:17Z',
    })).toBe(true);
  });

  it('повторне відвантаження після повернення (24453): знову можна', () => {
    expect(isLastShipmentReturned({
      saleDocsCount: 2, saleExportDate: '2026-11-05T13:42:29Z',
      returnDocsCount: 1, returnDate: '2026-10-13T07:52:17Z',
    })).toBe(false);
  });

  it('без лічильників: за датами', () => {
    expect(isLastShipmentReturned({ saleExportDate: '2026-10-02T00:00:00Z', returnDate: '2026-10-13T00:00:00Z' })).toBe(true);
    expect(isLastShipmentReturned({ saleExportDate: '2026-11-05T00:00:00Z', returnDate: '2026-10-13T00:00:00Z' })).toBe(false);
  });
});

describe('isShippedWithoutPicking', () => {
  it('без відвантаження – ні', () => {
    expect(isShippedWithoutPicking(null, null)).toBe(false);
  });

  it('2 → 4 без комплектації – так', () => {
    expect(isShippedWithoutPicking('2026-09-24T05:39:20Z', null)).toBe(true);
  });

  it('до 13.08.2026 історії комплектацій немає – не перевіряємо', () => {
    expect(isShippedWithoutPicking('2026-08-12T08:06:54Z', null)).toBe(false);
  });

  it('відвантаження раніше за комплектацію (26191) – так', () => {
    expect(isShippedWithoutPicking('2026-11-04T14:36:16Z', '2026-11-06T06:53:11Z')).toBe(true);
  });

  it('звичайне: одразу після комплектації або годинний зсув TZ (24453) – ні', () => {
    expect(isShippedWithoutPicking('2026-11-05T07:38:49Z', '2026-11-05T07:38:48Z')).toBe(false);
    expect(isShippedWithoutPicking('2026-10-02T05:35:32.000Z', '2026-10-02T06:35:32.433Z')).toBe(false);
  });

  it('на 4,5 год раніше (23190) – так', () => {
    expect(isShippedWithoutPicking('2026-09-10T06:58:33Z', '2026-09-10T11:36:51Z')).toBe(true);
  });
});
