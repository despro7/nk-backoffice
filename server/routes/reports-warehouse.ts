/**
 * Складські звіти: відомість по складу, рухи по товару (Dilovod).
 *
 * GET  /api/reports/warehouse-statement/meta
 * POST /api/reports/warehouse-statement
 * POST /api/reports/warehouse-statement/history
 * GET|POST /api/reports/warehouse-statement/presets, PATCH|DELETE /api/reports/warehouse-statement/presets/:id
 * GET  /api/reports/product-movements/meta
 * POST /api/reports/product-movements
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermissionKey } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import type {
  WarehouseStatementHistoryRequest,
  WarehouseStatementPresetCreateRequest,
  WarehouseStatementPresetUpdateRequest,
  WarehouseStatementQueryRequest,
} from '../../shared/types/warehouseStatement.js';
import type { ProductMovementsQueryRequest } from '../../shared/types/productMovements.js';
import {
  WarehouseStatementQueryError,
  warehouseStatementService,
} from '../services/dilovod/WarehouseStatementService.js';
import {
  ProductMovementsQueryError,
  productMovementsService,
} from '../services/dilovod/ProductMovementsService.js';
import { warehouseStatementHistoryService } from '../services/dilovod/WarehouseStatementHistoryService.js';
import {
  WarehouseStatementPresetError,
  warehouseStatementPresetsService,
  type PresetActor,
} from '../modules/Reports/warehouseStatementPresets.js';

const router = Router();
const warehouseStatementAccess = requirePermissionKey(PERMISSIONS.PAGE_REPORTS_WAREHOUSE_STATEMENT);
const productMovementsAccess = requirePermissionKey(PERMISSIONS.PAGE_REPORTS_PRODUCT_MOVEMENTS);

router.get(
  '/warehouse-statement/meta',
  authenticateToken,
  warehouseStatementAccess,
  async (_req: Request, res: Response) => {
    try {
      const data = await warehouseStatementService.getMeta();
      res.json(data);
    } catch (error) {
      logServer('[reports/warehouse-statement] GET meta failed', error);
      const message = error instanceof Error ? error.message : 'Не вдалося завантажити метадані відомості';
      res.status(500).json({ success: false, error: message, message });
    }
  },
);

router.post(
  '/warehouse-statement',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as WarehouseStatementQueryRequest;
      const data = await warehouseStatementService.query(body);
      res.json(data);
    } catch (error) {
      if (error instanceof WarehouseStatementQueryError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          message: error.message,
        });
      }
      logServer('[reports/warehouse-statement] POST failed', error);
      const message = error instanceof Error ? error.message : 'Не вдалося сформувати відомість';
      res.status(500).json({ success: false, error: message, message });
    }
  },
);

router.post(
  '/warehouse-statement/history',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as WarehouseStatementHistoryRequest;
      const data = await warehouseStatementHistoryService.history(body);
      res.json(data);
    } catch (error) {
      if (error instanceof WarehouseStatementQueryError) {
        return res.status(error.statusCode).json({ success: false, error: error.message, message: error.message });
      }
      logServer('[reports/warehouse-statement] POST history failed', error);
      const message = error instanceof Error ? error.message : 'Не вдалося завантажити історію товару';
      res.status(500).json({ success: false, error: message, message });
    }
  },
);

function presetActor(req: Request): PresetActor {
  const user = req.user!;
  return {
    userId: user.userId,
    name: user.name || user.email || `#${user.userId}`,
    isAdmin: user.role === 'admin',
  };
}

function parsePresetId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function sendPresetError(res: Response, error: unknown, fallback: string, logLabel: string) {
  if (error instanceof WarehouseStatementPresetError) {
    return res.status(error.statusCode).json({ success: false, error: error.message, message: error.message });
  }
  logServer(logLabel, error);
  const message = error instanceof Error ? error.message : fallback;
  return res.status(500).json({ success: false, error: message, message });
}

router.get(
  '/warehouse-statement/presets',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    try {
      const data = await warehouseStatementPresetsService.list(presetActor(req));
      res.json(data);
    } catch (error) {
      sendPresetError(res, error, 'Не вдалося завантажити пресети', '[reports/warehouse-statement] GET presets failed');
    }
  },
);

router.post(
  '/warehouse-statement/presets',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as WarehouseStatementPresetCreateRequest;
      const data = await warehouseStatementPresetsService.create(presetActor(req), body);
      res.status(201).json(data);
    } catch (error) {
      sendPresetError(res, error, 'Не вдалося зберегти пресет', '[reports/warehouse-statement] POST preset failed');
    }
  },
);

router.patch(
  '/warehouse-statement/presets/:id',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    const id = parsePresetId(req);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Некоректний id пресету', message: 'Некоректний id пресету' });
    }
    try {
      const body = (req.body ?? {}) as WarehouseStatementPresetUpdateRequest;
      const data = await warehouseStatementPresetsService.update(presetActor(req), id, body);
      res.json(data);
    } catch (error) {
      sendPresetError(res, error, 'Не вдалося оновити пресет', '[reports/warehouse-statement] PATCH preset failed');
    }
  },
);

router.delete(
  '/warehouse-statement/presets/:id',
  authenticateToken,
  warehouseStatementAccess,
  async (req: Request, res: Response) => {
    const id = parsePresetId(req);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Некоректний id пресету', message: 'Некоректний id пресету' });
    }
    try {
      await warehouseStatementPresetsService.remove(presetActor(req), id);
      res.json({ success: true });
    } catch (error) {
      sendPresetError(res, error, 'Не вдалося видалити пресет', '[reports/warehouse-statement] DELETE preset failed');
    }
  },
);

router.get(
  '/product-movements/meta',
  authenticateToken,
  productMovementsAccess,
  async (_req: Request, res: Response) => {
    try {
      const data = await productMovementsService.getMeta();
      res.json(data);
    } catch (error) {
      logServer('[reports/product-movements] GET meta failed', error);
      const message = error instanceof Error ? error.message : 'Не вдалося завантажити метадані рухів';
      res.status(500).json({ success: false, error: message, message });
    }
  },
);

router.post(
  '/product-movements',
  authenticateToken,
  productMovementsAccess,
  async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as ProductMovementsQueryRequest;
      const data = await productMovementsService.query(body);
      res.json(data);
    } catch (error) {
      if (error instanceof ProductMovementsQueryError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          message: error.message,
        });
      }
      logServer('[reports/product-movements] POST failed', error);
      const message = error instanceof Error ? error.message : 'Не вдалося сформувати рухи по товару';
      res.status(500).json({ success: false, error: message, message });
    }
  },
);

export default router;
