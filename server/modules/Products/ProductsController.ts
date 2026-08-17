/**
 * Products 2.0 API — /api/catalog/*
 * minRole: WAREHOUSE_MANAGER
 */

import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Router, type Response } from 'express';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES, hasAccess } from '../../../shared/constants/roles.js';
import { logServer } from '../../lib/utils.js';
import { productsCatalogService } from './ProductsCatalogService.js';
import { DilovodService, dilovodService } from '../../services/dilovod/DilovodService.js';
import type { DilovodSyncResult } from '../../services/dilovod/DilovodTypes.js';
import {
  catalogMediaService,
  CATALOG_MEDIA_ACCEPT,
  CATALOG_MEDIA_MAX_BYTES,
  CATALOG_MEDIA_MAX_FILES,
} from './CatalogMediaService.js';

const router = Router();
const guard = [authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER)] as const;

const uploadTmpDir = path.resolve(process.cwd(), 'uploads', 'catalog', '_tmp');
fs.mkdirSync(uploadTmpDir, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTmpDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-()+ ]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: CATALOG_MEDIA_MAX_BYTES, files: CATALOG_MEDIA_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (CATALOG_MEDIA_ACCEPT.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Дозволені лише зображення JPEG, PNG, WebP, GIF'));
    }
  },
});

function handleError(res: Response, error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[ProductsCatalog] ${context}: ${message}`, error);
  const status = message.includes('не знайдено') || message.includes('не знайден') ? 404 : 500;
  res.status(status).json({ success: false, error: message });
}

function mapMulterFiles(
  files: Express.Multer.File[] | undefined
): Array<{ originalName: string; mimeType: string; size: number; tempPath: string }> {
  return (files || []).map((f) => ({
    originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    mimeType: f.mimetype,
    size: f.size,
    tempPath: f.path,
  }));
}

// GET /api/catalog/tree
router.get('/tree', ...guard, async (req, res) => {
  try {
    const includeTrash = String(req.query.includeTrash || '') === '1';
    const data = await productsCatalogService.getTree({ includeTrash });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /tree');
  }
});

// GET /api/catalog/folder/:id/children  (id=root → null parent)
router.get('/folder/:id/children', ...guard, async (req, res) => {
  try {
    const folderId = req.params.id === 'root' ? null : req.params.id;
    const data = await productsCatalogService.getFolderChildren(folderId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /folder/:id/children');
  }
});

// GET /api/catalog/search?q=&underFolderId=&underFolderName=
router.get('/search', ...guard, async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const underFolderId = req.query.underFolderId
      ? String(req.query.underFolderId)
      : undefined;
    const underFolderName = req.query.underFolderName
      ? String(req.query.underFolderName)
      : undefined;
    const data = await productsCatalogService.search(q, 50, {
      underFolderId,
      underFolderName,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /search');
  }
});

// GET /api/catalog/trash
router.get('/trash', ...guard, async (_req, res) => {
  try {
    const data = await productsCatalogService.getTrash();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /trash');
  }
});

// GET /api/catalog/units
router.get('/units', ...guard, async (_req, res) => {
  try {
    const data = await productsCatalogService.getUnits();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /units');
  }
});

// GET /api/catalog/dictionaries — units, priceTypes, currencies, accPolicies (кеш Dilovod)
router.get('/dictionaries', ...guard, async (_req, res) => {
  try {
    const data = await productsCatalogService.getDictionaries();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /dictionaries');
  }
});

// GET /api/catalog/sku/next?parentId=&excludeId=
router.get('/sku/next', ...guard, async (req, res) => {
  try {
    const parentRaw = String(req.query.parentId || 'root');
    const parentId = parentRaw === 'root' || parentRaw === '' ? null : parentRaw;
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;
    const sku = await productsCatalogService.suggestNextSku(parentId, excludeId);
    res.json({ success: true, data: { sku } });
  } catch (error) {
    handleError(res, error, 'GET /sku/next');
  }
});

// GET /api/catalog/barcode/next — наступний вільний EAN-13 з Dilovod barCodes
router.get('/barcode/next', ...guard, async (_req, res) => {
  try {
    const code = await productsCatalogService.suggestNextBarcode();
    res.json({ success: true, data: { code } });
  } catch (error) {
    handleError(res, error, 'GET /barcode/next');
  }
});

// GET /api/catalog/goods/:id
router.get('/goods/:id', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.getGoodDetail(req.params.id, { livePull: true });
    if (!data) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id');
  }
});

// POST /api/catalog/goods
router.post('/goods', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.createGood(req.body || {});
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods');
  }
});

// PUT /api/catalog/goods/:id
router.put('/goods/:id', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.updateGood(req.params.id, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT /goods/:id');
  }
});

// POST /api/catalog/goods/move
router.post('/goods/move', ...guard, async (req, res) => {
  try {
    const { ids, targetParentId } = req.body || {};
    if (!Array.isArray(ids) || targetParentId == null || targetParentId === '') {
      res.status(400).json({ success: false, error: 'ids[] і targetParentId обовʼязкові' });
      return;
    }
    const data = await productsCatalogService.moveGoods(ids.map(String), String(targetParentId));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/move');
  }
});

// POST /api/catalog/reorder — інтервальний sortOrder siblings
router.post('/reorder', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.reorderSibling(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /reorder');
  }
});

// POST /api/catalog/goods/archive
router.post('/goods/archive', ...guard, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const data = await productsCatalogService.archiveGoods(ids.map(String));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/archive');
  }
});

// POST /api/catalog/goods/restore — з архіву в батьківську папку (без setDelMark)
router.post('/goods/restore', ...guard, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const data = await productsCatalogService.restoreGoods(ids.map(String));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/restore');
  }
});

// POST /api/catalog/goods/trash
router.post('/goods/trash', ...guard, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const data = await productsCatalogService.trashGoods(ids.map(String));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/trash');
  }
});

// POST /api/catalog/goods/:id/duplicate
router.post('/goods/:id/duplicate', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.duplicateGood(req.params.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/duplicate');
  }
});

// POST /api/catalog/refresh
// body:
//   { folderId, recursive?: true } → structure-only гілка
//   { ids: string[] } → sync виділених (header + prices + barcodes)
//   {} → повний refresh (лише ADMIN)
router.post('/refresh', ...guard, async (req, res) => {
  try {
    const body = req.body || {};
    const hasFolderId = Object.prototype.hasOwnProperty.call(body, 'folderId');
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;

    if (hasFolderId) {
      const raw = body.folderId;
      const folderId =
        raw === 'root' || raw === null || raw === '' || raw === undefined
          ? null
          : String(raw);
      const recursive = body.recursive !== false; // за замовчуванням recursive для гілки
      const data = await productsCatalogService.refreshFolderFromDilovod(folderId, {
        recursive,
      });

      // TEMP: після refresh гілки — force Legacy Update в таблицю `products`.
      // Прибрати, коли відмовимось від legacy products.
      let legacySkuCount = 0;
      let legacyOutdatedCount = 0;
      let legacySync: DilovodSyncResult | null = null;
      let legacyError: string | null = null;
      try {
        const { activeSkus, archivedSkus } =
          await productsCatalogService.listSkusInFolderSubtree(folderId);
        legacySkuCount = activeSkus.length + archivedSkus.length;
        legacyOutdatedCount = await productsCatalogService.markLegacyProductsOutdatedBySku(
          archivedSkus
        );
        if (activeSkus.length > 0) {
          const abortController = new AbortController();
          DilovodService.registerSyncAbortController(abortController);
          req.on('close', () => abortController.abort());
          legacySync = await dilovodService.syncProductsWithDilovod(
            'manual',
            activeSkus,
            abortController.signal,
            { force: true }
          );
        }
      } catch (legacyErr) {
        legacyError =
          legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
        logServer('[ProductsCatalog] TEMP legacy sync after branch refresh failed', legacyErr);
      }

      res.json({
        success: true,
        data: { ...data, legacySkuCount, legacyOutdatedCount, legacySync, legacyError },
      });
      return;
    }

    if (ids && ids.length > 0) {
      const data = await productsCatalogService.refreshFromDilovod(ids);
      res.json({ success: true, data });
      return;
    }

    // Full catalog refresh — ADMIN only
    if (!req.user || !hasAccess(req.user.role, undefined, ROLES.ADMIN)) {
      res.status(403).json({ success: false, error: 'Повний refresh доступний лише ADMIN' });
      return;
    }

    const data = await productsCatalogService.refreshFromDilovod();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /refresh');
  }
});

// ─── Catalog images (local only) ───────────────────────────────────────────

// GET /api/catalog/goods/:id/images
router.get('/goods/:id/images', ...guard, async (req, res) => {
  try {
    const data = await catalogMediaService.listForGood(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/images');
  }
});

// POST /api/catalog/goods/:id/images — multipart field "files"
router.post('/goods/:id/images', ...guard, (req, res) => {
  imageUpload.array('files', CATALOG_MEDIA_MAX_FILES)(req, res, async (err) => {
    if (err) {
      handleError(res, err, 'POST /goods/:id/images multer');
      return;
    }
    try {
      const data = await catalogMediaService.saveForGood(req.params.id, mapMulterFiles(req.files as Express.Multer.File[]));
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'POST /goods/:id/images');
    }
  });
});

// POST /api/catalog/images/staging/:sessionId
router.post('/images/staging/:sessionId', ...guard, (req, res) => {
  imageUpload.array('files', CATALOG_MEDIA_MAX_FILES)(req, res, async (err) => {
    if (err) {
      handleError(res, err, 'POST /images/staging/:sessionId multer');
      return;
    }
    try {
      const data = await catalogMediaService.saveStaging(
        req.params.sessionId,
        mapMulterFiles(req.files as Express.Multer.File[])
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'POST /images/staging/:sessionId');
    }
  });
});

// GET /api/catalog/images/staging/:sessionId
router.get('/images/staging/:sessionId', ...guard, async (req, res) => {
  try {
    const data = await catalogMediaService.listStaging(req.params.sessionId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /images/staging/:sessionId');
  }
});

// DELETE /api/catalog/images/staging/:sessionId — discard all
router.delete('/images/staging/:sessionId', ...guard, async (req, res) => {
  try {
    await catalogMediaService.discardStaging(req.params.sessionId);
    res.json({ success: true, data: { discarded: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/staging/:sessionId');
  }
});

// DELETE /api/catalog/images/staging/:sessionId/:fileName
router.delete('/images/staging/:sessionId/:fileName', ...guard, async (req, res) => {
  try {
    await catalogMediaService.removeStagingFile(req.params.sessionId, req.params.fileName);
    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/staging/:sessionId/:fileName');
  }
});

// POST /api/catalog/images/staging/:sessionId/commit — { goodId }
router.post('/images/staging/:sessionId/commit', ...guard, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '');
    if (!goodId) {
      res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
      return;
    }
    const data = await catalogMediaService.commitStaging(req.params.sessionId, goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /images/staging/:sessionId/commit');
  }
});

// DELETE /api/catalog/images/:imageId
router.delete('/images/:imageId', ...guard, async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10);
    if (!Number.isFinite(imageId)) {
      res.status(400).json({ success: false, error: 'Невірний imageId' });
      return;
    }
    await catalogMediaService.deleteImage(imageId);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/:imageId');
  }
});

// PATCH /api/catalog/images/:imageId — { isPrimary?: true, sortOrder?: number } or reorder via body.orderedIds on good
router.patch('/images/:imageId', ...guard, async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10);
    if (!Number.isFinite(imageId)) {
      res.status(400).json({ success: false, error: 'Невірний imageId' });
      return;
    }
    if (req.body?.isPrimary === true) {
      const data = await catalogMediaService.setPrimary(imageId);
      res.json({ success: true, data });
      return;
    }
    res.status(400).json({ success: false, error: 'Підтримується лише isPrimary: true' });
  } catch (error) {
    handleError(res, error, 'PATCH /images/:imageId');
  }
});

// PUT /api/catalog/goods/:id/images/order — { orderedIds: number[] }
router.put('/goods/:id/images/order', ...guard, async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((n: unknown) => Number(n))
      : [];
    if (orderedIds.length === 0 || orderedIds.some((n: number) => !Number.isFinite(n))) {
      res.status(400).json({ success: false, error: 'orderedIds[] обовʼязковий' });
      return;
    }
    const data = await catalogMediaService.reorder(req.params.id, orderedIds);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT /goods/:id/images/order');
  }
});

export default router;
