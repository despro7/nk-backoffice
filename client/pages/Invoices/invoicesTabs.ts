export const INVOICES_TAB_KEYS = ['dashboard', 'archive', 'new'] as const;

export type InvoicesTabKey = (typeof INVOICES_TAB_KEYS)[number];

export const INVOICES_TAB_LABELS: Record<InvoicesTabKey, string> = {
  dashboard: 'Дашборд',
  archive: 'Архів рахунків',
  new: 'Новий рахунок',
};

/** URL: `/invoices#tab=archive` (default tab `dashboard` stays without hash). */
export function parseInvoicesTabKey(raw: string | null): InvoicesTabKey {
  return raw && INVOICES_TAB_KEYS.includes(raw as InvoicesTabKey) ? (raw as InvoicesTabKey) : 'dashboard';
}
