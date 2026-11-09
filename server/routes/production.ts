/**
 * Production (techcards, batches).
 *
 * GET /settings – any signed-in user (BOM editor needs loss type names and the formula)
 * PUT /settings – page.settings.production (admin has it implicitly)
 * GET /techcards, /techcards/:goodId, /techcards/:goodId/versions – page.production.techcards
 * PUT|DELETE /techcards/:goodId/draft, POST /techcards/:goodId/submit – + action.products.editSpec
 * POST /techcards/:goodId/approve|reject – + action.products.approveSpec (pair with the spec draft)
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { sendInsufficientRole } from '../middleware/requirePermission.js';
import { roleService } from '../services/RoleService.js';
import { PERMISSIONS, pageKey } from '../../shared/constants/permissions.js';
import {
  ProductionSettingsError,
  productionSettingsService as service,
} from '../modules/Production/ProductionSettingsService.js';
import { CatalogSpecError } from '../modules/Products/CatalogSpecService.js';
import { TechCardError, techCardService } from '../modules/Production/TechCardService.js';

const router = Router();
const SETTINGS_PAGE_KEY = pageKey('settings', 'production');
const TECHCARDS_PAGE_KEY = pageKey('production', 'techcards');

router.use(authenticateToken);

function sendError(res: Response, err: unknown) {
  if (err instanceof ProductionSettingsError || err instanceof TechCardError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  if (err instanceof CatalogSpecError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
  }
  console.error('❌ [Production]', err);
  return res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
}

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await service.getSettings() });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  if (!(await roleService.hasPermission(req.user!.role, SETTINGS_PAGE_KEY))) {
    return sendInsufficientRole(res, 'Немає доступу до налаштувань виробництва', { permissionKey: SETTINGS_PAGE_KEY });
  }
  try {
    res.json({ success: true, data: await service.saveSettings(req.body) });
  } catch (err) {
    sendError(res, err);
  }
});

async function canViewTechCards(req: Request, res: Response): Promise<boolean> {
  if (await roleService.hasPermission(req.user!.role, TECHCARDS_PAGE_KEY)) return true;
  sendInsufficientRole(res, 'Немає доступу до техкарт', { permissionKey: TECHCARDS_PAGE_KEY });
  return false;
}

router.get('/techcards', async (req: Request, res: Response) => {
  if (!(await canViewTechCards(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.list() });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/techcards/:goodId', async (req: Request, res: Response) => {
  if (!(await canViewTechCards(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.getDetail(req.params.goodId) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/techcards/:goodId/versions', async (req: Request, res: Response) => {
  if (!(await canViewTechCards(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.listVersions(req.params.goodId) });
  } catch (err) {
    sendError(res, err);
  }
});

async function canUse(req: Request, res: Response, key: string, message: string): Promise<boolean> {
  if (!(await canViewTechCards(req, res))) return false;
  if (await roleService.hasPermission(req.user!.role, key)) return true;
  sendInsufficientRole(res, message, { permissionKey: key });
  return false;
}

const canEdit = (req: Request, res: Response) =>
  canUse(req, res, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC, 'Немає права редагувати техкарту');
const canApprove = (req: Request, res: Response) =>
  canUse(req, res, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC, 'Немає права затверджувати техкарту');

function userId(req: Request): number | null {
  const id = Number(req.user?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.put('/techcards/:goodId/draft', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.saveDraft(req.params.goodId, req.body?.payload, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/techcards/:goodId/draft', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.discardDraft(req.params.goodId, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/submit', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    res.json({ success: true, data: await techCardService.submit(req.params.goodId, comment, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/approve', async (req: Request, res: Response) => {
  if (!(await canApprove(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.approve(req.params.goodId, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/reject', async (req: Request, res: Response) => {
  if (!(await canApprove(req, res))) return;
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    res.json({ success: true, data: await techCardService.reject(req.params.goodId, reason, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
