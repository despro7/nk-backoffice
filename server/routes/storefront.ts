import { Router, type Response } from 'express';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import { authenticateToken, requirePermission, requirePermissionKey } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import { storefrontService } from '../modules/Storefront/StorefrontService.js';
import { storefrontDescriptionBuilder } from '../modules/Storefront/StorefrontDescriptionBuilder.js';
import type { StorefrontPresetInput, StorefrontMetaKeyConfig } from '../../shared/types/storefront.js';

const router = Router();
const authOnly = [authenticateToken] as const;
const storefrontRead = requirePermission('storefront', 'read', 'Читання шаблонів вітрини');
const storefrontManage = requirePermission('storefront', 'manage', 'Керування налаштуваннями вітрини (CRUD)');

function handleError(res: Response, error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[Storefront] ${context}: ${message}`, error);
  const status =
    message.includes('не знайдено') || message.includes('не знайден') ? 404 : 400;
  res.status(status).json({ success: false, error: message });
}

router.get('/presets', ...authOnly, storefrontRead, async (_req, res) => {
  try {
    const data = await storefrontService.listPresets();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'listPresets');
  }
});

router.post('/presets', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const input = req.body as StorefrontPresetInput;
    const data = await storefrontService.createPreset(input);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'createPreset');
  }
});

router.put('/presets/:id', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const data = await storefrontService.updatePreset(req.params.id, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'updatePreset');
  }
});

router.delete('/presets/:id', ...authOnly, storefrontManage, async (req, res) => {
  try {
    await storefrontService.deletePreset(req.params.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'deletePreset');
  }
});

router.get('/settings', ...authOnly, storefrontRead, async (_req, res) => {
  try {
    const data = await storefrontService.getSettings();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'getSettings');
  }
});

router.put('/settings', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const body = req.body as {
      defaultPresetId?: string | null;
      metaKeys?: StorefrontMetaKeyConfig[];
    };
    const data = await storefrontService.updateSettings(body);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'updateSettings');
  }
});

router.post('/preview', ...authOnly, storefrontRead, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await storefrontDescriptionBuilder.previewHtml(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'preview');
  }
});

router.post('/dry-run-push', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await storefrontDescriptionBuilder.dryRunPush(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'dryRunPush');
  }
});

export default router;
