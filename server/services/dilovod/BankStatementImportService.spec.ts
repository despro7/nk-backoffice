import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  BankStatementImportService,
  classifyBankStatementDirection,
  parseBankStatementNumber,
} from './BankStatementImportService';

describe('parseBankStatementNumber', () => {
  it('парсить пробіл як тисячі та кому як десятковий роздільник', () => {
    expect(parseBankStatementNumber('1 234,56')).toBeCloseTo(1234.56);
  });

  it('повертає number як є', () => {
    expect(parseBankStatementNumber(99.1)).toBe(99.1);
  });

  it('порожнє значення → 0', () => {
    expect(parseBankStatementNumber(null)).toBe(0);
    expect(parseBankStatementNumber('')).toBe(0);
  });
});

describe('classifyBankStatementDirection', () => {
  it('U (дебет) → Витрати', () => {
    expect(classifyBankStatementDirection(100, 0)).toEqual({
      direction: 'expense',
      amount: 100,
    });
  });

  it('W (кредит) → Надходження', () => {
    expect(classifyBankStatementDirection(0, 50)).toEqual({
      direction: 'income',
      amount: 50,
    });
  });

  it('обидві заповнені → Витрати з сумою дебету', () => {
    expect(classifyBankStatementDirection(10, 20)).toEqual({
      direction: 'expense',
      amount: 10,
    });
  });

  it('обидві порожні → Витрати з нульовою сумою', () => {
    expect(classifyBankStatementDirection(0, 0)).toEqual({
      direction: 'expense',
      amount: 0,
    });
  });
});

function buildWorkbookBuffer(opts: {
  headerIban?: string;
  rows: Array<{
    op: string;
    date: string;
    name: string;
    purpose: string;
    debit?: string | number | null;
    credit?: string | number | null;
  }>;
}): Buffer {
  const aoa: unknown[][] = [];
  for (let i = 0; i < 16; i++) {
    aoa.push(i === 2 ? ['Рахунок', opts.headerIban ?? ''] : ['']);
  }
  for (const row of opts.rows) {
    const excelRow: unknown[] = new Array(23).fill(null);
    excelRow[0] = row.op;
    excelRow[1] = row.date;
    excelRow[3] = row.name;
    excelRow[6] = row.purpose;
    excelRow[20] = row.debit ?? null;
    excelRow[22] = row.credit ?? null;
    aoa.push(excelRow);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Виписка');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('BankStatementImportService.parseAndValidate', () => {
  const service = new BankStatementImportService();

  it('читає з 17-го рядка, IBAN шапки, U/W та пропускає рядок без суми', async () => {
    const buffer = buildWorkbookBuffer({
      headerIban: 'UA123456789012345678901234567',
      rows: [
        {
          op: '1001',
          date: '01.08.2026',
          name: 'ТОВ Витрата',
          purpose: 'Оплата послуг',
          debit: '1 000,50',
        },
        {
          op: '1002',
          date: '02.08.2026',
          name: 'ТОВ Надходження',
          purpose: 'Оплата від клієнта',
          credit: 250,
        },
        {
          op: '',
          date: '03.08.2026',
          name: 'Разом',
          purpose: '',
        },
      ],
    });

    const result = await service.parseAndValidate(buffer);

    expect(result.fileCashAccount).toBe('UA123456789012345678901234567');
    expect(result.totalRows).toBe(2);
    expect(result.expenseCount).toBe(1);
    expect(result.incomeCount).toBe(1);
    expect(result.rows[0].direction).toBe('expense');
    expect(result.rows[0].amount).toBeCloseTo(1000.5);
    expect(result.rows[0].correspondentName).toBe('ТОВ Витрата');
    expect(result.rows[0].corAccount).toBe('1119000000001089');
    expect(result.rows[0].settlementsKind).toBe('1103300000001009');
    expect(result.rows[0].cashItem).toBe('1104300000001016');
    expect(result.rows[1].direction).toBe('income');
    expect(result.rows[1].settlementsKind).toBe('1103300000000001');
    expect(result.rows[1].cashItem).toBe('1104300000001022');
    expect(result.rows[1].amount).toBe(250);
  });

  it('не вимагає номера операції, якщо є сума', async () => {
    const buffer = buildWorkbookBuffer({
      rows: [{
        op: '',
        date: '01.08.2026',
        name: 'ТОВ',
        purpose: 'Оплата',
        debit: 10,
      }],
    });
    const result = await service.parseAndValidate(buffer);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0].amount).toBe(10);
  });

  it('застосовує кастомний мапінг колонок і рядка старту', async () => {
    const aoa: unknown[][] = [
      ['hdr'],
      ['hdr'],
      [null, null, '100', '5 000,00', null, 'Надходження тестове'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'S');
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const result = await service.parseAndValidate(buffer, {
      dataStartRow: 3,
      headerRows: 2,
      columns: {
        operationNumber: 'C',
        date: 'A',
        correspondentIban: 'A',
        correspondentName: 'A',
        edrpou: 'A',
        purpose: 'F',
        debit: 'A',
        credit: 'D',
      },
    });

    expect(result.totalRows).toBe(1);
    expect(result.rows[0].direction).toBe('income');
    expect(result.rows[0].amount).toBe(5000);
    expect(result.rows[0].purpose).toBe('Надходження тестове');
    expect(result.mapping.columns.credit).toBe('D');
  });
});
