/**
 * Production (techcards, batches).
 *
 * GET /settings – any signed-in user (BOM editor needs loss type names and the formula)
 * PUT /settings – page.settings.production (admin has it implicitly)
 * GET /techcards, /techcards/:goodId, /techcards/:goodId/versions – page.production.techcards
 * PUT|DELETE /techcards/:goodId/draft, POST /techcards/:goodId/submit – + action.products.editSpec
 * POST /techcards/:goodId/approve|reject – + action.products.approveSpec (pair with the spec draft)
 * GET /batches, /batches/:id – page.production.batches
 * POST /batches, PATCH /batches/:id, POST /batches/:id/cancel – + action.production.batches.create
 * POST /batches/:id/stock/refresh, PUT /batches/:id/issue, POST /batches/:id/issue/sign – + batches.issue
 * POST /batches/:id/accept-production – + batches.acceptProduction
 * POST|PATCH /batches/:id/stages/:stageId[/start|/finish|/undo] – + batches.cook
 * PUT /batches/:id/output, POST /batches/:id/output/sign – + batches.acceptProduction
 * POST /batches/:id/accept-finished – + batches.acceptFinished; POST /batches/:id/close – + batches.create
 * POST /batches/:id/signatures/:sigId/revoke – page; власний підпис або batches.revokeAny
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { sendInsufficientRole } from '../middleware/requirePermission.js';
import { roleService } from '../services/RoleService.js';
import { PERMISSIONS, pageKey } from '../../shared/constants/permissions.js';
import {
  ProductionSettingsError,
  productionSettingsService as service,
} from '../modules/Production/ProductionSettingsService.js';
import { CatalogSpecError } from '../modules/Products/CatalogSpecService.js';
import { TechCardError, techCardService } from '../modules/Production/TechCardService.js';
import { ProductionBatchError, productionBatchService, type BatchActor } from '../modules/Production/ProductionBatchService.js';

const router = Router();
const SETTINGS_PAGE_KEY = pageKey('settings', 'production');
const TECHCARDS_PAGE_KEY = pageKey('production', 'techcards');
const BATCHES_PAGE_KEY = pageKey('production', 'batches');

// Дії варок (кроки реєструються тут, щоб усі з'явились у правах ролей)
const batchCreate = requirePermission('production', 'batches.create', 'Створювати і скасовувати варки');
const batchIssue = requirePermission('production', 'batches.issue', 'Видавати сировину на варку');
const batchAcceptProduction = requirePermission(
  'production',
  'batches.acceptProduction',
  'Приймати на виробництво і вносити факт виходу',
);
const batchCook = requirePermission('production', 'batches.cook', 'Відмічати етапи готування');
const batchAcceptFinished = requirePermission('production', 'batches.acceptFinished', 'Приймати продукцію варки на склад ГП');
requirePermission('production', 'batches.revokeAny', 'Відкликати будь-який підпис варки');

router.use(authenticateToken);

function sendError(res: Response, err: unknown) {
  if (err instanceof ProductionSettingsError || err instanceof TechCardError || err instanceof ProductionBatchError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  if (err instanceof CatalogSpecError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
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

async function canUse(req: Request, res: Response, key: string, message: string): Promise<boolean> {
  if (!(await canViewTechCards(req, res))) return false;
  if (await roleService.hasPermission(req.user!.role, key)) return true;
  sendInsufficientRole(res, message, { permissionKey: key });
  return false;
}

const canEdit = (req: Request, res: Response) =>
  canUse(req, res, PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC, 'Немає права редагувати техкарту');
const canApprove = (req: Request, res: Response) =>
  canUse(req, res, PERMISSIONS.ACTION_PRODUCTS_APPROVE_SPEC, 'Немає права затверджувати техкарту');

function userId(req: Request): number | null {
  const id = Number(req.user?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.put('/techcards/:goodId/draft', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.saveDraft(req.params.goodId, req.body?.payload, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/techcards/:goodId/draft', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.discardDraft(req.params.goodId, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/submit', async (req: Request, res: Response) => {
  if (!(await canEdit(req, res))) return;
  try {
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : '';
    res.json({ success: true, data: await techCardService.submit(req.params.goodId, comment, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/approve', async (req: Request, res: Response) => {
  if (!(await canApprove(req, res))) return;
  try {
    res.json({ success: true, data: await techCardService.approve(req.params.goodId, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/techcards/:goodId/reject', async (req: Request, res: Response) => {
  if (!(await canApprove(req, res))) return;
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    res.json({ success: true, data: await techCardService.reject(req.params.goodId, reason, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Варки ────────────────────────────────────────────────────────────────────

async function canViewBatches(req: Request, res: Response): Promise<boolean> {
  if (await roleService.hasPermission(req.user!.role, BATCHES_PAGE_KEY)) return true;
  sendInsufficientRole(res, 'Немає доступу до варок', { permissionKey: BATCHES_PAGE_KEY });
  return false;
}

function batchId(req: Request): number {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

router.get('/batches', async (req: Request, res: Response) => {
  if (!(await canViewBatches(req, res))) return;
  try {
    res.json({ success: true, data: await productionBatchService.list(req.query) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/batches/:id', async (req: Request, res: Response) => {
  if (!(await canViewBatches(req, res))) return;
  try {
    res.json({ success: true, data: await productionBatchService.getDetail(batchId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches', batchCreate, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.create(req.body ?? {}, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch('/batches/:id', batchCreate, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.updatePlan(batchId(req), req.body ?? {}, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/cancel', batchCreate, async (req: Request, res: Response) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    res.json({ success: true, data: await productionBatchService.cancel(batchId(req), reason, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

function stageId(req: Request): number {
  const id = Number(req.params.stageId);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

async function batchActor(req: Request): Promise<BatchActor> {
  return {
    userId: userId(req),
    roleLabel: req.user?.roleName || req.user?.role || null,
    canRevokeAny: await roleService.hasPermission(req.user!.role, PERMISSIONS.ACTION_PRODUCTION_BATCHES_REVOKE_ANY),
  };
}

router.post('/batches/:id/stock/refresh', batchIssue, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.refreshStock(batchId(req), userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/batches/:id/issue', batchIssue, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.saveIssue(batchId(req), req.body ?? {}) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/issue/sign', batchIssue, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.signIssue(batchId(req), req.body ?? {}, await batchActor(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/accept-production', batchAcceptProduction, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await productionBatchService.acceptProduction(batchId(req), req.body?.comment, await batchActor(req)),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/stages/:stageId/start', batchCook, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.startStage(batchId(req), stageId(req), userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/stages/:stageId/finish', batchCook, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await productionBatchService.finishStage(batchId(req), stageId(req), req.body ?? {}, userId(req)),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.patch('/batches/:id/stages/:stageId', batchCook, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.updateStage(batchId(req), stageId(req), req.body ?? {}, userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/stages/:stageId/undo', batchCook, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.undoStage(batchId(req), stageId(req), userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.put('/batches/:id/output', batchAcceptProduction, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.saveOutput(batchId(req), req.body ?? {}) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/output/sign', batchAcceptProduction, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.signOutput(batchId(req), req.body ?? {}, await batchActor(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/accept-finished', batchAcceptFinished, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await productionBatchService.acceptFinished(batchId(req), req.body?.comment, await batchActor(req)),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/close', batchCreate, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await productionBatchService.close(batchId(req), userId(req)) });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/batches/:id/signatures/:sigId/revoke', async (req: Request, res: Response) => {
  if (!(await canViewBatches(req, res))) return;
  try {
    const sigId = Number(req.params.sigId);
    res.json({
      success: true,
      data: await productionBatchService.revokeSignature(
        batchId(req),
        Number.isInteger(sigId) ? sigId : 0,
        req.body?.comment,
        await batchActor(req),
      ),
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
