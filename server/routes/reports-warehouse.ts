/**
 * Складські звіти: відомість по складу (BAT Dilovod).
 *
 * GET  /api/reports/warehouse-statement/meta
 * POST /api/reports/warehouse-statement
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermissionKey } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import type { WarehouseStatementQueryRequest } from '../../shared/types/warehouseStatement.js';
import {
  WarehouseStatementQueryError,
  warehouseStatementService,
} from '../services/dilovod/WarehouseStatementService.js';

const router = Router();
const pageAccess = requirePermissionKey(PERMISSIONS.PAGE_REPORTS_WAREHOUSE_STATEMENT);

router.get(
  '/warehouse-statement/meta',
  authenticateToken,
  pageAccess,
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
  pageAccess,
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

export default router;
