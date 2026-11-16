import type {
  DashboardData,
  DashboardMode,
  InvoiceCreateInput,
  InvoicePayer,
  InvoicePreview,
  InvoiceRecord,
  InvoiceSettings,
  TrackingPeriod,
} from '@shared/types/invoices';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }
  return data.data as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((res) => parseJson<T>(res));
}

export const invoicesApi = {
  getSettings: () => send<InvoiceSettings>('/api/invoices/settings', 'GET'),
  saveSettings: (settings: Partial<InvoiceSettings>) => send<InvoiceSettings>('/api/invoices/settings', 'PUT', settings),

  getSignature: () => send<{ dataUrl: string | null }>('/api/invoices/signature', 'GET'),
  saveSignature: (dataUrl: string | null) => send<{ dataUrl: string | null }>('/api/invoices/signature', 'PUT', { dataUrl }),

  listPayers: () => send<InvoicePayer[]>('/api/invoices/payers', 'GET'),
  savePayer: (payer: { id?: number; name: string; taxId: string; address: string }) =>
    send<InvoicePayer>('/api/invoices/payers', 'POST', payer),
  deletePayer: (id: number) => send<void>(`/api/invoices/payers/${id}`, 'DELETE'),

  preview: (params: { periodStart?: string; periodEnd?: string; tariff?: number }) => {
    const qs = new URLSearchParams();
    if (params.periodStart) qs.set('periodStart', params.periodStart);
    if (params.periodEnd) qs.set('periodEnd', params.periodEnd);
    if (params.tariff) qs.set('tariff', String(params.tariff));
    return send<InvoicePreview>(`/api/invoices/preview?${qs.toString()}`, 'GET');
  },

  listInvoices: () => send<InvoiceRecord[]>('/api/invoices/archive', 'GET'),
  createInvoice: (input: InvoiceCreateInput) => send<InvoiceRecord>('/api/invoices/archive', 'POST', input),
  deleteInvoice: (id: number) => send<void>(`/api/invoices/archive/${id}`, 'DELETE'),

  getDashboard: (mode: DashboardMode) => send<DashboardData>(`/api/invoices/dashboard?mode=${mode}`, 'GET'),
  updatePeriod: (
    id: number,
    patch: {
      factMinutes?: number | null;
      tariff?: number | null;
      usdRate?: number | null;
      adjustmentUah?: number;
      adjustmentNote?: string;
    },
  ) => send<TrackingPeriod>(`/api/invoices/periods/${id}`, 'PUT', patch),
  refreshRate: (id: number) => send<TrackingPeriod>(`/api/invoices/periods/${id}/refresh-rate`, 'POST'),
};
