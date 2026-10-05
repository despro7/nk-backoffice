/**
 * Складські звіти: відомість по складу, рухи по товару (Dilovod).
 *
 * GET  /api/reports/warehouse-statement/meta
 * POST /api/reports/warehouse-statement
 * GET  /api/reports/product-movements/meta
 * POST /api/reports/product-movements
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermissionKey } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import type { WarehouseStatementQueryRequest } from '../../shared/types/warehouseStatement.js';
import type { ProductMovementsQueryRequest } from '../../shared/types/productMovements.js';
import {
  WarehouseStatementQueryError,
  warehouseStatementService,
} from '../services/dilovod/WarehouseStatementService.js';
import {
  ProductMovementsQueryError,
  productMovementsService,
} from '../services/dilovod/ProductMovementsService.js';

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
