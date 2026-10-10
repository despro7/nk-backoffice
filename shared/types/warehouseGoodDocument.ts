export const WAREHOUSE_WRITE_OFF_DOC_TYPE = 'documents.goodWriteOff';
export const WAREHOUSE_WRITE_OFF_DOC_MODE = '1004000000000304';

/** Глибина повного sync списку документів з Dilovod (днів назад від сьогодні). */
export const WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS = 7;

/** @deprecated використовуйте WAREHOUSE_GOOD_DOC_HISTORY_SYNC_DAYS */
export const WAREHOUSE_WRITE_OFF_HISTORY_SYNC_MONTHS = 3;

/** settings_base: дата (YYYY-MM-DD) останнього повного списку документів з Dilovod */
export const WAREHOUSE_WRITE_OFF_HISTORY_LAST_FULL_SYNC_KEY = 'warehouse.writeoff.history.lastFullListSyncDate';
export const WAREHOUSE_SURPLUS_HISTORY_LAST_FULL_SYNC_KEY = 'warehouse.surplus.history.lastFullListSyncDate';

export function formatDilovodHistoryFromDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.toISOString().split('T')[0]} 00:00:00`;
}

export function formatDilovodHistoryFromDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.toISOString().split('T')[0]} 00:00:00`;
}

export const WAREHOUSE_SURPLUS_DOC_TYPE = 'documents.goodWriteOn';
/** Стаття доходів для documents.goodWriteOn (у цього типу немає header.docMode). */
export const WAREHOUSE_SURPLUS_INCOME_ITEM = '1106500000000001';
/** Рахунок доходів для documents.goodWriteOn */
export const WAREHOUSE_SURPLUS_ACC_INCOMES = '1119000000001268';

export type WarehouseGoodDocSource = 'local' | 'dilovod';
export type WarehouseGoodDocStatus = 'created' | 'deleted';

export type GoodDocHistoryKind = 'writeOff' | 'surplus';
