/**
 * /api/invoices – admin only: invoice generation, archive, payers, tracking dashboard.
 * Access: role `admin` AND the `settings.admin` permission (like the LLM platform page).
 */

import { Router, type Request, type Response } from 'express';
import { ROLES, authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import {
  InvoicesError,
  createInvoice,
  deleteInvoice,
  deletePayer,
  getDashboard,
  getSettings,
  importHistory,
  listInvoices,
  listPayers,
  previewInvoice,
  refreshPeriodRate,
  saveSettings,
  updatePeriod,
  upsertPayer,
} from '../modules/Invoices/InvoicesService.js';
import { readInvoiceSignature, writeInvoiceSignature } from '../modules/Invoices/invoiceStores.js';
import type { DashboardMode, InvoiceCreateInput } from '../../shared/types/invoices.js';

const router = Router();
const adminGuard = requirePermission('settings', 'admin', 'Змінювати адмінські налаштування');

router.use(authenticateToken, requireRole([ROLES.ADMIN]), adminGuard);

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof InvoicesError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  logServer(`[Invoices] ${label} failed`, error);
  return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal error' });
}

const intParam = (req: Request): number => Number.parseInt(String(req.params.id), 10);

router.get('/settings', async (_req, res) => {
  try {
    res.json({ success: true, data: await getSettings() });
  } catch (e) {
    fail(res, e, 'GET settings');
  }
});

router.put('/settings', async (req, res) => {
  try {
    res.json({ success: true, data: await saveSettings(req.body ?? {}) });
  } catch (e) {
    fail(res, e, 'PUT settings');
  }
});

router.get('/signature', async (_req, res) => {
  try {
    res.json({ success: true, data: { dataUrl: await readInvoiceSignature() } });
  } catch (e) {
    fail(res, e, 'GET signature');
  }
});

router.put('/signature', async (req, res) => {
  try {
    const dataUrl = req.body?.dataUrl;
    if (dataUrl !== null && typeof dataUrl !== 'string') throw new InvoicesError('Невірний формат підпису');
    try {
      await writeInvoiceSignature(dataUrl);
    } catch (e) {
      throw new InvoicesError(e instanceof Error ? e.message : 'Невірний підпис');
    }
    res.json({ success: true, data: { dataUrl: await readInvoiceSignature() } });
  } catch (e) {
    fail(res, e, 'PUT signature');
  }
});

router.get('/payers', async (_req, res) => {
  try {
    res.json({ success: true, data: await listPayers() });
  } catch (e) {
    fail(res, e, 'GET payers');
  }
});

router.post('/payers', async (req, res) => {
  try {
    res.json({ success: true, data: await upsertPayer(req.body ?? {}) });
  } catch (e) {
    fail(res, e, 'POST payers');
  }
});

router.delete('/payers/:id', async (req, res) => {
  try {
    await deletePayer(intParam(req));
    res.json({ success: true });
  } catch (e) {
    fail(res, e, 'DELETE payer');
  }
});

router.get('/preview', async (req, res) => {
  try {
    const tariff = req.query.tariff != null ? Number(req.query.tariff) : undefined;
    res.json({
      success: true,
      data: await previewInvoice({
        periodStart: typeof req.query.periodStart === 'string' ? req.query.periodStart : undefined,
        periodEnd: typeof req.query.periodEnd === 'string' ? req.query.periodEnd : undefined,
        tariff: tariff != null && Number.isFinite(tariff) ? tariff : undefined,
      }),
    });
  } catch (e) {
    fail(res, e, 'GET preview');
  }
});

router.get('/archive', async (_req, res) => {
  try {
    res.json({ success: true, data: await listInvoices() });
  } catch (e) {
    fail(res, e, 'GET archive');
  }
});

router.post('/archive', async (req, res) => {
  try {
    res.json({ success: true, data: await createInvoice((req.body ?? {}) as InvoiceCreateInput) });
  } catch (e) {
    fail(res, e, 'POST archive');
  }
});

router.delete('/archive/:id', async (req, res) => {
  try {
    await deleteInvoice(intParam(req));
    res.json({ success: true });
  } catch (e) {
    fail(res, e, 'DELETE archive');
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const mode: DashboardMode = req.query.mode === 'live' ? 'live' : 'history';
    res.json({ success: true, data: await getDashboard(mode) });
  } catch (e) {
    fail(res, e, 'GET dashboard');
  }
});

router.put('/periods/:id', async (req, res) => {
  try {
    res.json({ success: true, data: await updatePeriod(intParam(req), req.body ?? {}) });
  } catch (e) {
    fail(res, e, 'PUT period');
  }
});

router.post('/periods/:id/refresh-rate', async (req, res) => {
  try {
    res.json({ success: true, data: await refreshPeriodRate(intParam(req)) });
  } catch (e) {
    fail(res, e, 'POST refresh-rate');
  }
});

router.post('/import-history', async (_req, res) => {
  try {
    res.json({ success: true, data: await importHistory() });
  } catch (e) {
    fail(res, e, 'POST import-history');
  }
});

export default router;
