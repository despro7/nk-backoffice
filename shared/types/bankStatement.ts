/**
 * Shared типи для імпорту банківських виписок (NovaPay → cashOut / cashIn)
 */

export type BankStatementDirection = 'expense' | 'income';

/** Один розпарсений рядок виписки */
export interface BankStatementRow {
  /** Порядковий номер рядка після фільтрації (для UI) */
  rowIndex: number;
  /** Номер операції (колонка A) */
  operationNumber: string;
  /** Дата операції ISO (колонка B) */
  operationDate: string;
  /** IBAN кореспондента (колонка C) */
  correspondentIban: string;
  /** Найменування кореспондента (колонка D) */
  correspondentName: string;
  /** ЄДРПОУ (колонка E) */
  edrpou: string;
  /** Призначення платежу (колонка G) */
  purpose: string;
  /** Сума дебету / витрат (колонка U) */
  debitAmount: number;
  /** Сума кредиту / надходжень (колонка W) */
  creditAmount: number;
  /** Робоча сума для payload */
  amount: number;
  /** Напрямок операції */
  direction: BankStatementDirection;
  /** auto — з колонок U/W; manual — користувач перемкнув у preview */
  directionSource: 'auto' | 'manual';
  /** Кор. рахунок Dilovod (catalogs.accounts), id */
  corAccount: string;
  /** Вид розрахунків Dilovod (catalogs.settlementsKinds), id */
  settlementsKind: string;
  /** Стаття руху Dilovod (catalogs.cashItems), id */
  cashItem: string;
}

export interface BankStatementPreviewResponse {
  rows: BankStatementRow[];
  totalRows: number;
  expenseCount: number;
  incomeCount: number;
  /** IBAN власника рахунку з шапки файлу */
  fileCashAccount?: string;
  mapping: BankStatementParseMapping;
  excelRowCount: number;
  skippedCount: number;
  rawSample?: BankStatementRawSampleRow[];
}

export interface BankStatementColumnMap {
  operationNumber: string;
  date: string;
  correspondentIban: string;
  correspondentName: string;
  edrpou: string;
  purpose: string;
  debit: string;
  credit: string;
}

/** Мапінг Excel: dataStartRow — 1-based номер рядка Excel */
export interface BankStatementParseMapping {
  dataStartRow: number;
  headerRows: number;
  sheetIndex?: number;
  columns: BankStatementColumnMap;
}

export interface BankStatementTemplate {
  id: string;
  name: string;
  builtIn?: boolean;
  mapping: BankStatementParseMapping;
}

export type BankStatementInlineColumn =
  | 'operationNumber'
  | 'date'
  | 'correspondentName'
  | 'purpose'
  | 'amount'
  | 'corAccount'
  | 'settlementsKind'
  | 'cashItem'
  | 'iban';

export const BANK_STATEMENT_INLINE_COLUMNS: Array<{
  key: BankStatementInlineColumn;
  label: string;
}> = [
  { key: 'operationNumber', label: '№' },
  { key: 'date', label: 'Дата' },
  { key: 'correspondentName', label: 'Кореспондент' },
  { key: 'purpose', label: 'Призначення' },
  { key: 'amount', label: 'Сума' },
  { key: 'corAccount', label: 'Кор. рахунок' },
  { key: 'settlementsKind', label: 'Вид розрахунків' },
  { key: 'cashItem', label: 'Стаття руху' },
  { key: 'iban', label: 'IBAN' },
];

export interface BankStatementTemplatesState {
  activeId: string;
  templates: BankStatementTemplate[];
  /** Ключові слова призначення → id виду розрахунків Dilovod */
  kindKeywords?: Record<string, string[]>;
  /** Колонки з inline-редагуванням у preview */
  inlineEditColumns?: BankStatementInlineColumn[];
}

export interface BankStatementRawSampleRow {
  excelRow: number;
  cells: Array<{ col: string; value: string }>;
}

export const DEFAULT_BANK_STATEMENT_MAPPING: BankStatementParseMapping = {
  dataStartRow: 17,
  headerRows: 16,
  sheetIndex: 0,
  columns: {
    operationNumber: 'A',
    date: 'B',
    correspondentIban: 'C',
    correspondentName: 'D',
    edrpou: 'E',
    purpose: 'G',
    debit: 'U',
    credit: 'W',
  },
};

export const DEFAULT_BANK_STATEMENT_TEMPLATE: BankStatementTemplate = {
  id: 'novapay',
  name: 'NovaPay',
  builtIn: true,
  mapping: DEFAULT_BANK_STATEMENT_MAPPING,
};

export interface BankStatementConfirmedRow {
  rowIndex: number;
  operationNumber: string;
  operationDate: string;
  correspondentName: string;
  purpose: string;
  amount: number;
  direction: BankStatementDirection;
  corAccount: string;
  settlementsKind: string;
  cashItem: string;
}

/** Дефолти payload з прикладу Dilovod (cashOut / cashIn виписки). */
export const BANK_STATEMENT_DEFAULTS = {
  /** catalogs.accounts — «Поточні рахунки в національній валюті» (header.account) */
  account: '1119000000001089',
  corAccount: '1119000000001089',
  settlementsKindExpense: '1103300000001009', // Зняття готівки
  settlementsKindIncome: '1103300000000001',
  /** catalogs.cashItems — витрати (як у попередніх cashOut) */
  cashItemExpense: '1104300000001016',
  /** catalogs.cashItems — надходження (як у Cash-In / післяплата) */
  cashItemIncome: '1104300000001022',
} as const;

export function defaultSettlementsKind(direction: BankStatementDirection): string {
  return direction === 'expense'
    ? BANK_STATEMENT_DEFAULTS.settlementsKindExpense
    : BANK_STATEMENT_DEFAULTS.settlementsKindIncome;
}

export function defaultCashItem(direction: BankStatementDirection): string {
  return direction === 'expense'
    ? BANK_STATEMENT_DEFAULTS.cashItemExpense
    : BANK_STATEMENT_DEFAULTS.cashItemIncome;
}

export function toBankStatementConfirmed(row: BankStatementRow): BankStatementConfirmedRow {
  return {
    rowIndex: row.rowIndex,
    operationNumber: row.operationNumber,
    operationDate: row.operationDate,
    correspondentName: row.correspondentName,
    purpose: row.purpose,
    amount: row.amount,
    direction: row.direction,
    corAccount: row.corAccount,
    settlementsKind: row.settlementsKind,
    cashItem: row.cashItem,
  };
}

export interface BankStatementExportRequest {
  rows: BankStatementConfirmedRow[];
  fileCashAccount?: string;
}

export interface BankStatementExportResponse {
  success: boolean;
  exportedCount: number;
  cashOutCount: number;
  cashInCount: number;
  errors: Array<{ rowIndex: number; operationNumber: string; error: string }>;
}
