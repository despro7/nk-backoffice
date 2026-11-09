/**
 * Production (techcards, batches).
 *
 * GET /settings – any signed-in user (BOM editor needs loss type names and the formula)
 * PUT /settings – page.settings.production (admin has it implicitly)
 * GET /techcards, /techcards/:goodId, /techcards/:goodId/versions – page.production.techcards
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { sendInsufficientRole } from '../middleware/requirePermission.js';
import { roleService } from '../services/RoleService.js';
import { pageKey } from '../../shared/constants/permissions.js';
import {
  ProductionSettingsError,
  productionSettingsService as service,
} from '../modules/Production/ProductionSettingsService.js';
import { TechCardError, techCardService } from '../modules/Production/TechCardService.js';

const router = Router();
const SETTINGS_PAGE_KEY = pageKey('settings', 'production');
const TECHCARDS_PAGE_KEY = pageKey('production', 'techcards');

router.use(authenticateToken);

function sendError(res: Response, err: unknown) {
  if (err instanceof ProductionSettingsError || err instanceof TechCardError) {
    return res.status(err.status).json({ success: false, error: err.message });
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

export default router;
