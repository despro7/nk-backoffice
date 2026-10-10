import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  canEditWarehouseReleaseHistory,
  WAREHOUSE_HISTORY_EDIT_DENIED_MESSAGE,
} from '../../../shared/utils/releaseHistoryAccess.js';
import {
  WAREHOUSE_WRITE_OFF_DOC_MODE,
  WAREHOUSE_WRITE_OFF_DOC_TYPE,
} from '../../../shared/types/warehouseGoodDocument.js';
import { writeOffHistorySyncService } from './WarehouseGoodDocumentHistorySync.js';
import {
  listGoodDocumentHistory,
  parseGoodDocHistoryListQuery,
} from './warehouseGoodDocumentHistoryList.js';
import { warehouseWriteOffAuditService } from './WarehouseWriteOffAuditService.js';
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

function isWriteOffHistoryAdmin(req: { user?: { role?: string } }): boolean {
  return req.user?.role === ROLES.ADMIN;
}

function getRequestUserId(req: { user?: { userId?: number; id?: number } }): number | null {
  const raw = req.user?.userId ?? req.user?.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function assertCanEditWriteOffRecord(
  req: { user?: { role?: string; userId?: number; id?: number } },
  record: { createdAt: Date; createdBy: number },
): void {
  const allowed = canEditWarehouseReleaseHistory({
    isAdmin: isWriteOffHistoryAdmin(req),
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    currentUserId: getRequestUserId(req),
  });
  if (!allowed) {
    throw new Error(WAREHOUSE_HISTORY_EDIT_DENIED_MESSAGE);
  }
}


/**
 * POST /api/warehouse/writeoff/send
 * Відправка документа списання в Діловод
 */
router.post('/send', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const { orderId, items, comment, reason, customReason, firmId, storageId, date, dryRun } = req.body;

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
      authorDilovodId = await getDilovodUserId(currentUserId, { logPrefix: '[WriteOff] ' });
    } catch (e) {
      console.warn('[WriteOff] Failed to resolve author dilovod id:', e);
    }

    const { payload } = await buildGoodDocumentPayload({
      docType: WAREHOUSE_WRITE_OFF_DOC_TYPE,
      docMode: WAREHOUSE_WRITE_OFF_DOC_MODE,
      saveType: 1,
      items,
      reason: reasonLabel,
      comment: String(comment || '').trim(),
      firmId: resolvedFirm,
      storageId: resolvedStorage,
      date: baseDate,
      includeAccCosts: true,
      authorDilovodId,
    });

    const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
    const exportResult = await dilovodExportFlowService.send({
      payload,
      dryRun,
      warnings: [],
      label: '[WriteOff]',
    });

    if (exportResult.dryRun) {
      return res.json(await dilovodExportFlowService.preview({ payload, warnings: [], label: '[WriteOff]' }));
    }

    if (!exportResult.success) {
      const { getDilovodExportErrorMessage, translateDilovodError } = await import('../../services/dilovod/DilovodUtils.js');
      const result = exportResult.dilovodResponse;
      const rawError = exportResult.error || result?.error || result?.message || 'Dilovod error';
      const shortMsg = getDilovodExportErrorMessage(result || rawError);
      const translated = exportResult.translatedError ?? translateDilovodError(String(rawError));

      try {
        const { prisma } = await import('../../lib/utils.js');
        await prisma.meta_logs.create({ data: {
          category: 'dilovod', title: 'WriteOff export failed', status: 'error', message: shortMsg, data: { payload, result } as Prisma.InputJsonValue, initiatedBy: (req as any).user?.userId ? String((req as any).user.userId) : 'unknown'
        } });
      } catch (metaErr) {
        console.warn('[WriteOff] Failed to write meta log:', metaErr);
      }

      const lower = String(rawError).toLowerCase();
      if (lower.includes('access') || lower.includes('access for object') || lower.includes('access denied')) {
        return res.status(422).json({ success: false, error: `Доступ заборонено в Dilovod для типу документа. ${translated.message} Перевірте права користувача/API-ключа або налаштування документів в Dilovod.`, dilovodResponse: result });
      }

      return res.status(422).json({ success: false, error: shortMsg || String(rawError), dilovodResponse: result });
    }

    const result = exportResult.dilovodResponse;
    const writeOffNumber = result?.id ?? exportResult.dilovodDocId ?? null;

    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const writeOffDateObj = baseDate;
      const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
      const dilovodServiceLocal = new DilovodService();
      const enrichedItems = await enrichWriteOffItems(items, resolvedFirm, baseDate, dilovodServiceLocal);
      const header = (payload as any).header ?? {};
      const remark = header.remark ? String(header.remark) : null;

      await prisma.warehouseWriteOffHistory.create({
        data: {
          writeOffNumber: writeOffNumber ? String(writeOffNumber) : null,
          docNumber: result?.number ?? result?.header?.number ?? null,
          firmId: resolvedFirm,
          storageId: resolvedStorage,
          writeOffDate: writeOffDateObj,
          items: JSON.stringify(enrichedItems),
          writeOffReason: reasonLabel || '',
          customReason: customReason || null,
          comment: comment || null,
          remark,
          source: 'local',
          status: 'created',
          payload: JSON.stringify(payload),
          createdBy: userId || 0,
        },
      });
    } catch (historyErr) {
      console.warn('[WriteOff] Failed to save history record:', historyErr);
    }

    res.json({ success: true, payload, dilovodResponse: result, writeOffNumber });
  } catch (error) {
    console.error('[WriteOff] Error sending write-off:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * GET /api/warehouse/writeoff/history
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const listQuery = parseGoodDocHistoryListQuery(req);
    const shouldSync = String(req.query.sync ?? '') === 'true';
    const forceFullList = String(req.query.forceFullList ?? '') === 'true';
    if (shouldSync && listQuery.status === 'active') {
      try {
        await writeOffHistorySyncService.sync({ listQuery, forceFullList });
      } catch (syncErr) {
        console.warn('[WriteOff] Dilovod history sync failed:', syncErr);
      }
    }
    const result = await listGoodDocumentHistory('writeOff', listQuery);
    res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    console.error('[WriteOff] Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/warehouse/writeoff/history/:id/details
 * ?force=true — примусово оновити tpGoods з Dilovod
 */
router.get('/history/:id/details', authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const force = req.query.force === 'true';
    const details = await writeOffHistorySyncService.loadDetails(id, { force });
    res.json({ success: true, data: details });
  } catch (error) {
    console.error('[WriteOff] history details error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * PATCH /api/warehouse/writeoff/history/:id
 */
router.patch('/history/:id', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }

    const existing = await prisma.warehouseWriteOffHistory.findUnique({ where: { id } });
    if (!existing || existing.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    assertCanEditWriteOffRecord(req, existing);

    const bodyItems = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!bodyItems || bodyItems.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required' });
    }

    const userId = Number((req as any).user?.userId || (req as any).user?.id) || null;
    const { getDilovodConfigFromDB, getDilovodUserId, getDilovodExportErrorMessage } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodConfig = await getDilovodConfigFromDB();

    const nextDate = parseLocalDate(req.body?.date ?? req.body?.writeOffDate) ?? existing.writeOffDate ?? new Date();
    const nextStorage = req.body?.storageId != null && String(req.body.storageId).trim() !== ''
      ? String(req.body.storageId).trim()
      : existing.storageId;
    const nextFirm = req.body?.firmId != null && String(req.body.firmId).trim() !== ''
      ? String(req.body.firmId).trim()
      : existing.firmId ?? dilovodConfig.defaultFirmId ?? null;
    const nextReason = req.body?.reason != null
      ? String(req.body.reason).replace(/[^\p{L}\p{N}\s\-]/gu, '').trim()
      : existing.writeOffReason;
    const nextCustomReason = req.body?.customReason !== undefined
      ? (req.body.customReason == null ? null : String(req.body.customReason))
      : existing.customReason;
    const nextComment = req.body?.comment !== undefined
      ? (req.body.comment == null ? null : String(req.body.comment))
      : existing.comment;

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodServiceLocal = new DilovodService();
    const enrichedItems = await enrichWriteOffItems(bodyItems, nextFirm, nextDate, dilovodServiceLocal);

    const before = {
      writeOffDate: existing.writeOffDate ? formatLocalDateTime(existing.writeOffDate) : '',
      comment: existing.comment,
      writeOffReason: existing.writeOffReason,
      storageId: existing.storageId,
      firmId: existing.firmId,
      items: existing.items,
    };
    const after = {
      writeOffDate: formatLocalDateTime(nextDate),
      comment: nextComment,
      writeOffReason: nextReason,
      storageId: nextStorage,
      firmId: nextFirm,
      items: JSON.stringify(enrichedItems),
    };
    const changes = buildGoodDocumentUpdateDiff(before, after, [
      'writeOffDate',
      'comment',
      'writeOffReason',
      'storageId',
      'firmId',
      'items',
    ]);

    let nextRemark = existing.remark;
    let nextItemsJson = JSON.stringify(enrichedItems);

    const dilovodDocId = existing.writeOffNumber ? String(existing.writeOffNumber).trim() : '';
    if (dilovodDocId && changes.length > 0) {
      const editorLabel = await getEditorLabel(userId);
      const remarkNote = buildEditRemarkNote(editorLabel, changes);
      const previousRemark = extractDilovodRemarkFromItems(existing.items) ?? existing.remark;
      const mergedRemark = appendDilovodRemark(previousRemark, remarkNote);

      let authorDilovodId: string | null = null;
      try {
        authorDilovodId = await getDilovodUserId(userId, { logPrefix: '[WriteOff][patch] ' });
      } catch {
        authorDilovodId = null;
      }

      const { payload } = await buildGoodDocumentPayload({
        docType: WAREHOUSE_WRITE_OFF_DOC_TYPE,
        docMode: WAREHOUSE_WRITE_OFF_DOC_MODE,
        dilovodDocId,
        saveType: 2,
        items: bodyItems,
        reason: nextReason,
        comment: String(nextComment ?? '').trim(),
        firmId: nextFirm,
        storageId: nextStorage,
        date: nextDate,
        includeAccCosts: true,
        authorDilovodId,
      });

      (payload as any).header.remark = mergedRemark;

      const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
      const exportResult = await dilovodExportFlowService.send({
        payload,
        dryRun: false,
        warnings: [],
        label: '[WriteOff][patch]',
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

    const updated = await prisma.warehouseWriteOffHistory.update({
      where: { id },
      data: {
        writeOffDate: nextDate,
        storageId: nextStorage,
        firmId: nextFirm,
        writeOffReason: nextReason,
        customReason: nextCustomReason,
        comment: nextComment,
        remark: nextRemark,
        items: nextItemsJson,
        payload: dilovodDocId ? JSON.stringify({ patched: true }) : existing.payload,
      },
    });

    await warehouseWriteOffAuditService.log({
      writeOffId: id,
      action: 'write_off_updated',
      userId,
      payload: { changes } as Prisma.InputJsonValue,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('недоступне') ? 403 : 500;
    console.error('[WriteOff] patch history error:', error);
    return res.status(status).json({ success: false, error: message });
  }
});

/** GET /api/warehouse/writeoff/history/:id/audit */
router.get('/history/:id/audit', authenticateToken, warehouseOperate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid id' });
    }
    const existing = await prisma.warehouseWriteOffHistory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const logs = await warehouseWriteOffAuditService.list(id);
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('[WriteOff] audit list error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/warehouse/writeoff/history
 * Save or update history record (client-side fallback)
 */
router.post('/history', authenticateToken, async (req, res) => {
  try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const userName = (req as any).user?.name;
      const { items, writeOffReason, customReason, comment, payload, writeOffNumber, storageId, firmId, firmName, writeOffDate } = req.body;
      if (!items) return res.status(400).json({ success: false, error: 'Missing required fields' });
      const sanitizedWriteOffReason = writeOffReason ?? '';

      // Enrich incoming items with productName, batchNumber, sku and productId where possible
      const incomingSkus = Array.isArray(items) ? items.map((it: any) => it.sku).filter(Boolean) : [];
      const foundProducts = incomingSkus.length ? catalogOpsLookup.listUnique(await catalogOpsLookup.getBySkus(incomingSkus)) : [];
      const skuMap = new Map(foundProducts.map((p: any) => [p.sku, p]));

      // Enrich items and resolve batch names when possible
      const skusNeedingLookup: string[] = Array.from(new Set((items || []).filter((it: any) => !it.batchNumber && (it.batchId || it.batchName) && it.sku).map((it: any) => String(it.sku))));
      let batchMap = new Map<string, any[]>();
      try {
        if (skusNeedingLookup.length > 0) {
          const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
          const dilovodService = new DilovodService();
          for (const s of skusNeedingLookup) {
            const skuKey = String(s);
            try {
              const batches = await dilovodService.getBatchNumbersBySku(skuKey, firmId ?? undefined, writeOffDate ? parseLocalDate(writeOffDate) ?? undefined : undefined);
              batchMap.set(skuKey, Array.isArray(batches) ? batches : []);
            } catch (e) {
              batchMap.set(skuKey, []);
            }
          }
        }
      } catch (e) {
        // ignore lookup errors
      }

      const enrichedItems = Array.isArray(items) ? items.map((it: any) => {
        const prod = skuMap.get(it.sku) || null;
        let resolvedBatchName = it.batchNumber ?? it.batchName ?? null;
        if (!resolvedBatchName && it.batchId && it.sku && batchMap.has(it.sku)) {
          const candidates = batchMap.get(it.sku) || [];
          const found = candidates.find((b: any) => String(b.batchId) === String(it.batchId) || String(b.id) === String(it.batchId));
          if (found) resolvedBatchName = found.batchNumber ?? found.name ?? null;
        }
        return {
          ...it,
          productName: prod?.name ?? it.name ?? null,
          batchNumber: resolvedBatchName ?? it.batchId ?? null,
          sku: it.sku ?? null,
          productId: prod?.id ?? it.productId ?? null,
        };
      }) : items;

      // Try to find existing record by writeOffNumber (if provided)
      const existing = writeOffNumber ? await prisma.warehouseWriteOffHistory.findFirst({ where: { writeOffNumber: writeOffNumber ? String(writeOffNumber) : undefined }, orderBy: { createdAt: 'desc' } }) : null;
      let record;
      if (existing) {
        record = await prisma.warehouseWriteOffHistory.update({ where: { id: existing.id }, data: {
          writeOffNumber: writeOffNumber || existing.writeOffNumber,
          firmId: firmId || existing.firmId,
          storageId: storageId || existing.storageId,
          writeOffDate: writeOffDate ? (parseLocalDate(writeOffDate) ?? existing.writeOffDate) : existing.writeOffDate,
          items: JSON.stringify(enrichedItems),
          writeOffReason: sanitizedWriteOffReason,
          customReason: customReason || existing.customReason,
          comment: comment || existing.comment,
          payload: payload ? JSON.stringify(payload) : existing.payload,
          createdBy: userId || existing.createdBy,
          
        } });
      } else {
        record = await prisma.warehouseWriteOffHistory.create({ data: {
          writeOffNumber: writeOffNumber || null,
          firmId: firmId || null,
          storageId: storageId || null,
          writeOffDate: writeOffDate ? parseLocalDate(writeOffDate) : null,
          items: JSON.stringify(enrichedItems),
          writeOffReason: sanitizedWriteOffReason,
          customReason: customReason || null,
          comment: comment || null,
          source: 'local',
          status: 'created',
          payload: payload ? JSON.stringify(payload) : '{}',
          createdBy: userId || 0,
        } });
      }

      res.json({ success: true, data: record });
  } catch (error) {
    console.error('[WriteOff] Error saving history record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /api/warehouse/writeoff/history/:id
 */
router.delete('/history/:id', authenticateToken, warehouseHistoryDelete, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const record = await prisma.warehouseWriteOffHistory.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });

    // If there is a writeOffNumber, attempt to delete in Dilovod
    const { dryRun, forceLocal } = req.query;
    // If forceLocal=true provided, skip remote Dilovod deletion and remove local record only
    if (String(forceLocal) === 'true') {
      await prisma.warehouseWriteOffHistory.update({ where: { id }, data: { status: 'deleted' } });
      return res.json({ success: true });
    }

    if (record.writeOffNumber && dryRun !== 'true') {
      try {
        const payload: any = { saveType: 2, header: { id: record.writeOffNumber, delMark: 1 } };
        const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
        const exportResult = await dilovodExportFlowService.send({ payload, dryRun: false, warnings: [], label: '[WriteOff]' });
        const result = exportResult.dilovodResponse;
        if (!exportResult.success) {
          const msg = String(exportResult.error || result?.error || result?.message || 'Unknown error');
          // If Dilovod reports object not found, offer local-only deletion
          if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('object with id') || msg.toLowerCase().includes('не знайдено') || msg.toLowerCase().includes('не знайден')) {
            return res.status(422).json({ success: false, error: msg, canDeleteLocal: true });
          }
          return res.status(422).json({ success: false, error: msg });
        }
      } catch (err) {
        console.warn('[WriteOff] Error deleting in Dilovod:', err);
        // On unexpected error, do not remove local record automatically — surface error to client
        return res.status(500).json({ success: false, error: 'Error deleting in Dilovod', details: err instanceof Error ? err.message : String(err) });
      }
    }

    await prisma.warehouseWriteOffHistory.update({ where: { id }, data: { status: 'deleted' } });
    res.json({ success: true });
  } catch (error) {
    console.error('[WriteOff] Error deleting history record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
