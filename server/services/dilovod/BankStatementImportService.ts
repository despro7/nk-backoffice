/**
 * BankStatementImportService — парсинг Excel банківської виписки.
 * Мапінг колонок/рядків можна передати (шаблон); інакше NovaPay за замовчуванням.
 */

import * as XLSX from 'xlsx';
import type {
  BankStatementDirection,
  BankStatementParseMapping,
  BankStatementPreviewResponse,
  BankStatementRawSampleRow,
  BankStatementRow,
} from '../../../shared/types/bankStatement.js';
import {
  BANK_STATEMENT_DEFAULTS,
  DEFAULT_BANK_STATEMENT_MAPPING,
  defaultCashItem,
  defaultSettlementsKind,
} from '../../../shared/types/bankStatement.js';
import { excelColToIndex, excelIndexToCol, normalizeExcelCol } from '../../../shared/utils/excelCol.js';
import { logServer } from '../../lib/utils.js';

const OWNER_IBAN_RE = /UA\d{27}/i;
const RAW_SAMPLE_ROWS = 3;
const RAW_SAMPLE_COLS = 30;

export function parseBankStatementNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function classifyBankStatementDirection(
  debitAmount: number,
  creditAmount: number,
): { direction: BankStatementDirection; amount: number } {
  const hasDebit = debitAmount > 0;
  const hasCredit = creditAmount > 0;

  if (hasCredit && !hasDebit) {
    return { direction: 'income', amount: creditAmount };
  }

  return {
    direction: 'expense',
    amount: hasDebit ? debitAmount : creditAmount,
  };
}

export function normalizeParseMapping(input?: Partial<BankStatementParseMapping> | null): BankStatementParseMapping {
  const base = DEFAULT_BANK_STATEMENT_MAPPING;
  const columns = { ...base.columns, ...input?.columns };
  const dataStartRow = Number(input?.dataStartRow);
  const headerRows = Number(input?.headerRows);
  const sheetIndex = Number(input?.sheetIndex);

  return {
    dataStartRow: Number.isFinite(dataStartRow) && dataStartRow >= 1 ? Math.floor(dataStartRow) : base.dataStartRow,
    headerRows: Number.isFinite(headerRows) && headerRows >= 0 ? Math.floor(headerRows) : base.headerRows,
    sheetIndex: Number.isFinite(sheetIndex) && sheetIndex >= 0 ? Math.floor(sheetIndex) : 0,
    columns: {
      operationNumber: normalizeExcelCol(columns.operationNumber) || base.columns.operationNumber,
      date: normalizeExcelCol(columns.date) || base.columns.date,
      correspondentIban: normalizeExcelCol(columns.correspondentIban) || base.columns.correspondentIban,
      correspondentName: normalizeExcelCol(columns.correspondentName) || base.columns.correspondentName,
      edrpou: normalizeExcelCol(columns.edrpou) || base.columns.edrpou,
      purpose: normalizeExcelCol(columns.purpose) || base.columns.purpose,
      debit: normalizeExcelCol(columns.debit) || base.columns.debit,
      credit: normalizeExcelCol(columns.credit) || base.columns.credit,
    },
  };
}

function cellAt(row: unknown[] | undefined, colLetter: string): unknown {
  const idx = excelColToIndex(colLetter);
  if (idx < 0 || !row) return null;
  return row[idx];
}

export class BankStatementImportService {
  async parseAndValidate(
    fileBuffer: Buffer,
    mappingInput?: Partial<BankStatementParseMapping> | null,
  ): Promise<BankStatementPreviewResponse> {
    const mapping = normalizeParseMapping(mappingInput);
    logServer(
      `📂 [BankStatement] Парсинг Excel (рядок ${mapping.dataStartRow}, дебет ${mapping.columns.debit}, кредит ${mapping.columns.credit})...`,
    );

    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[mapping.sheetIndex ?? 0] ?? workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      rawNumbers: true,
    });

    logServer(`📊 [BankStatement] Всього рядків у файлі: ${allRows.length}`);

    const fileCashAccount = this.extractOwnerIban(allRows.slice(0, mapping.headerRows));
    if (fileCashAccount) {
      logServer(`📂 [BankStatement] IBAN з шапки: ${fileCashAccount}`);
    }

    const dataStartIndex = mapping.dataStartRow - 1;
    const dataRows = allRows.slice(dataStartIndex);
    const rows: BankStatementRow[] = [];
    let seqIndex = 1;
    let skippedCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const excelRow = dataRows[i];
      if (!excelRow) {
        skippedCount++;
        continue;
      }

      const operationNumber = this.parseString(cellAt(excelRow, mapping.columns.operationNumber));
      const debitAmount = parseBankStatementNumber(cellAt(excelRow, mapping.columns.debit));
      const creditAmount = parseBankStatementNumber(cellAt(excelRow, mapping.columns.credit));
      const classified = classifyBankStatementDirection(debitAmount, creditAmount);

      if (classified.amount <= 0) {
        skippedCount++;
        continue;
      }

      const { direction, amount } = classified;
      rows.push({
        rowIndex: seqIndex,
        operationNumber: operationNumber || String(mapping.dataStartRow + i),
        operationDate: this.parseDate(cellAt(excelRow, mapping.columns.date)),
        correspondentIban: this.parseString(cellAt(excelRow, mapping.columns.correspondentIban)),
        correspondentName: this.parseString(cellAt(excelRow, mapping.columns.correspondentName)),
        edrpou: this.parseString(cellAt(excelRow, mapping.columns.edrpou)),
        purpose: this.parseString(cellAt(excelRow, mapping.columns.purpose)),
        debitAmount,
        creditAmount,
        amount,
        direction,
        directionSource: 'auto',
        corAccount: BANK_STATEMENT_DEFAULTS.corAccount,
        settlementsKind: defaultSettlementsKind(direction),
        cashItem: defaultCashItem(direction),
      });
      seqIndex++;
    }

    const expenseCount = rows.filter((r) => r.direction === 'expense').length;
    const incomeCount = rows.filter((r) => r.direction === 'income').length;
    const rawSample = this.buildRawSample(allRows, dataStartIndex);

    logServer(`✅ [BankStatement] Результат: витрат=${expenseCount}, надходжень=${incomeCount}, пропущено=${skippedCount}`);

    return {
      rows,
      totalRows: rows.length,
      expenseCount,
      incomeCount,
      fileCashAccount: fileCashAccount || undefined,
      mapping,
      excelRowCount: allRows.length,
      skippedCount,
      rawSample,
    };
  }

  private buildRawSample(allRows: unknown[][], dataStartIndex: number): BankStatementRawSampleRow[] {
    const sample: BankStatementRawSampleRow[] = [];
    for (let i = 0; i < RAW_SAMPLE_ROWS; i++) {
      const excelRow = allRows[dataStartIndex + i];
      if (!excelRow) continue;
      const cells: BankStatementRawSampleRow['cells'] = [];
      const maxCol = Math.max(excelRow.length, RAW_SAMPLE_COLS);
      for (let c = 0; c < Math.min(maxCol, RAW_SAMPLE_COLS); c++) {
        const value = this.parseString(excelRow[c]);
        if (value === '') continue;
        cells.push({ col: excelIndexToCol(c), value: value.slice(0, 80) });
      }
      sample.push({ excelRow: dataStartIndex + i + 1, cells });
    }
    return sample;
  }

  private extractOwnerIban(headerRows: unknown[][]): string {
    for (const row of headerRows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (cell == null) continue;
        const compact = String(cell).replace(/\s+/g, '');
        const match = compact.match(OWNER_IBAN_RE);
        if (match) return match[0].toUpperCase();
      }
    }
    return '';
  }

  private parseDate(value: unknown): string {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
    }
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (match) {
        const [, day, month, year] = match;
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
      }
    }
    const d = new Date(value as string | number);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  private parseString(value: unknown): string {
    return value !== null && value !== undefined ? String(value).trim() : '';
  }
}

export const bankStatementImportService = new BankStatementImportService();
