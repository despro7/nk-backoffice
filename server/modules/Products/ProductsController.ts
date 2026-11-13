/**
 * Products 2.0 API — /api/catalog/*
 * minRole: WAREHOUSE_MANAGER
 */

import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Router, type Response } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.js';
import { roleService } from '../../services/RoleService.js';
import { prisma, logServer } from '../../lib/utils.js';
import { productsCatalogService } from './ProductsCatalogService.js';
import { catalogAuditUserId, trackCatalogAction } from './catalogAuditHttp.js';
import { catalogGoodAuditService } from './CatalogGoodAuditService.js';
import { CatalogSpecError, catalogSpecService } from './CatalogSpecService.js';
import { CATALOG_AUDIT_ACTIONS } from '../../../shared/types/catalogAudit.js';
import { AUDIT_SOURCES, type AuditSource } from '../../../shared/constants/auditEntities.js';
import { PERMISSIONS, hasPermission } from '../../../shared/constants/permissions.js';
import {
  assertCanUseCatalogApi,
  assertFolderEdit,
  assertFolderView,
  assertHasAnyFolderEdit,
  assertItemsEdit,
  assertRootEdit,
  accessFolderId,
  filterChildrenForAcl,
  filterSearchForAcl,
  filterTreeForAcl,
  invalidateCatalogAclIndex,
  loadCatalogAclIndex,
} from './catalogFolderAcl.js';
import {
  assertCatalogProductFieldPermissions,
  assertCatalogProductFieldPermissionsForUpdate,
} from './catalogProductPermissions.js';
import { CATALOG_ACC_POLICY_KIT, CATALOG_TRASH_ID, type CatalogGoodUsedInScope } from '../../../shared/types/catalog.js';
import {
  canViewCatalogItem,
  normalizeCatalogFolderId,
} from '../../../shared/utils/catalogFolderAccess.js';
import { DilovodService, dilovodService } from '../../services/dilovod/DilovodService.js';
import { ProductBatchInputError, warehouseBatchesService } from '../Warehouse/WarehouseBatchesService.js';
import type { DilovodSyncResult } from '../../services/dilovod/DilovodTypes.js';
import {
  catalogMediaService,
  CATALOG_MEDIA_ACCEPT,
  CATALOG_MEDIA_MAX_BYTES,
  CATALOG_MEDIA_MAX_FILES,
} from './CatalogMediaService.js';

const router = Router();
requirePermission('catalog', 'manage', 'Повний доступ до каталогу товарів');
requirePermission('products', 'editSpec', 'Редагувати специфікацію (BOM)');
requirePermission('storefront', 'edit', 'Редагувати контент вітрини товару');
requirePermission('products', 'viewDilovod', 'Переглядати дані Dilovod у картці товару');
requirePermission('products', 'viewAudit', 'Переглядати журнал змін товарів');
requirePermission('products', 'approveSpec', 'Затверджувати специфікацію (BOM)');
const catalogFullRefresh = requirePermission('catalog', 'fullRefresh', 'Повне оновлення каталогу з Dilovod');
const authOnly = [authenticateToken] as const;

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
  if (error instanceof CatalogSpecError) {
    res.status(error.status).json({ success: false, error: error.message, ...(error.code ? { code: error.code } : {}) });
    return;
  }
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
router.get('/tree', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const includeTrash = String(req.query.includeTrash || '') === '1';
    const data = filterTreeForAcl(
      await productsCatalogService.getTree({ includeTrash }),
      perms
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /tree');
  }
});

// GET /api/catalog/folder/:id/children  (id=root → null parent)
router.get('/folder/:id/children', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const folderId = req.params.id === 'root' ? null : req.params.id;
    const index = await loadCatalogAclIndex();
    const data = filterChildrenForAcl(
      folderId,
      await productsCatalogService.getFolderChildren(folderId),
      perms,
      index.parentById
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /folder/:id/children');
  }
});

// GET /api/catalog/warehouse-search-index — preload GP для складського пошуку
router.get('/warehouse-search-index', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const data = await productsCatalogService.listWarehouseSearchIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /warehouse-search-index');
  }
});

// GET /api/catalog/search?q=&underFolderId=&underFolderName=
router.get('/search', ...authOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const underFolderId = req.query.underFolderId
      ? String(req.query.underFolderId)
      : undefined;
    const underFolderName = req.query.underFolderName
      ? String(req.query.underFolderName)
      : undefined;
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const data = await productsCatalogService.search(q, 50, {
      underFolderId,
      underFolderName,
    });
    const index = await loadCatalogAclIndex();
    res.json({ success: true, data: filterSearchForAcl(data, perms, index.parentById) });
  } catch (error) {
    handleError(res, error, 'GET /search');
  }
});

// GET /api/catalog/trash
router.get('/trash', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertFolderView(res, perms, CATALOG_TRASH_ID, index.parentById)) return;
    const data = await productsCatalogService.getTrash();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /trash');
  }
});

// GET /api/catalog/units
router.get('/units', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const data = await productsCatalogService.getUnits();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /units');
  }
});

// GET /api/catalog/dictionaries — units, priceTypes, currencies, accPolicies (кеш Dilovod)
router.get('/dictionaries', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const data = await productsCatalogService.getDictionaries();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /dictionaries');
  }
});

// GET /api/catalog/sku/next?parentId=&excludeId=
router.get('/sku/next', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const parentRaw = String(req.query.parentId || 'root');
    const parentId = parentRaw === 'root' || parentRaw === '' ? null : parentRaw;
    const index = await loadCatalogAclIndex();
    if (!assertFolderEdit(res, perms, parentId, index.parentById)) return;
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;
    const sku = await productsCatalogService.suggestNextSku(parentId, excludeId);
    res.json({ success: true, data: { sku } });
  } catch (error) {
    handleError(res, error, 'GET /sku/next');
  }
});

// GET /api/catalog/barcode/next — наступний вільний EAN-13 з Dilovod barCodes
router.get('/barcode/next', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!assertHasAnyFolderEdit(res, perms)) return;
    const code = await productsCatalogService.suggestNextBarcode();
    res.json({ success: true, data: { code } });
  } catch (error) {
    handleError(res, error, 'GET /barcode/next');
  }
});

/** Товар (не група, не комплект) з правом редагування його розділу; інакше відповідь уже надіслано. */
async function loadBatchTargetGood(req: Parameters<typeof assertCanUseCatalogApi>[0], res: Response): Promise<string | null> {
  const perms = await assertCanUseCatalogApi(req, res);
  if (!perms) return null;
  const goodId = String(req.params.id);
  const good = await prisma.catalogGood.findUnique({
    where: { id: goodId },
    select: { id: true, isGroup: true, parentId: true, accPolicyId: true },
  });
  if (!good || good.isGroup) {
    res.status(404).json({ success: false, error: 'Товар не знайдено' });
    return null;
  }
  if (good.accPolicyId === CATALOG_ACC_POLICY_KIT) {
    res.status(400).json({ success: false, error: 'Партії комплектів створюються при випуску наборів' });
    return null;
  }
  const index = await loadCatalogAclIndex();
  if (!assertFolderEdit(res, perms, good.parentId, index.parentById)) return null;
  return good.id;
}

function handleBatchError(res: Response, error: unknown, context: string) {
  if (error instanceof ProductBatchInputError) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }
  handleError(res, error, context);
}

// GET /api/catalog/goods/:id/batches/preview?date=YYYY-MM-DD – назва нової партії і партії цього дня
router.get('/goods/:id/batches/preview', ...authOnly, async (req, res) => {
  try {
    const goodId = await loadBatchTargetGood(req, res);
    if (!goodId) return;
    const data = await warehouseBatchesService.previewProductBatch({
      goodId,
      date: String(req.query.date ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    handleBatchError(res, error, 'GET /goods/:id/batches/preview');
  }
});

// POST /api/catalog/goods/:id/batches – партія в Dilovod (YMMDD) + порційний ШК
router.post('/goods/:id/batches', ...authOnly, async (req, res) => {
  try {
    const goodId = await loadBatchTargetGood(req, res);
    if (!goodId) return;
    const body = req.body || {};
    const data = await warehouseBatchesService.createProductBatch({
      goodId,
      date: String(body.date ?? ''),
      expiration: String(body.expiration ?? ''),
      reuseBatchId: body.reuseBatchId ? String(body.reuseBatchId) : null,
    });
    logServer(
      `[ProductsCatalog] product batch user=${catalogAuditUserId(req)} good=${goodId} batch=${data.batchNumber} created=${data.created} barcode=${data.barcode ?? '-'}`,
    );
    res.json({ success: true, data });
  } catch (error) {
    handleBatchError(res, error, 'POST /goods/:id/batches');
  }
});

// GET /api/catalog/goods/:id/used-in?scope=products|kits
router.get('/goods/:id/used-in', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;

    const goodId = String(req.params.id);
    const scopeRaw = String(req.query.scope || '');
    if (scopeRaw !== 'products' && scopeRaw !== 'kits') {
      res.status(400).json({ success: false, error: 'scope має бути products або kits' });
      return;
    }
    const scope = scopeRaw as CatalogGoodUsedInScope;

    const current = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true, parentId: true },
    });
    if (!current) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }

    const index = await loadCatalogAclIndex();
    const folderId = current.isGroup ? current.id : current.parentId;
    if (!assertFolderView(res, perms, folderId, index.parentById)) return;

    const rows = await productsCatalogService.getGoodUsedIn(goodId, scope);
    const parentIds = rows.map((row) => row.parentGoodId);
    const parents =
      parentIds.length > 0
        ? await prisma.catalogGood.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, isGroup: true, parentId: true },
          })
        : [];
    const parentByItemId = new Map(parents.map((parent) => [parent.id, parent]));

    const data = rows.filter((row) => {
      const parent = parentByItemId.get(row.parentGoodId);
      return parent && canViewCatalogItem(parent, perms, index.parentById);
    });

    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/used-in');
  }
});

// GET /api/catalog/goods/:id/dilovod-preview
router.get('/goods/:id/dilovod-preview', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const goodId = req.params.id;
    const current = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true, parentId: true },
    });
    if (!current) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }
    const index = await loadCatalogAclIndex();
    const folderId = current.isGroup ? current.id : current.parentId;
    if (!assertFolderView(res, perms, folderId, index.parentById)) return;

    const data = await productsCatalogService.previewGoodFromDilovod(goodId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/dilovod-preview');
  }
});

// POST /api/catalog/goods/:id/dilovod-apply
router.post('/goods/:id/dilovod-apply', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const goodId = req.params.id;
    const current = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, isGroup: true, parentId: true },
    });
    if (!current) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }
    const index = await loadCatalogAclIndex();
    const folderId = current.isGroup ? current.id : current.parentId;
    if (!assertFolderEdit(res, perms, folderId, index.parentById)) return;

    const body = req.body || {};
    const data = await trackCatalogAction(
      req,
      CATALOG_AUDIT_ACTIONS.DILOVOD_PULL,
      [goodId],
      () =>
        productsCatalogService.applyDilovodPull(goodId, {
          applyAll: body.applyAll === true,
          fields: Array.isArray(body.fields) ? body.fields : undefined,
        }),
      { source: 'dilovod' },
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/dilovod-apply');
  }
});

function parseAuditListQuery(query: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const source = str(query.source);
  const action = str(query.action);
  return {
    cursor: num(query.cursor),
    limit: num(query.limit),
    userId: num(query.userId),
    from: str(query.from),
    to: str(query.to),
    action: action ? action.split(',') : undefined,
    source: source && (AUDIT_SOURCES as readonly string[]).includes(source) ? (source as AuditSource) : undefined,
  };
}

// GET /api/catalog/goods/:id/audit – журнал змін одного товару
// ─── Модерація специфікації ─────────────────────────────────────────────────

/** Перегляд товару (ACL папки) → права користувача або null (відповідь уже надіслано). */
async function specViewPerms(req: import('express').Request, res: Response): Promise<Iterable<string> | null> {
  const perms = await assertCanUseCatalogApi(req, res);
  if (!perms) return null;
  const good = await prisma.catalogGood.findUnique({
    where: { id: req.params.id },
    select: { parentId: true, isGroup: true, id: true },
  });
  if (!good) {
    res.status(404).json({ success: false, error: 'Товар не знайдено' });
    return null;
  }
  const index = await loadCatalogAclIndex();
  if (!assertFolderView(res, perms, good.isGroup ? good.id : good.parentId, index.parentById)) return null;
  return perms;
}

function specActor(req: import('express').Request, perms: Iterable<string>) {
  return {
    userId: catalogAuditUserId(req),
    canApprove: hasPermission(perms, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC),
  };
}

function requireSpecPermission(res: Response, perms: Iterable<string>, key: string, message: string): boolean {
  if (hasPermission(perms, key)) return true;
  res.status(403).json({ success: false, error: message, code: 'INSUFFICIENT_ROLE' });
  return false;
}

// GET /api/catalog/spec-drafts – усі чернетки (позначки в таблиці каталогу, лічильник)
router.get('/spec-drafts', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    res.json({ success: true, data: await catalogSpecService.listDrafts() });
  } catch (error) {
    handleError(res, error, 'GET /spec-drafts');
  }
});

// GET /api/catalog/goods/:id/spec – версія, чернетка, позначка «перевірити склад / КБЖВ»
router.get('/goods/:id/spec', ...authOnly, async (req, res) => {
  try {
    if (!(await specViewPerms(req, res))) return;
    res.json({ success: true, data: await catalogSpecService.getState(req.params.id) });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/spec');
  }
});

// PUT /api/catalog/goods/:id/spec-draft – створити / оновити чернетку (body: components, specQty, comment)
router.put('/goods/:id/spec-draft', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
    if (!requireSpecPermission(res, perms, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC, 'Немає права редагувати специфікацію товару')) return;
    const body = req.body || {};
    if (!Array.isArray(body.components)) {
      res.status(400).json({ success: false, error: 'components[] обовʼязковий' });
      return;
    }
    const good = await prisma.catalogGood.findUnique({ where: { id: req.params.id }, select: { accPolicyId: true } });
    const content = await catalogSpecService.contentFromInput(body.components, body.specQty, good?.accPolicyId ?? null);
    const data = await catalogSpecService.saveDraft(req.params.id, content, String(body.comment ?? ''), catalogAuditUserId(req));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT /goods/:id/spec-draft');
  }
});

// DELETE /api/catalog/goods/:id/spec-draft – видалити чернетку (автор або затверджувач)
router.delete('/goods/:id/spec-draft', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    const actor = specActor(req, perms);
    if (!actor.canApprove && !requireSpecPermission(res, perms, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC, 'Немає права редагувати специфікацію товару')) return;
    res.json({ success: true, data: await catalogSpecService.discardDraft(req.params.id, actor) });
  } catch (error) {
    handleError(res, error, 'DELETE /goods/:id/spec-draft');
  }
});

// POST /api/catalog/goods/:id/spec-draft/approve – затвердити (body.force – попри зміну чинної версії)
router.post('/goods/:id/spec-draft/approve', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    if (!requireSpecPermission(res, perms, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC, 'Немає права затверджувати специфікацію')) return;
    const data = await catalogSpecService.approve(req.params.id, catalogAuditUserId(req), { force: req.body?.force === true });
    invalidateCatalogAclIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/spec-draft/approve');
  }
});

// POST /api/catalog/goods/:id/spec-draft/reject – відхилити (body.reason обовʼязковий)
router.post('/goods/:id/spec-draft/reject', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    if (!requireSpecPermission(res, perms, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC, 'Немає права затверджувати специфікацію')) return;
    const data = await catalogSpecService.reject(req.params.id, catalogAuditUserId(req), String(req.body?.reason ?? ''));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/spec-draft/reject');
  }
});

// GET /api/catalog/goods/:id/spec-versions – історія затверджених версій
router.get('/goods/:id/spec-versions', ...authOnly, async (req, res) => {
  try {
    if (!(await specViewPerms(req, res))) return;
    res.json({ success: true, data: await catalogSpecService.listVersions(req.params.id) });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/spec-versions');
  }
});

// POST /api/catalog/goods/:id/spec-versions/:version/restore – відкат (затверджувач – одразу, інші – чернетка)
router.post('/goods/:id/spec-versions/:version/restore', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
    const actor = specActor(req, perms);
    if (!actor.canApprove && !requireSpecPermission(res, perms, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC, 'Немає права редагувати специфікацію товару')) return;
    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 1) {
      res.status(400).json({ success: false, error: 'Некоректна версія' });
      return;
    }
    const data = await catalogSpecService.restore(req.params.id, version, actor, String(req.body?.comment ?? ''));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/spec-versions/:version/restore');
  }
});

// POST /api/catalog/goods/:id/spec/content-reviewed – прибрати позначку «перевірити склад / КБЖВ»
router.post('/goods/:id/spec/content-reviewed', ...authOnly, async (req, res) => {
  try {
    const perms = await specViewPerms(req, res);
    if (!perms) return;
    if (!requireSpecPermission(res, perms, PERMISSIONS.ACTION_STOREFRONT_EDIT, 'Немає права редагувати контент сайту')) return;
    await catalogSpecService.ackContentReview(req.params.id);
    res.json({ success: true, data: await catalogSpecService.getState(req.params.id) });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/spec/content-reviewed');
  }
});

router.get('/goods/:id/audit', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!hasPermission(perms, PERMISSIONS.ACTION_PRODUCTS_VIEW_AUDIT)) {
      res.status(403).json({ success: false, error: 'Немає права переглядати журнал змін' });
      return;
    }
    const data = await catalogGoodAuditService.list({
      ...parseAuditListQuery(req.query as Record<string, unknown>),
      entityId: req.params.id,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/audit');
  }
});

// GET /api/catalog/audit – загальний журнал змін каталогу (фільтри: goodId, userId, from, to, action, source)
router.get('/audit', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!hasPermission(perms, PERMISSIONS.ACTION_PRODUCTS_VIEW_AUDIT)) {
      res.status(403).json({ success: false, error: 'Немає права переглядати журнал змін' });
      return;
    }
    const goodId = typeof req.query.goodId === 'string' && req.query.goodId ? req.query.goodId : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    let entityId: string | string[] | undefined = goodId;
    if (!goodId && q) {
      const goods = await prisma.catalogGood.findMany({
        where: { OR: [{ name: { contains: q } }, { sku: { contains: q } }] },
        select: { id: true },
        take: 500,
      });
      if (goods.length === 0) {
        res.json({ success: true, data: { items: [], nextCursor: null } });
        return;
      }
      entityId = goods.map((g) => g.id);
    }
    const data = await catalogGoodAuditService.list({
      ...parseAuditListQuery(req.query as Record<string, unknown>),
      ...(entityId ? { entityId } : {}),
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /audit');
  }
});

// GET /api/catalog/audit/users – користувачі, що мають записи в журналі каталогу (для фільтра)
router.get('/audit/users', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!hasPermission(perms, PERMISSIONS.ACTION_PRODUCTS_VIEW_AUDIT)) {
      res.status(403).json({ success: false, error: 'Немає права переглядати журнал змін' });
      return;
    }
    const data = await catalogGoodAuditService.listUsers();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /audit/users');
  }
});

// GET /api/catalog/goods/:id
router.get('/goods/:id', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const livePull = req.query.livePull !== 'false';
    const data = await productsCatalogService.getGoodDetail(req.params.id, { livePull });
    if (!data) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }
    const index = await loadCatalogAclIndex();
    const folderId = data.isGroup ? data.id : data.parentId;
    if (!assertFolderView(res, perms, folderId, index.parentById)) return;
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id');
  }
});

// POST /api/catalog/goods
router.post('/goods', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const parentId = normalizeCatalogFolderId(req.body?.parentId);
    const index = await loadCatalogAclIndex();
    if (!assertFolderEdit(res, perms, parentId, index.parentById)) return;
    const body = req.body || {};
    if (!assertCatalogProductFieldPermissions(res, perms, body)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.CREATED, [], () => productsCatalogService.createGood(body), {
      resultIds: (created) => [created.id],
    });
    invalidateCatalogAclIndex();
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods');
  }
});

// PUT /api/catalog/goods/:id
router.put('/goods/:id', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
    const nextParent = req.body?.parentId;
    if (nextParent !== undefined) {
      const target = normalizeCatalogFolderId(String(nextParent));
      if (target == null) {
        if (!assertRootEdit(res, perms)) return;
      } else if (!assertFolderEdit(res, perms, target, index.parentById)) {
        return;
      }
    }
    const body = req.body || {};
    if (
      !(await assertCatalogProductFieldPermissionsForUpdate(
        req,
        res,
        perms,
        req.params.id,
        body,
        (id) => productsCatalogService.getGoodDetail(id),
      ))
    ) {
      return;
    }
    const spec = await catalogSpecService.prepareUpdate(req.params.id, body, {
      userId: catalogAuditUserId(req),
      canApprove: hasPermission(perms, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC),
    });
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.UPDATED, [req.params.id], () =>
      productsCatalogService.updateGood(req.params.id, spec.input),
    );
    invalidateCatalogAclIndex();
    await spec.afterSave();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT /goods/:id');
  }
});

// POST /api/catalog/goods/move
router.post('/goods/move', ...authOnly, async (req, res) => {
  try {
    const { ids, targetParentId } = req.body || {};
    if (!Array.isArray(ids) || targetParentId == null || targetParentId === '') {
      res.status(400).json({ success: false, error: 'ids[] і targetParentId обовʼязкові' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, ids.map(String), index)) return;
    const target = normalizeCatalogFolderId(String(targetParentId));
    if (target == null) {
      if (!assertRootEdit(res, perms)) return;
    } else if (!assertFolderEdit(res, perms, target, index.parentById)) {
      return;
    }
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.MOVED, ids.map(String), () =>
      productsCatalogService.moveGoods(ids.map(String), String(targetParentId)),
    );
    invalidateCatalogAclIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/move');
  }
});

// POST /api/catalog/goods/change-type
router.post('/goods/change-type', ...authOnly, async (req, res) => {
  try {
    const { ids, accPolicyId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || accPolicyId == null || accPolicyId === '') {
      res.status(400).json({ success: false, error: 'ids[] і accPolicyId обовʼязкові' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, ids.map(String), index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.TYPE_CHANGED, ids.map(String), () =>
      productsCatalogService.changeGoodsType(ids.map(String), String(accPolicyId)),
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/change-type');
  }
});

// POST /api/catalog/reorder — інтервальний sortOrder siblings
router.post('/reorder', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const parentId = normalizeCatalogFolderId(req.body?.parentId);
    const index = await loadCatalogAclIndex();
    if (!assertFolderEdit(res, perms, parentId, index.parentById)) return;
    const data = await productsCatalogService.reorderSibling(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /reorder');
  }
});

// POST /api/catalog/goods/archive
router.post('/goods/archive', ...authOnly, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, ids.map(String), index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.ARCHIVED, ids.map(String), () =>
      productsCatalogService.archiveGoods(ids.map(String)),
    );
    invalidateCatalogAclIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/archive');
  }
});

// POST /api/catalog/goods/restore — з архіву в батьківську папку (без setDelMark)
router.post('/goods/restore', ...authOnly, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, ids.map(String), index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.RESTORED, ids.map(String), () =>
      productsCatalogService.restoreGoods(ids.map(String)),
    );
    invalidateCatalogAclIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/restore');
  }
});

// POST /api/catalog/goods/trash
router.post('/goods/trash', ...authOnly, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: 'ids[] обовʼязковий' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, ids.map(String), index)) return;
    if (!assertFolderEdit(res, perms, CATALOG_TRASH_ID, index.parentById)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.TRASHED, ids.map(String), () =>
      productsCatalogService.trashGoods(ids.map(String)),
    );
    invalidateCatalogAclIndex();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/trash');
  }
});

// POST /api/catalog/goods/:id/duplicate
router.post('/goods/:id/duplicate', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.DUPLICATED, [], () => productsCatalogService.duplicateGood(req.params.id), {
      resultIds: (created) => [created.id],
      meta: { sourceGoodId: req.params.id },
    });
    invalidateCatalogAclIndex();
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /goods/:id/duplicate');
  }
});

// POST /api/catalog/refresh
// body:
//   { folderId, recursive?: true, maxDepth?: number } → structure-only гілка
//   { ids: string[] } → sync виділених (header + prices + barcodes)
//   {} → повний refresh (лише ADMIN)
router.post('/refresh', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const body = req.body || {};
    const hasFolderId = Object.prototype.hasOwnProperty.call(body, 'folderId');
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : undefined;
    const index = await loadCatalogAclIndex();

    if (hasFolderId) {
      const raw = body.folderId;
      const folderId =
        raw === 'root' || raw === null || raw === '' || raw === undefined
          ? null
          : String(raw);
      if (!assertFolderEdit(res, perms, folderId, index.parentById)) return;
      const recursive = body.recursive !== false; // за замовчуванням recursive для гілки
      const maxDepthRaw = body.maxDepth;
      const maxDepth =
        maxDepthRaw === undefined || maxDepthRaw === null || maxDepthRaw === ''
          ? undefined
          : Number(maxDepthRaw);
      const data = await productsCatalogService.refreshFolderFromDilovod(folderId, {
        recursive,
        maxDepth: Number.isFinite(maxDepth) ? maxDepth : undefined,
      });

      // TEMP: після refresh гілки — force Legacy Update в таблицю `products`.
      // Прибрати, коли відмовимось від legacy products.
      let legacySkuCount = 0;
      let legacyOutdatedCount = 0;
      let legacySync: DilovodSyncResult | null = null;
      let legacyError: string | null = null;
      try {
        const { activeSkus, archivedSkus } =
          await productsCatalogService.listSkusInFolderSubtree(folderId, {
            visitedFolderIds: data.visitedFolderIds,
          });
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
        data: {
          upserted: data.upserted,
          orphansResolved: data.orphansResolved,
          capped: data.capped,
          maxDepth: data.maxDepth,
          legacySkuCount,
          legacyOutdatedCount,
          legacySync,
          legacyError,
        },
      });
      return;
    }

    if (ids && ids.length > 0) {
      if (!assertItemsEdit(res, perms, ids, index)) return;
      const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.DILOVOD_PULL, ids, () =>
        productsCatalogService.refreshFromDilovod(ids),
      { source: 'dilovod' });
      res.json({ success: true, data });
      return;
    }

    // Full catalog refresh — ADMIN only
    if (!req.user || !(await roleService.hasPermission(req.user.role, catalogFullRefresh.key))) {
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
router.get('/goods/:id/images', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    const folderId = accessFolderId(req.params.id, index);
    if (!assertFolderView(res, perms, folderId, index.parentById)) return;
    const data = await catalogMediaService.listForGood(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /goods/:id/images');
  }
});

// POST /api/catalog/goods/:id/images — multipart field "files"
router.post('/goods/:id/images', ...authOnly, (req, res) => {
  imageUpload.array('files', CATALOG_MEDIA_MAX_FILES)(req, res, async (err) => {
    if (err) {
      handleError(res, err, 'POST /goods/:id/images multer');
      return;
    }
    try {
      const perms = await assertCanUseCatalogApi(req, res);
      if (!perms) return;
      const index = await loadCatalogAclIndex();
      if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
      const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [req.params.id], () => catalogMediaService.saveForGood(req.params.id, mapMulterFiles(req.files as Express.Multer.File[])));
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'POST /goods/:id/images');
    }
  });
});

// POST /api/catalog/images/staging/:sessionId
router.post('/images/staging/:sessionId', ...authOnly, (req, res) => {
  imageUpload.array('files', CATALOG_MEDIA_MAX_FILES)(req, res, async (err) => {
    if (err) {
      handleError(res, err, 'POST /images/staging/:sessionId multer');
      return;
    }
    try {
      const perms = await assertCanUseCatalogApi(req, res);
      if (!perms) return;
      if (!assertHasAnyFolderEdit(res, perms)) return;
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
router.get('/images/staging/:sessionId', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const data = await catalogMediaService.listStaging(req.params.sessionId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET /images/staging/:sessionId');
  }
});

// DELETE /api/catalog/images/staging/:sessionId — discard all
router.delete('/images/staging/:sessionId', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!assertHasAnyFolderEdit(res, perms)) return;
    await catalogMediaService.discardStaging(req.params.sessionId);
    res.json({ success: true, data: { discarded: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/staging/:sessionId');
  }
});

// PATCH /api/catalog/images/staging/:sessionId/:fileName — { originalName }
router.patch('/images/staging/:sessionId/:fileName', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!assertHasAnyFolderEdit(res, perms)) return;
    if (typeof req.body?.originalName !== 'string') {
      res.status(400).json({ success: false, error: 'originalName обовʼязковий' });
      return;
    }
    const data = await catalogMediaService.renameStagingFile(
      req.params.sessionId,
      req.params.fileName,
      req.body.originalName,
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PATCH /images/staging/:sessionId/:fileName');
  }
});

// DELETE /api/catalog/images/staging/:sessionId/:fileName
router.delete('/images/staging/:sessionId/:fileName', ...authOnly, async (req, res) => {
  try {
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    if (!assertHasAnyFolderEdit(res, perms)) return;
    await catalogMediaService.removeStagingFile(req.params.sessionId, req.params.fileName);
    res.json({ success: true, data: { removed: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/staging/:sessionId/:fileName');
  }
});

// POST /api/catalog/images/staging/:sessionId/commit — { goodId }
router.post('/images/staging/:sessionId/commit', ...authOnly, async (req, res) => {
  try {
    const goodId = String(req.body?.goodId || '');
    if (!goodId) {
      res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [goodId], index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [goodId], () => catalogMediaService.commitStaging(req.params.sessionId, goodId));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /images/staging/:sessionId/commit');
  }
});

// DELETE /api/catalog/images/:imageId
router.delete('/images/:imageId', ...authOnly, async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10);
    if (!Number.isFinite(imageId)) {
      res.status(400).json({ success: false, error: 'Невірний imageId' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const row = await prisma.catalogGoodImage.findUnique({
      where: { id: imageId },
      select: { goodId: true },
    });
    if (!row) {
      res.status(404).json({ success: false, error: 'Зображення не знайдено' });
      return;
    }
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [row.goodId], index)) return;
    await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [row.goodId], () => catalogMediaService.deleteImage(imageId));
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    handleError(res, error, 'DELETE /images/:imageId');
  }
});

// PATCH /api/catalog/images/:imageId — { isPrimary?: true, sortOrder?: number } or reorder via body.orderedIds on good
router.patch('/images/:imageId', ...authOnly, async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10);
    if (!Number.isFinite(imageId)) {
      res.status(400).json({ success: false, error: 'Невірний imageId' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const row = await prisma.catalogGoodImage.findUnique({
      where: { id: imageId },
      select: { goodId: true },
    });
    if (!row) {
      res.status(404).json({ success: false, error: 'Зображення не знайдено' });
      return;
    }
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [row.goodId], index)) return;
    if (req.body?.isPrimary === true) {
      const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [row.goodId], () => catalogMediaService.setPrimary(imageId));
      res.json({ success: true, data });
      return;
    }
    if (typeof req.body?.originalName === 'string') {
      const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [row.goodId], () => catalogMediaService.renameImage(imageId, req.body.originalName));
      res.json({ success: true, data });
      return;
    }
    res.status(400).json({ success: false, error: 'Підтримується isPrimary або originalName' });
  } catch (error) {
    handleError(res, error, 'PATCH /images/:imageId');
  }
});

// PUT /api/catalog/goods/:id/images/order — { orderedIds: number[] }
router.put('/goods/:id/images/order', ...authOnly, async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.map((n: unknown) => Number(n))
      : [];
    if (orderedIds.length === 0 || orderedIds.some((n: number) => !Number.isFinite(n))) {
      res.status(400).json({ success: false, error: 'orderedIds[] обовʼязковий' });
      return;
    }
    const perms = await assertCanUseCatalogApi(req, res);
    if (!perms) return;
    const index = await loadCatalogAclIndex();
    if (!assertItemsEdit(res, perms, [req.params.id], index)) return;
    const data = await trackCatalogAction(req, CATALOG_AUDIT_ACTIONS.IMAGES_CHANGED, [req.params.id], () => catalogMediaService.reorder(req.params.id, orderedIds));
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT /goods/:id/images/order');
  }
});

export default router;
