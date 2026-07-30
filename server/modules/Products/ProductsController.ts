/**
 * Products 2.0 API — /api/catalog/*
 * minRole: WAREHOUSE_MANAGER
 */

import { Router, type Response } from 'express';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { logServer } from '../../lib/utils.js';
import { productsCatalogService } from './ProductsCatalogService.js';

const router = Router();
const guard = [authenticateToken, requireMinRole(ROLES.WAREHOUSE_MANAGER)] as const;

function handleError(res: Response, error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[ProductsCatalog] ${context}: ${message}`, error);
  const status = message.includes('не знайдено') || message.includes('не знайден') ? 404 : 500;
  res.status(status).json({ success: false, error: message });
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

// GET /api/catalog/search?q=
router.get('/search', ...guard, async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const data = await productsCatalogService.search(q);
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

// GET /api/catalog/goods/:id
router.get('/goods/:id', ...guard, async (req, res) => {
  try {
    const data = await productsCatalogService.getGoodDetail(req.params.id);
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
router.post('/refresh', ...guard, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : undefined;
    const data = await productsCatalogService.refreshFromDilovod(ids);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST /refresh');
  }
});

export default router;
