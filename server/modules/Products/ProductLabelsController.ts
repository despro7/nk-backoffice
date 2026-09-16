/**
 * API наліпок товару — /api/products/:goodId/labels/*
 */

import { Router, type Response } from 'express';
import { authenticateToken, requirePermission, requireRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { prisma, logServer } from '../../lib/utils.js';
import { catalogLabelService } from './CatalogLabelService.js';
import type { ProductLabelPayload } from '../../../shared/types/productLabel.js';
import { parseProductLabelPayload } from '../../../shared/utils/productLabel.js';

const router = Router();
const authOnly = [authenticateToken] as const;
const catalogManage = requirePermission('catalog', 'manage', 'Каталог Товари 2.0');

function handleError(res: Response, error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[ProductLabels] ${context}: ${message}`, error);
  const status =
    message.includes('не знайдено') || message.includes('не знайден') ? 404 : 400;
  res.status(status).json({ success: false, error: message });
}

async function assertGoodExists(goodId: string): Promise<void> {
  const good = await prisma.catalogGood.findUnique({
    where: { id: goodId },
    select: { id: true, isGroup: true },
  });
  if (!good || good.isGroup) {
    throw new Error('Товар не знайдено');
  }
}

// GET /api/products/:goodId/labels/draft?batchId=&labelKind=
router.get('/:goodId/labels/draft', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const batchId = String(req.query.batchId || '').trim();
    const labelKind = catalogLabelService.assertLabelKind(String(req.query.labelKind || 'portion'));
    if (!batchId) {
      res.status(400).json({ success: false, error: 'batchId обовʼязковий' });
      return;
    }
    await assertGoodExists(goodId);
    const data = await catalogLabelService.getDraft(goodId, batchId, labelKind);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET draft');
  }
});

// PUT /api/products/:goodId/labels/draft
router.put('/:goodId/labels/draft', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const batchId = String(req.body?.batchId || '').trim();
    const labelKind = catalogLabelService.assertLabelKind(String(req.body?.labelKind || 'portion'));
    const batchNumber = String(req.body?.batchNumber || '').trim();
    const payload = parseProductLabelPayload(req.body?.payload);
    if (!batchId || !batchNumber || !payload) {
      res.status(400).json({ success: false, error: 'batchId, batchNumber та payload обовʼязкові' });
      return;
    }
    const data = await catalogLabelService.saveDraft(goodId, {
      batchId,
      labelKind,
      batchNumber,
      payload,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT draft');
  }
});

// GET /api/products/:goodId/labels/published?batchId=&labelKind=
router.get('/:goodId/labels/published', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const batchId = String(req.query.batchId || '').trim();
    const labelKind = catalogLabelService.assertLabelKind(String(req.query.labelKind || 'portion'));
    if (!batchId) {
      res.status(400).json({ success: false, error: 'batchId обовʼязковий' });
      return;
    }
    await assertGoodExists(goodId);
    const data = await catalogLabelService.listPublished(goodId, batchId, labelKind);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET published');
  }
});

// GET /api/products/:goodId/labels/published/latest?labelKind=
router.get('/:goodId/labels/published/latest', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const labelKind = catalogLabelService.assertLabelKind(String(req.query.labelKind || 'portion'));
    await assertGoodExists(goodId);
    const data = await catalogLabelService.getLatestPublished(goodId, labelKind);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'GET published latest');
  }
});

// DELETE /api/products/:goodId/labels/published/:id
router.delete('/:goodId/labels/published/:id', ...authOnly, requireRole([ROLES.ADMIN]), catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const labelId = parseInt(req.params.id, 10);
    if (!Number.isFinite(labelId)) {
      res.status(400).json({ success: false, error: 'Невірний id' });
      return;
    }
    await assertGoodExists(goodId);
    await catalogLabelService.deletePublished(goodId, labelId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'DELETE published');
  }
});

// GET /api/products/:goodId/labels/published/:id/pdf
router.get('/:goodId/labels/published/:id/pdf', ...authOnly, catalogManage, async (req, res) => {
  try {
    const labelId = parseInt(req.params.id, 10);
    if (!Number.isFinite(labelId)) {
      res.status(400).json({ success: false, error: 'Невірний id' });
      return;
    }
    const row = await prisma.catalogProductLabel.findUnique({
      where: { id: labelId },
      select: { goodId: true },
    });
    if (!row || row.goodId !== req.params.goodId) {
      res.status(404).json({ success: false, error: 'Версію наліпки не знайдено' });
      return;
    }
    const { buffer, fileName } = await catalogLabelService.getPublishedPdfBuffer(labelId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (error) {
    handleError(res, error, 'GET pdf');
  }
});

// POST /api/products/:goodId/labels/published/generate
router.post('/:goodId/labels/published/generate', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const payload = parseProductLabelPayload(req.body?.payload) as ProductLabelPayload | null;
    if (!payload) {
      res.status(400).json({ success: false, error: 'payload обовʼязковий' });
      return;
    }
    const userId = req.user?.userId ?? null;
    const data = await catalogLabelService.generatePublished(goodId, payload, userId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST generate');
  }
});

// POST /api/products/:goodId/labels/seed
router.post('/:goodId/labels/seed', ...authOnly, catalogManage, async (req, res) => {
  try {
    const goodId = req.params.goodId;
    const batchId = String(req.body?.batchId || '').trim();
    const labelKind = catalogLabelService.assertLabelKind(String(req.body?.labelKind || 'portion'));
    const batchNumber = String(req.body?.batchNumber || '').trim();
    const expiration =
      req.body?.expiration != null ? String(req.body.expiration) : undefined;
    if (!batchId || !batchNumber) {
      res.status(400).json({ success: false, error: 'batchId та batchNumber обовʼязкові' });
      return;
    }
    const data = await catalogLabelService.seedDraft(goodId, {
      batchId,
      labelKind,
      batchNumber,
      expiration,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST seed');
  }
});

export default router;
