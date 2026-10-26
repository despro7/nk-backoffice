/**
 * API master-шаблонів наліпок — /api/label-templates
 */

import { Router, type Response } from 'express';
import { authenticateToken, requirePermission, requireRole } from '../middleware/auth.js';
import { ROLES } from '../../shared/constants/roles.js';
import { logServer } from '../lib/utils.js';
import { labelTemplateService } from '../modules/Products/LabelTemplateService.js';
import { resolveLabelBaseInputs } from '../modules/Products/LabelInputResolver.js';
import { prisma } from '../lib/utils.js';
import type { LabelTemplateDefaults } from '../../shared/types/labelTemplate.js';

const router = Router();
const authOnly = [authenticateToken] as const;
const catalogManage = requirePermission('catalog', 'manage', 'Повний доступ до каталогу товарів');
const templateEditors = requireRole([ROLES.ADMIN, ROLES.BOSS]);

function handleError(res: Response, error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[LabelTemplates] ${context}: ${message}`, error);
  const status = message.includes('не знайдено')
    ? 404
    : message.includes('захищено') ||
        message.includes('дефолтом') ||
        message.includes('привʼязано')
      ? 409
      : 400;
  res.status(status).json({ success: false, error: message });
}

router.get('/', ...authOnly, catalogManage, async (req, res) => {
  try {
    const data = await labelTemplateService.list({
      audience: req.query.audience ? String(req.query.audience) : undefined,
      labelKind: req.query.labelKind ? String(req.query.labelKind) : undefined,
      includeArchived: req.query.archived === '1',
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET list');
  }
});

router.get('/defaults', ...authOnly, catalogManage, async (_req, res) => {
  try {
    const data = await labelTemplateService.getDefaults();
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET defaults');
  }
});

router.put('/defaults', ...authOnly, templateEditors, async (req, res) => {
  try {
    const data = await labelTemplateService.setDefaults(req.body as LabelTemplateDefaults);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT defaults');
  }
});

router.get('/preview-inputs', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = String(req.query.goodId || '').trim();
    const batchId = String(req.query.batchId || '').trim();
    const batchNumber = String(req.query.batchNumber || '').trim();
    const expiration =
      req.query.expiration != null ? String(req.query.expiration) : undefined;
    if (!goodId) {
      res.status(400).json({ success: false, error: 'goodId обовʼязковий' });
      return;
    }
    const good = await prisma.catalogGood.findUnique({
      where: { id: goodId },
      select: { id: true, name: true, sku: true, isGroup: true },
    });
    if (!good || good.isGroup) {
      res.status(404).json({ success: false, error: 'Товар не знайдено' });
      return;
    }
    const labelKindRaw = String(req.query.labelKind || 'portion').trim();
    const labelKind = labelKindRaw === 'box' ? 'box' : 'portion';
    const inputs = await resolveLabelBaseInputs({
      goodId,
      batchId,
      batchNumber,
      expiration,
      labelKind,
    });
    res.json({
      success: true,
      data: {
        goodId: good.id,
        name: good.name,
        sku: good.sku,
        inputs,
      },
    });
  } catch (error) {
    handleError(res, error, 'GET preview-inputs');
  }
});

router.post('/preview', ...authOnly, catalogManage, async (req, res) => {
  try {
    const templateId = String(req.body?.templateId || '');
    const inputs = (req.body?.inputs ?? {}) as Record<string, string>;
    if (!templateId) {
      res.status(400).json({ success: false, error: 'templateId обовʼязковий' });
      return;
    }
    const buffer = await labelTemplateService.preview(templateId, inputs);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="label-preview.pdf"');
    res.send(buffer);
  } catch (error) {
    handleError(res, error, 'POST preview');
  }
});

router.get('/:id/good-overrides', ...authOnly, catalogManage, async (req, res) => {
  try {
    const data = await labelTemplateService.listGoodOverrides(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET good-overrides');
  }
});

router.get('/:id', ...authOnly, catalogManage, async (req, res) => {
  try {
    const data = await labelTemplateService.get(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET one');
  }
});

router.post('/', ...authOnly, templateEditors, async (req, res) => {
  try {
    const data = await labelTemplateService.create(
      {
        name: String(req.body?.name || ''),
        labelKind: String(req.body?.labelKind || 'portion'),
        audience: String(req.body?.audience || 'good'),
        template: req.body?.template,
        isDeletionLocked:
          req.body?.isDeletionLocked != null ? Boolean(req.body.isDeletionLocked) : undefined,
        iconKey: req.body?.iconKey !== undefined ? req.body.iconKey : undefined,
      },
      req.user?.userId ?? null,
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST');
  }
});

router.put('/:id', ...authOnly, templateEditors, async (req, res) => {
  try {
    const data = await labelTemplateService.update(
      req.params.id,
      {
        name: req.body?.name != null ? String(req.body.name) : undefined,
        labelKind: req.body?.labelKind != null ? String(req.body.labelKind) : undefined,
        audience: req.body?.audience != null ? String(req.body.audience) : undefined,
        template: req.body?.template,
        isDeletionLocked:
          req.body?.isDeletionLocked != null ? Boolean(req.body.isDeletionLocked) : undefined,
        iconKey: req.body?.iconKey !== undefined ? req.body.iconKey : undefined,
      },
      req.user?.userId ?? null,
    );
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT');
  }
});

router.post('/:id/duplicate', ...authOnly, templateEditors, async (req, res) => {
  try {
    const data = await labelTemplateService.duplicate(req.params.id, req.user?.userId ?? null);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST duplicate');
  }
});

router.delete('/:id', ...authOnly, templateEditors, async (req, res) => {
  try {
    await labelTemplateService.archive(req.params.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'DELETE');
  }
});

export default router;
