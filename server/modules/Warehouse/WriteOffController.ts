import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { safeParseItems, normalizeItemsArray } from './historyNormalize.js';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';

const router = Router();

/**
 * POST /api/warehouse/writeoff/send
 * Відправка документа списання в Діловод
 */
router.post('/send', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { orderId, items, comment, reason, customReason, firmId, storageId, date, dryRun } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required' });
    }

    // Build payload
    // Map SKU -> dilovodId
    const skus = items.map((it: any) => it.sku).filter(Boolean);
    const products = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, dilovodId: true, name: true } });
    const skuToProduct = new Map(products.map((p: any) => [p.sku, p]));

    const { getDilovodConfigFromDB } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodConfig = await getDilovodConfigFromDB();

    const pad = (n: number) => String(n).padStart(2, '0');
    const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    const parseIncomingDate = (dt: any): Date | null => {
      if (!dt) return null;
      if (dt instanceof Date) return dt;
      if (typeof dt !== 'string') return null;
      const isoLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      try {
        if (isoLike.test(dt)) {
          // incoming like 'YYYY-MM-DD HH:mm:ss' — interpret as UTC (client often sends toISOString replaced T->space)
          const asUtc = dt.replace(' ', 'T') + 'Z';
          const parsed = new Date(asUtc);
          return isNaN(parsed.getTime()) ? null : parsed;
        }
        // Otherwise try general Date parsing (handles ISO with timezone)
        const parsed = new Date(dt);
        return isNaN(parsed.getTime()) ? null : parsed;
      } catch (e) {
        return null;
      }
    };

    const incomingDate = parseIncomingDate(date);
    const baseDate = incomingDate || new Date();
    const formattedDate = formatLocal(baseDate);

    const header: any = {
      id: 'documents.goodWriteOff',
      date: formattedDate,
      docMode: '1004000000000304',
      storage: storageId ?? dilovodConfig.smallStorageId ?? dilovodConfig.mainStorageId ?? null,
      firm: firmId ?? dilovodConfig.defaultFirmId ?? null,
      posted: 1,
      accCosts: '1119000000001299',
      // intentionally omitting: person, tradeChanel, paymentForm, cashAccount
    };

    // Resolve author (dilovodUserId) from local user for header.author
    try {
      const { getDilovodUserId } = await import('../../services/dilovod/DilovodUtils.js');
      const currentUserId = (req as any).user?.userId || (req as any).user?.id;
      const authorDilovodId = await getDilovodUserId(currentUserId, { logPrefix: '[WriteOff] ' });
      header.author = authorDilovodId;
    } catch (e) {
      console.warn('[WriteOff] Failed to resolve author dilovod id:', e);
    }

    // remark: Reason: Name1, Name2 (no emoji)
    const reasonLabel = String(reason || '').replace(/[^\p{L}\p{N}\s\-]/gu, '').trim();
    const commentLabel = String(comment || '').trim();
    const productNames = items.map((it: any) => (skuToProduct.get(it.sku)?.name ?? it.name ?? it.sku));
      // Format: "Reason: Item1, Item2 | Comment"  (if present)
      let remark = '';
      if (reasonLabel && productNames.length) {
        remark = `${reasonLabel}: ${productNames.join(', ')}`;
      } else if (reasonLabel) {
        remark = reasonLabel;
      } else if (productNames.length) {
        remark = productNames.join(', ');
      }
      if (commentLabel) {
        remark = remark ? `${remark} | ${commentLabel}` : commentLabel;
      }
    if (remark) header.remark = remark;

    const tpGoods: any[] = [];
    let row = 1;
    for (const it of items) {
      const prod = skuToProduct.get(it.sku);
      if (!prod || !prod.dilovodId) {
        // skip or push warning
        continue;
      }
      tpGoods.push({
        rowNum: row,
        good: prod.dilovodId,
        goodPart: it.batchId || null,
        unit: '1103600000000001', // piece
        qty: Number(it.quantity) || 0,
        accGood: '1119000000001076',
      });
      row++;
    }

    const payload: any = {
      saveType: 1,
      header,
      tableParts: { tpGoods },
    };

    const { dilovodExportFlowService, dilovodService } = await import('../../services/dilovod/index.js');
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
          category: 'dilovod', title: 'WriteOff export failed', status: 'error', message: shortMsg, data: { payload, result }, initiatedBy: (req as any).user?.userId ? String((req as any).user.userId) : 'unknown'
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

    // Save history record (store firmName if possible)
    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      // Prisma expects a Date object / ISO date for DateTime fields — convert formattedDate
      const writeOffDateObj = formattedDate ? new Date(formattedDate.replace(' ', 'T')) : null;

      // Try to resolve firmName from Dilovod directories if possible
      let firmNameToSave: string | null = null;
      let dilovodServiceLocal: any = null;
      try {
        const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
        dilovodServiceLocal = new DilovodService();
        const firms = await dilovodServiceLocal.getFirms();
        const headerFirm = header.firm;
        if (Array.isArray(firms) && headerFirm != null) {
          const found = firms.find((f: any) => String(f.id) === String(headerFirm) || String(f.good_id) === String(headerFirm) || String(f.name) === String(headerFirm));
          firmNameToSave = found?.name ?? null;
        }
      } catch (e) {
        console.warn('[WriteOff] Failed to resolve firm name:', e);
      }

      // Enrich items with productName, batchNumber (name), sku and productId for easier history rendering
      // If batch name is missing but batchId present, try to resolve via Dilovod API
      const enrichedItems: any[] = [];
      try {
        // collect skus that need batch lookup
        const skusNeedingLookup = Array.from(new Set((items || []).filter((it: any) => !it.batchNumber && (it.batchId || it.batchName) && it.sku).map((it: any) => it.sku)));
        const batchMap = new Map<string, any[]>();
        if (dilovodServiceLocal && skusNeedingLookup.length > 0) {
          for (const s of skusNeedingLookup) {
            try {
              const batches = await dilovodServiceLocal.getBatchNumbersBySku(s, header.firm ?? undefined, baseDate);
              batchMap.set(s, Array.isArray(batches) ? batches : []);
            } catch (e) {
              batchMap.set(s, []);
            }
          }
        }

        for (const it of items) {
          const prod = skuToProduct.get(it.sku) || null;
          let resolvedBatchName = it.batchNumber ?? it.batchName ?? null;
          if (!resolvedBatchName && it.batchId && it.sku && batchMap.has(it.sku)) {
            const candidates = batchMap.get(it.sku) || [];
            const found = candidates.find((b: any) => String(b.batchId) === String(it.batchId) || String(b.id) === String(it.batchId));
            if (found) resolvedBatchName = found.batchNumber ?? found.name ?? null;
          }

          enrichedItems.push({
            ...it,
            productName: prod?.name ?? it.name ?? null,
            batchNumber: resolvedBatchName ?? it.batchId ?? null,
            sku: it.sku ?? null,
            productId: prod?.id ?? it.productId ?? null,
          });
        }
      } catch (e) {
        // fallback: simple enrichment
        for (const it of items) {
          const prod = skuToProduct.get(it.sku) || null;
          enrichedItems.push({
            ...it,
            productName: prod?.name ?? it.name ?? null,
            batchNumber: it.batchNumber ?? it.batchName ?? it.batchId ?? null,
            sku: it.sku ?? null,
            productId: prod?.id ?? it.productId ?? null,
          });
        }
      }

      const record = await prisma.warehouseWriteOffHistory.create({
        data: {
          writeOffNumber: writeOffNumber,
          firmId: firmId ?? null,
          storageId: header.storage ?? null,
          writeOffDate: writeOffDateObj,
          items: JSON.stringify(enrichedItems),
          writeOffReason: reason || '',
          customReason: customReason || null,
          comment: comment || null,
          payload: JSON.stringify(payload),
          createdBy: userId || 0,
          
        }
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
    const history = await prisma.warehouseWriteOffHistory.findMany({ orderBy: { createdAt: 'desc' } });
    // Preload firms once to avoid calling into DilovodService.getFirms for each record
    let firmsMap: Map<string, string> = new Map();
    try {
      const { dilovodService } = await import('../../services/dilovod/DilovodService.js');
      const firms = await dilovodService.getFirms(false);
      if (Array.isArray(firms)) {
        firmsMap = new Map(firms.map((f: any) => [String(f.id), f.name || String(f.id)]));
      }
    } catch (e) {
      console.warn('[WriteOff] Failed to preload firms for display names:', e);
    }

    const enriched = history.map((rec: any) => {
      const parsed = safeParseItems(rec.items);
      const itemsNormalized = normalizeItemsArray(parsed);
      const idStr = rec.firmId != null ? String(rec.firmId) : null;
      const firmDisplay = idStr ? (firmsMap.get(idStr) ?? idStr) : null;
      return {
        ...rec,
        firmDisplayName: firmDisplay,
        itemsNormalized,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[WriteOff] Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
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
      const foundProducts = incomingSkus.length ? await prisma.product.findMany({ where: { sku: { in: incomingSkus } }, select: { id: true, sku: true, name: true } }) : [];
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
              const batches = await dilovodService.getBatchNumbersBySku(skuKey, firmId ?? undefined, writeOffDate ? new Date(writeOffDate) : undefined);
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
          writeOffDate: writeOffDate ? new Date(writeOffDate) : existing.writeOffDate,
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
          writeOffDate: writeOffDate ? new Date(writeOffDate) : null,
          items: JSON.stringify(enrichedItems),
          writeOffReason: sanitizedWriteOffReason,
          customReason: customReason || null,
          comment: comment || null,
          payload: payload ? JSON.stringify(payload) : null,
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
router.delete('/history/:id', authenticateToken, requireMinRole(ROLES.ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const record = await prisma.warehouseWriteOffHistory.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });

    // If there is a writeOffNumber, attempt to delete in Dilovod
    const { dryRun, forceLocal } = req.query;
    // If forceLocal=true provided, skip remote Dilovod deletion and remove local record only
    if (String(forceLocal) === 'true') {
      await prisma.warehouseWriteOffHistory.delete({ where: { id } });
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

    await prisma.warehouseWriteOffHistory.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[WriteOff] Error deleting history record:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
