/**
 * Production (techcards, batches). Phase 1: loss types and loss formula.
 *
 * GET /settings – any signed-in user (BOM editor needs loss type names and the formula)
 * PUT /settings – page.settings.production (admin has it implicitly)
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

const router = Router();
const SETTINGS_PAGE_KEY = pageKey('settings', 'production');

router.use(authenticateToken);

function sendError(res: Response, err: unknown) {
  if (err instanceof ProductionSettingsError) {
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

export default router;
