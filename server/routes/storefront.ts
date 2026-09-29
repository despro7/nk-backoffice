import { Router, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import { storefrontService } from '../modules/Storefront/StorefrontService.js';
import { storefrontDescriptionBuilder } from '../modules/Storefront/StorefrontDescriptionBuilder.js';
import { wooCommerceSyncService } from '../modules/Storefront/WooCommerceSyncService.js';
import { wooCommerceMediaService } from '../modules/Storefront/WooCommerceMediaService.js';
import { wooCommerceStockService } from '../modules/Storefront/WooCommerceStockService.js';
import type {
  StorefrontPresetInput,
  StorefrontKitComponentSettings,
  StorefrontMetaKeyConfig,
  StorefrontSyncSettingsDto,
  StorefrontWooSettingsInput,
  WooPullApplyInput,
  WooPullBulkApplyItem,
} from '../../shared/types/storefront.js';

const router = Router();
const authOnly = [authenticateToken] as const;
const storefrontRead = requirePermission('storefront', 'read', 'Читання шаблонів сайту');
const storefrontManage = requirePermission('storefront', 'manage', 'Керування налаштуваннями сайту (CRUD)');
const storefrontPull = requirePermission('storefront', 'pull', 'Pull опису з WooCommerce');
const storefrontPush = requirePermission('storefront', 'push', 'Push опису на WooCommerce');

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
      kitComponentSettings?: StorefrontKitComponentSettings;
      wooCommerce?: StorefrontWooSettingsInput;
      sync?: Partial<StorefrontSyncSettingsDto>;
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

router.post('/woo/test-connection', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const body = req.body as {
      siteUrl?: string;
      consumerKey?: string;
      consumerSecret?: string;
    };
    const data = await storefrontService.testWooConnection({
      siteUrl: body.siteUrl,
      consumerKey: body.consumerKey,
      consumerSecret: body.consumerSecret,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooTestConnection');
  }
});

router.post('/woo/inspect', ...authOnly, storefrontPull, async (req, res) => {
  try {
    const sku = String(req.body?.sku || '').trim();
    if (!sku) {
      return res.status(400).json({ success: false, error: 'sku обовʼязковий' });
    }
    const data = await wooCommerceSyncService.inspectProduct(sku);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooInspect');
  }
});

router.post('/woo/pull-preview', ...authOnly, storefrontPull, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pullPreview(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPullPreview');
  }
});

router.post('/woo/pull-apply', ...authOnly, storefrontPull, async (req, res) => {
  try {
    const input = req.body as WooPullApplyInput;
    if (!input?.goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pullApply(input);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPullApply');
  }
});

router.post('/woo/push-preview', ...authOnly, storefrontPush, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pushPreview(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPushPreview');
  }
});

router.post('/woo/push-apply', ...authOnly, storefrontPush, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pushApply(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPushApply');
  }
});

router.post('/woo/pull-bulk-preview', ...authOnly, storefrontPull, async (req, res) => {
  try {
    const goodIds = Array.isArray(req.body?.goodIds)
      ? req.body.goodIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    if (goodIds.length === 0) {
      return res.status(400).json({ success: false, error: 'goodIds обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pullBulkPreview(goodIds);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPullBulkPreview');
  }
});

router.post('/woo/pull-bulk-apply', ...authOnly, storefrontPull, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? (req.body.items as WooPullBulkApplyItem[]) : [];
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'items обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pullBulkApply(items);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPullBulkApply');
  }
});

router.post('/woo/stock/sync', ...authOnly, storefrontPush, async (req, res) => {
  try {
    const skus = Array.isArray(req.body?.skus)
      ? req.body.skus.map((sku: unknown) => String(sku).trim()).filter(Boolean)
      : undefined;
    const data = await wooCommerceStockService.syncStock({ skus });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooStockSync');
  }
});

router.post('/woo/push-bulk', ...authOnly, storefrontPush, async (req, res) => {
  try {
    const goodIds = Array.isArray(req.body?.goodIds)
      ? req.body.goodIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
    if (goodIds.length === 0) {
      return res.status(400).json({ success: false, error: 'goodIds обовʼязковий' });
    }
    const data = await wooCommerceSyncService.pushBulk(goodIds);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooPushBulk');
  }
});

router.post('/woo/media/upload', ...authOnly, storefrontPush, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '').trim();
    if (!goodId) {
      return res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
    }
    const data = await wooCommerceMediaService.uploadProductImages(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooMediaUpload');
  }
});

router.get('/woo/media/orphans', ...authOnly, storefrontManage, async (_req, res) => {
  try {
    const data = await wooCommerceMediaService.auditOrphans();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooMediaOrphans');
  }
});

router.post('/woo/media/orphans/delete', ...authOnly, storefrontManage, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.wooMediaIds)
      ? req.body.wooMediaIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'wooMediaIds обовʼязковий' });
    }
    const data = await wooCommerceMediaService.deleteOrphans(ids);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'wooMediaOrphansDelete');
  }
});

export default router;
