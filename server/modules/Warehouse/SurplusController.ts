import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  canEditWarehouseReleaseHistory,
  WAREHOUSE_HISTORY_EDIT_DENIED_MESSAGE,
} from '../../../shared/utils/releaseHistoryAccess.js';
import { WAREHOUSE_SURPLUS_DOC_TYPE } from '../../../shared/types/warehouseGoodDocument.js';
import { surplusHistorySyncService } from './WarehouseGoodDocumentHistorySync.js';
import {
  listGoodDocumentHistory,
  parseGoodDocHistoryListQuery,
} from './warehouseGoodDocumentHistoryList.js';
import { warehouseSurplusAuditService } from './WarehouseSurplusAuditService.js';
import {
  appendDilovodRemark,
  buildEditRemarkNote,
  buildGoodDocumentPayload,
  buildGoodDocumentUpdateDiff,
  enrichWriteOffItems,
  extractDilovodRemarkFromItems,
  formatLocalDateTime,
  getEditorLabel,
  mergeDilovodRemarkIntoItems,
  parseLocalDate,
} from './warehouseGoodDocumentUtils.js';

const router = Router();
const warehouseOperate = requirePermission('warehouse', 'operate', 'Створювати/відправляти складські документи');
const warehouseHistoryDelete = requirePermission('warehouse', 'history.delete', 'Видаляти історію складських документів');

function isSurplusHistoryAdmin(req: { user?: { role?: string } }): boolean {
  return req.user?.role === ROLES.ADMIN;
}

function getRequestUserId(req: { user?: { userId?: number; id?: number } }): number | null {
  const raw = req.user?.userId ?? req.user?.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function assertCanEditSurplusRecord(
  req: { user?: { role?: string; userId?: number; id?: number } },
  record: { createdAt: Date; createdBy: number },
): void {
  const allowed = canEditWarehouseReleaseHistory({
    isAdmin: isSurplusHistoryAdmin(req),
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    currentUserId: getRequestUserId(req),
  });
  if (!allowed) {
    throw new Error(WAREHOUSE_HISTORY_EDIT_DENIED_MESSAGE);
  }
}

router.post('/send', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const { items, comment, reason, customReason, firmId, storageId, date, dryRun } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required' });
    }

    const { getDilovodConfigFromDB, getDilovodUserId } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodConfig = await getDilovodConfigFromDB();
    const baseDate = parseLocalDate(date) || new Date();
    const resolvedStorage = storageId ?? dilovodConfig.smallStorageId ?? dilovodConfig.mainStorageId ?? null;
    const resolvedFirm = firmId ?? dilovodConfig.defaultFirmId ?? null;
    const reasonLabel = String(reason || '').replace(/[^\p{L}\p{N}\s\-]/gu, '').trim();

    let authorDilovodId: string | null = null;
    try {
      const currentUserId = (req as any).user?.userId || (req as any).user?.id;
      authorDilovodId = await getDilovodUserId(currentUserId, { logPrefix: '[Surplus] ' });
    } catch (e) {
      console.warn('[Surplus] Failed to resolve author:', e);
    }

    const { payload } = await buildGoodDocumentPayload({
      docType: WAREHOUSE_SURPLUS_DOC_TYPE,
      saveType: 1,
      items,
      reason: reasonLabel,
      comment: String(comment || '').trim(),
      firmId: resolvedFirm,
      storageId: resolvedStorage,
      date: baseDate,
      includeAccCosts: false,
      authorDilovodId,
    });

    const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
    const exportResult = await dilovodExportFlowService.send({
      payload,
      dryRun,
      warnings: [],
      label: '[Surplus]',
    });

    if (exportResult.dryRun) {
      return res.json(await dilovodExportFlowService.preview({ payload, warnings: [], label: '[Surplus]' }));
    }

    if (!exportResult.success) {
      const { getDilovodExportErrorMessage } = await import('../../services/dilovod/DilovodUtils.js');
      const message = getDilovodExportErrorMessage(exportResult.dilovodResponse || exportResult.error);
      return res.status(422).json({ success: false, error: message, dilovodResponse: exportResult.dilovodResponse });
    }

    const result = exportResult.dilovodResponse;
    const surplusNumber = result?.id ?? exportResult.dilovodDocId ?? null;

    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
      const dilovodServiceLocal = new DilovodService();
      const enrichedItems = await enrichWriteOffItems(items, resolvedFirm, baseDate, dilovodServiceLocal);
      const header = (payload as any).header ?? {};
      await prisma.warehouseSurplusHistory.create({
        data: {
          surplusNumber: surplusNumber ? String(surplusNumber) : null,
          docNumber: result?.number ?? result?.header?.number ?? null,
          firmId: resolvedFirm,
          storageId: resolvedStorage,
          surplusDate: baseDate,
          items: JSON.stringify(enrichedItems),
          surplusReason: reasonLabel || '',
          customReason: customReason || null,
          comment: comment || null,
          remark: header.remark ? String(header.remark) : null,
          source: 'local',
          status: 'created',
          payload: JSON.stringify(payload),
          createdBy: userId || 0,
        },
      });
    } catch (historyErr) {
      console.warn('[Surplus] Failed to save history:', historyErr);
    }

    res.json({ success: true, payload, dilovodResponse: result, surplusNumber });
  } catch (error) {
    console.error('[Surplus] send error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const listQuery = parseGoodDocHistoryListQuery(req);
    const shouldSync = String(req.query.sync ?? '') === 'true';
    const forceFullList = String(req.query.forceFullList ?? '') === 'true';
    if (shouldSync && listQuery.status === 'active') {
      try {
        await surplusHistorySyncService.sync({ listQuery, forceFullList });
      } catch (syncErr) {
        console.warn('[Surplus] sync failed:', syncErr);
      }
    }
    const result = await listGoodDocumentHistory('surplus', listQuery);
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    console.error('[Surplus] history error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/history/:id/details', authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const force = req.query.force === 'true';
    const details = await surplusHistorySyncService.loadDetails(id, { force });
    res.json({ success: true, data: details });
  } catch (error) {
    console.error('[Surplus] history details error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

router.patch('/history/:id', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }

    const existing = await prisma.warehouseSurplusHistory.findUnique({ where: { id } });
    if (!existing || existing.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    assertCanEditSurplusRecord(req, existing);

    const bodyItems = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!bodyItems?.length) {
      return res.status(400).json({ success: false, error: 'items are required' });
    }

    const userId = Number((req as any).user?.userId || (req as any).user?.id) || null;
    const { getDilovodConfigFromDB, getDilovodUserId, getDilovodExportErrorMessage } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodConfig = await getDilovodConfigFromDB();

    const nextDate = parseLocalDate(req.body?.date ?? req.body?.surplusDate) ?? existing.surplusDate ?? new Date();
    const nextStorage = req.body?.storageId != null && String(req.body.storageId).trim() !== ''
      ? String(req.body.storageId).trim()
      : existing.storageId;
    const nextFirm = req.body?.firmId != null && String(req.body.firmId).trim() !== ''
      ? String(req.body.firmId).trim()
      : existing.firmId ?? dilovodConfig.defaultFirmId ?? null;
    const nextReason = req.body?.reason != null
      ? String(req.body.reason).replace(/[^\p{L}\p{N}\s\-]/gu, '').trim()
      : existing.surplusReason;
    const nextCustomReason = req.body?.customReason !== undefined
      ? (req.body.customReason == null ? null : String(req.body.customReason))
      : existing.customReason;
    const nextComment = req.body?.comment !== undefined
      ? (req.body.comment == null ? null : String(req.body.comment))
      : existing.comment;

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const enrichedItems = await enrichWriteOffItems(bodyItems, nextFirm, nextDate, new DilovodService());

    const before = {
      surplusDate: existing.surplusDate ? formatLocalDateTime(existing.surplusDate) : '',
      comment: existing.comment,
      surplusReason: existing.surplusReason,
      storageId: existing.storageId,
      firmId: existing.firmId,
      items: existing.items,
    };
    const after = {
      surplusDate: formatLocalDateTime(nextDate),
      comment: nextComment,
      surplusReason: nextReason,
      storageId: nextStorage,
      firmId: nextFirm,
      items: JSON.stringify(enrichedItems),
    };
    const changes = buildGoodDocumentUpdateDiff(before, after, [
      'surplusDate',
      'comment',
      'surplusReason',
      'storageId',
      'firmId',
      'items',
    ]);

    let nextRemark = existing.remark;
    let nextItemsJson = JSON.stringify(enrichedItems);
    const dilovodDocId = existing.surplusNumber ? String(existing.surplusNumber).trim() : '';

    if (dilovodDocId && changes.length > 0) {
      const editorLabel = await getEditorLabel(userId);
      const remarkNote = buildEditRemarkNote(editorLabel, changes);
      const previousRemark = extractDilovodRemarkFromItems(existing.items) ?? existing.remark;
      const mergedRemark = appendDilovodRemark(previousRemark, remarkNote);

      let authorDilovodId: string | null = null;
      try {
        authorDilovodId = await getDilovodUserId(userId, { logPrefix: '[Surplus][patch] ' });
      } catch {
        authorDilovodId = null;
      }

      const { payload } = await buildGoodDocumentPayload({
        docType: WAREHOUSE_SURPLUS_DOC_TYPE,
        dilovodDocId,
        saveType: 2,
        items: bodyItems,
        reason: nextReason,
        comment: String(nextComment ?? '').trim(),
        firmId: nextFirm,
        storageId: nextStorage,
        date: nextDate,
        includeAccCosts: false,
        authorDilovodId,
      });
      (payload as any).header.remark = mergedRemark;

      const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
      const exportResult = await dilovodExportFlowService.send({
        payload,
        dryRun: false,
        warnings: [],
        label: '[Surplus][patch]',
      });
      if (!exportResult.success) {
        const message = exportResult.dilovodResponse
          ? getDilovodExportErrorMessage(exportResult.dilovodResponse)
          : String(exportResult.error || 'Dilovod error');
        return res.status(422).json({ success: false, error: message });
      }
      nextRemark = mergedRemark;
      nextItemsJson = mergeDilovodRemarkIntoItems(JSON.stringify(enrichedItems), mergedRemark);
    }

    const updated = await prisma.warehouseSurplusHistory.update({
      where: { id },
      data: {
        surplusDate: nextDate,
        storageId: nextStorage,
        firmId: nextFirm,
        surplusReason: nextReason,
        customReason: nextCustomReason,
        comment: nextComment,
        remark: nextRemark,
        items: nextItemsJson,
      },
    });

    await warehouseSurplusAuditService.log({
      surplusId: id,
      action: 'surplus_updated',
      userId,
      payload: { changes } as Prisma.InputJsonValue,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('недоступне') ? 403 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

/** GET /api/warehouse/surplus/history/:id/audit */
router.get('/history/:id/audit', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await prisma.warehouseSurplusHistory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const logs = await warehouseSurplusAuditService.list(id);
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('[Surplus] audit list error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/history/:id', authenticateToken, warehouseHistoryDelete, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const record = await prisma.warehouseSurplusHistory.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });

    const { forceLocal } = req.query;
    if (String(forceLocal) === 'true') {
      await prisma.warehouseSurplusHistory.update({ where: { id }, data: { status: 'deleted' } });
      return res.json({ success: true });
    }

    if (record.surplusNumber) {
      const payload: any = { saveType: 2, header: { id: record.surplusNumber, delMark: 1 } };
      const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
      const exportResult = await dilovodExportFlowService.send({ payload, dryRun: false, warnings: [], label: '[Surplus]' });
      if (!exportResult.success) {
        const msg = String(exportResult.error || exportResult.dilovodResponse?.error || 'Unknown error');
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('не знайден')) {
          return res.status(422).json({ success: false, error: msg, canDeleteLocal: true });
        }
        return res.status(422).json({ success: false, error: msg });
      }
    }

    await prisma.warehouseSurplusHistory.update({ where: { id }, data: { status: 'deleted' } });
    res.json({ success: true });
  } catch (error) {
    console.error('[Surplus] delete error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
