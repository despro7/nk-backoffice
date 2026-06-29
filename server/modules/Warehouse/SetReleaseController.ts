import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { normalizeSetsArray, normalizeReleaseHistoryItems } from './historyNormalize.js';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { dilovodExportFlowService } from '../../services/dilovod/index.js';
import { getDilovodUserId, getDilovodExportErrorMessage, translateDilovodError } from '../../services/dilovod/DilovodUtils.js';

const router = Router();

const SET_RELEASE_DOC_ID = 'documents.goodWriteOff';
const SET_RELEASE_DOC_MODE_KIT = '1004000000000305';
const SET_RELEASE_DOC_MODE_UNKIT = '1004000000000306';
const SET_RELEASE_ACC_COSTS = '1119000000001079';
const SET_RELEASE_ACC_GOOD = '1119000000001076';

function formatLocalDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();

  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    const [, year, month, day, hours, minutes, seconds] = localMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds ?? '0'),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function resolveKitGoodId(setSku: string | number | undefined, kitGood: string | number | undefined): Promise<string | null> {
  const explicitKitGood = kitGood != null && String(kitGood).trim() !== '' ? String(kitGood).trim() : '';
  if (explicitKitGood) {
    return explicitKitGood;
  }

  const normalizedSku = setSku != null ? String(setSku).trim() : '';
  if (!normalizedSku) {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: { sku: normalizedSku },
    select: { dilovodId: true },
  });

  return product?.dilovodId?.trim() || null;
}

function buildReleaseHistoryComment(remark: unknown, comment: unknown): string | null {
  const values = [remark, comment]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);

  const uniqueValues = Array.from(new Set(values));
  return uniqueValues.length > 0 ? uniqueValues.join(' | ') : null;
}

type ReleaseSetSourceItem = {
  set_sku?: string | number | null;
  setSku?: string | number | null;
  sku?: string | number | null;
  quantity?: number | string | null;
  components_snapshot?: unknown;
};

type DirectSetComponent = {
  sku: string;
  name: string | null;
  quantity: number;
};

function parseSetComponents(rawSet: unknown): Array<{ id?: string | number | null; sku?: string | number | null; quantity?: number | string | null; name?: string | null }> {
  if (Array.isArray(rawSet)) {
    return rawSet;
  }

  if (typeof rawSet === 'string') {
    try {
      const parsed = JSON.parse(rawSet);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[SetRelease] Failed to parse set JSON:', error);
      return [];
    }
  }

  return [];
}

function normalizeDirectComponentsFromSnapshot(snapshot: unknown, parentQty: number): DirectSetComponent[] {
  if (!Array.isArray(snapshot) || parentQty <= 0) {
    return [];
  }

  const components: DirectSetComponent[] = [];
  for (const component of snapshot) {
    if (!component) continue;
    const rawSku = component.id ?? component.sku ?? component.code ?? null;
    const sku = String(rawSku ?? '').trim();
    if (!sku) continue;

    const quantity = Number(component.quantity ?? component.qty ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    components.push({
      sku,
      name: component.name ?? component.title ?? null,
      quantity: quantity * parentQty,
    });
  }

  return components;
}

async function collectFirstLevelComponents(items: ReleaseSetSourceItem[]): Promise<Record<string, DirectSetComponent>> {
  const aggregated: Record<string, DirectSetComponent> = {};

  for (const item of items) {
    const sku = String(item.set_sku ?? item.setSku ?? item.sku ?? '').trim();
    const quantity = Number(item.quantity ?? 0);
    if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    let directComponents = normalizeDirectComponentsFromSnapshot(item.components_snapshot, quantity);

    if (directComponents.length === 0) {
      const product = await prisma.product.findUnique({ where: { sku } });
      const setData = parseSetComponents(product?.set);
      if (setData.length === 0) {
        if (product?.dilovodId) {
          if (!aggregated[sku]) {
            aggregated[sku] = { sku, name: product?.name ?? null, quantity: 0 };
          }
          aggregated[sku].quantity += quantity;
        }
        continue;
      }

      directComponents = setData
        .map((component) => {
          const componentSku = String(component.id ?? component.sku ?? '').trim();
          if (!componentSku) return null;
          const componentQty = Number(component.quantity ?? 1);
          if (!Number.isFinite(componentQty) || componentQty <= 0) return null;
          return {
            sku: componentSku,
            name: component.name ?? null,
            quantity: componentQty * quantity,
          };
        })
        .filter((component): component is DirectSetComponent => component !== null);
    }

    for (const component of directComponents) {
      if (!aggregated[component.sku]) {
        aggregated[component.sku] = { sku: component.sku, name: component.name ?? null, quantity: 0 };
      }
      if (!aggregated[component.sku].name && component.name) {
        aggregated[component.sku].name = component.name;
      }
      aggregated[component.sku].quantity += component.quantity;
    }
  }

  return aggregated;
}

/**
 * POST /api/warehouse/releases
 * Create a new set release record (snapshot)
 */
router.post('/', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id || 0;
    const { items, storageId, firmId, comment, remark, status, dilovodDocId, operationType, operDate, date } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items required' });

    // Each item expected: { set_sku, quantity, components_snapshot }
    // Accept `firmId` as string (Dilovod uses large string IDs). Store as string to avoid 32-bit overflow.
    const stringFirmId = (firmId != null && String(firmId).trim() !== '') ? String(firmId).trim() : null;
    // enrich items with set name snapshot to avoid server-side lookups during history rendering
    const skus = Array.from(new Set(items.map((it: any) => String(it.set_sku || it.setSku || it.sku || '').trim()).filter((s: string) => s)));
    let nameMap: Record<string, string> = {};
    if (skus.length > 0) {
      const products = await prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true, name: true } });
      for (const p of products) {
        if (p && p.sku) nameMap[String(p.sku)] = p.name || '';
      }
    }

    const normalizedItems = normalizeReleaseHistoryItems(items);
    const itemsWithNames = normalizedItems.map((it: any) => {
      const sku = String(it.set_sku || it.setSku || it.sku || '').trim();
      return { ...it, name: it.name ?? nameMap[sku] ?? null };
    });

    const totalQuantity = Number(itemsWithNames.reduce((acc:any, it:any) => acc + (Number(it.quantity) || 0), 0)) || 0;
    const historyComment = buildReleaseHistoryComment(remark, comment);
    const resolvedOperationType = String(operationType ?? 'kit').trim() === 'unkit' ? 'unkit' : 'kit';
    const resolvedOperDate = parseLocalDate(operDate ?? date) ?? new Date();

    const record = await prisma.warehouseReleaseSet.create({ data: {
      setSku: itemsWithNames[0]?.set_sku ?? null,
      quantity: totalQuantity,
      // Prisma `Json` field expects a JS object/array — store as-is, avoid double-stringify
      items: itemsWithNames,
      storageId: storageId ?? null,
      firmId: stringFirmId,
      dilovodDocId: dilovodDocId != null && String(dilovodDocId).trim() !== '' ? String(dilovodDocId).trim() : null,
      operationType: resolvedOperationType,
      comment: historyComment,
      status: status ?? 'created',
      createdBy: Number(userId) || 0,
      operDate: resolvedOperDate,
    } });

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('[SetRelease] Error saving release:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/** POST /api/warehouse/releases/preview - preview expanded components for given sets */
router.post('/preview', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { items } = req.body;
    if (process.env.NODE_ENV === 'development') console.log('[SetRelease][preview] incoming items:', Array.isArray(items) ? items.length : typeof items);
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items required' });

    const expandedComponents = await collectFirstLevelComponents(items as ReleaseSetSourceItem[]);

    // Prepare array result
    const result = Object.values(expandedComponents).map(c => ({ sku: c.sku, name: c.name, quantity: c.quantity }));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SetRelease][preview] error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// NOTE: single-item `/check-dilovod` removed — use `/check-dilovod-batch` for batch operations

/** POST /api/warehouse/releases/check-dilovod-batch - batch check dilovod documents */
router.post('/check-dilovod-batch', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (items.length === 0) return res.status(400).json({ success: false, error: 'items required' });

    const results: Array<any> = [];
    const { dilovodService } = await import('../../services/dilovod/DilovodService.js');

    // Build list of docIds to fetch in batch
    const requestedDocIds = items.map((it: any) => String(it?.dilovodDocId ?? '').trim()).filter((d: string) => d);

    // Fetch documents in chunks via Dilovod batch API
    const docs = await dilovodService.getMovementDocumentsBatch(requestedDocIds).catch((e) => {
      console.warn('[SetRelease][check-dilovod-batch] batch fetch failed', e);
      return [] as any[];
    });

    const docsById: Record<string, any> = {};
    for (const d of Array.isArray(docs) ? docs : []) {
      const id = d?.id != null ? String(d.id) : (d?.ID != null ? String(d.ID) : null);
      if (id) docsById[String(id)] = d;
    }

    for (const it of items) {
      const id = it?.id != null ? Number(it.id) : null;
      const docId = String(it?.dilovodDocId ?? '').trim();
      if (!docId) {
        results.push({ id, dilovodDocId: docId, success: false, error: 'missing dilovodDocId' });
        continue;
      }

      const doc = docsById[docId] || null;

      // If Dilovod did not return data for this id -> consider deleted per user instruction
      const missingInResponse = !doc;

      let delMark = false;
      let success = true;
      let updated = false;

      let remark: string | null = null;
      if (missingInResponse) {
        delMark = true;
      } else {
        const headerDel = doc?.header?.delMark ?? doc?.delMark ?? undefined;
        delMark = headerDel === true || headerDel === 1 || String(headerDel) === '1';
        remark = doc?.remark ?? doc?.header?.remark ?? null;
      }

      if (delMark) {
        // try find by id or dilovodDocId
        try {
          if (id != null) {
            const existing = await prisma.warehouseReleaseSet.findUnique({ where: { id } });
            if (existing) {
              await prisma.warehouseReleaseSet.update({ where: { id }, data: { status: 'deleted' } });
              updated = true;
            } else {
              const created = await prisma.warehouseReleaseSet.create({ data: {
                setSku: null,
                quantity: 0,
                items: [],
                storageId: null,
                firmId: null,
                dilovodDocId: docId,
                comment: null,
                status: 'deleted',
                createdBy: 0,
              } });
              if (created) updated = true;
            }
          } else {
            const existing = await prisma.warehouseReleaseSet.findFirst({ where: { dilovodDocId: docId } });
            if (existing) {
              await prisma.warehouseReleaseSet.update({ where: { id: existing.id }, data: { status: 'deleted' } });
              updated = true;
            } else {
              const created = await prisma.warehouseReleaseSet.create({ data: {
                setSku: null,
                quantity: 0,
                items: [],
                storageId: null,
                firmId: null,
                dilovodDocId: docId,
                comment: null,
                status: 'deleted',
                createdBy: 0,
              } });
              if (created) updated = true;
            }
          }
        } catch (e) {
          console.warn('[SetRelease][check-dilovod-batch] failed to mark/create tombstone', e);
          success = false;
        }
      }

      results.push({ id, dilovodDocId: docId, success, delMark, updated, remark });
    }

    return res.json({ success: true, results });
  } catch (error) {
    console.error('[SetRelease][check-dilovod-batch] Error:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/**
 * POST /api/warehouse/releases/send
 * Формування payload та відправка документа випуску набору в Діловод
 */
router.post('/send', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { kitGood, kitQty, setSku, quantity, storageId, firmId, comment, remark, date, dryRun, docMode } = req.body;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const resolvedDocMode = String(docMode ?? SET_RELEASE_DOC_MODE_KIT).trim() === SET_RELEASE_DOC_MODE_UNKIT
      ? SET_RELEASE_DOC_MODE_UNKIT
      : SET_RELEASE_DOC_MODE_KIT;

    const firstItem = items[0] ?? {};
    const resolvedSetSku = typeof setSku === 'string' && setSku.trim() !== ''
      ? setSku.trim()
      : typeof firstItem.set_sku === 'string'
        ? firstItem.set_sku.trim()
        : typeof firstItem.setSku === 'string'
          ? firstItem.setSku.trim()
          : typeof firstItem.sku === 'string'
            ? firstItem.sku.trim()
            : '';

    const resolvedKitQty = Number(kitQty ?? quantity ?? firstItem.quantity ?? 0);
    if (!resolvedSetSku && kitGood == null) {
      return res.status(400).json({ success: false, error: 'setSku або kitGood обовʼязкові' });
    }
    if (!Number.isFinite(resolvedKitQty) || resolvedKitQty <= 0) {
      return res.status(400).json({ success: false, error: 'kitQty має бути додатнім числом' });
    }

    const resolvedKitGood = await resolveKitGoodId(resolvedSetSku, kitGood as string | number | undefined);
    if (!resolvedKitGood) {
      return res.status(422).json({ success: false, error: 'Не вдалося визначити ID набору в Dilovod (kitGood)' });
    }

    const currentUserId = (req as any).user?.userId || (req as any).user?.id;
    const parsedDate = parseLocalDate(date) ?? new Date();
    const formattedDate = formatLocalDate(parsedDate);
    const author = await getDilovodUserId(currentUserId, { logPrefix: '[SetRelease] ' }).catch(() => '');

    const payload: any = {
      saveType: 1,
      header: {
        id: SET_RELEASE_DOC_ID,
        date: formattedDate,
        firm: firmId ?? null,
        storage: storageId ?? null,
        posted: 1,
        accCosts: SET_RELEASE_ACC_COSTS,
        docMode: resolvedDocMode,
        kitGood: resolvedKitGood,
        kitQty: resolvedKitQty,
        ...(author ? { author } : {}),
        ...((remark || comment) ? { remark: String(remark || comment).trim() } : {}),
      },
    };

    // Build tableParts.tpGoods from first-level components only
    try {
      const expandedComponents = await collectFirstLevelComponents(items as ReleaseSetSourceItem[]);

      // Map expanded skus to products to get dilovodId
      const expandedList = Object.values(expandedComponents);
      const skus = expandedList.map(c => c.sku).filter(Boolean);
      const products = skus.length ? await prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true, dilovodId: true, set: true } }) : [];
      const skuToProduct = new Map(products.map((p: any) => [p.sku, p]));

      const tpGoods: any[] = [];
      let row = 1;
      for (const comp of expandedList) {
        const prod = skuToProduct.get(comp.sku);
        if (!prod || !prod.dilovodId) continue; // skip items without dilovodId
        const hasNestedSet = Array.isArray(prod.set)
          ? prod.set.length > 0
          : typeof prod.set === 'string'
            ? String(prod.set).trim().length > 0
            : Boolean(prod.set);
        tpGoods.push({
          rowNum: row,
          good: prod.dilovodId,
          unit: '1103600000000001',
          qty: Number(comp.quantity) || 0,
          accGood: hasNestedSet ? SET_RELEASE_ACC_COSTS : SET_RELEASE_ACC_GOOD,
        });
        row++;
      }

      if (!payload.tableParts) payload.tableParts = {};
      payload.tableParts.tpGoods = tpGoods;
    } catch (e) {
      console.warn('[SetRelease] Failed to build tpGoods tablePart:', e);
    }

    const exportResult = await dilovodExportFlowService.send({
      payload,
      dryRun: dryRun === true || dryRun === 'true',
      warnings: [],
      label: '[SetRelease]',
    });

    if (exportResult.dryRun) {
      return res.json(exportResult);
    }

    if (!exportResult.success) {
      const rawError = exportResult.error || exportResult.dilovodResponse?.error || exportResult.dilovodResponse?.message || 'Dilovod error';
      const translated = exportResult.translatedError ?? translateDilovodError(String(rawError));
      const message = exportResult.dilovodResponse ? getDilovodExportErrorMessage(exportResult.dilovodResponse) : String(rawError);

      return res.status(422).json({
        success: false,
        error: message,
        errorTitle: translated.title,
        errorFallback: translated.message,
        dilovodResponse: exportResult.dilovodResponse,
      });
    }

    const stockSyncTriggered = true;

    void (async () => {
      try {
        const { syncSettingsService } = await import('../../services/syncSettingsService.js');
        const isEnabled = await syncSettingsService.isSyncEnabled('stocks');
        if (!isEnabled) {
          console.log('⏭️ [SetRelease] Stock sync після випуску пропущено — синхронізація залишків вимкнена');
          return;
        }

        console.log('🔄 [SetRelease] Запускаємо оновлення залишків після випуску набору...');
        const { DilovodService: DilovodServiceCls } = await import('../../services/dilovod/DilovodService.js');
        const stockService = new DilovodServiceCls();
        const result = await stockService.updateStockBalancesInDatabase();
        console.log('✅ [SetRelease] Залишки оновлено після випуску набору:', result?.message ?? 'OK');
      } catch (error) {
        console.warn('⚠️ [SetRelease] Не вдалось оновити залишки після випуску набору:', error);
      }
    })();

    return res.json({
      success: true,
      payload,
      dilovodResponse: exportResult.dilovodResponse,
      dilovodDocId: exportResult.dilovodDocId,
      stockSyncTriggered,
    });
  } catch (error) {
    console.error('[SetRelease] Error sending set release:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

/** GET /api/warehouse/releases */
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') console.log('[SetRelease][get] user:', (req as any).user, 'query:', req.query);
    const rows = await prisma.warehouseReleaseSet.findMany({ orderBy: { createdAt: 'desc' } });
    // Attach normalized sets (components normalized) while preserving original data
    const withNormalized = rows.map((r: any) => ({
      ...r,
      setsNormalized: normalizeSetsArray(r.items),
    }));
    res.json({ success: true, data: withNormalized });
  } catch (error) {
    console.error('[SetRelease] Error fetching releases:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** DELETE /api/warehouse/releases/:id */
router.delete('/:id', authenticateToken, requireMinRole(ROLES.ADMIN), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.warehouseReleaseSet.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const { forceLocal } = req.query;
    if (String(forceLocal) === 'true') {
      await prisma.warehouseReleaseSet.update({ where: { id }, data: { status: 'deleted' } });
      return res.json({ success: true });
    }

    const releaseDocId = existing.dilovodDocId != null ? String(existing.dilovodDocId).trim() : '';
    if (releaseDocId) {
      try {
        const payload: any = { saveType: 2, header: { id: releaseDocId, delMark: 1 } };
        const exportResult = await dilovodExportFlowService.send({ payload, dryRun: false, warnings: [], label: '[SetRelease]' });
        const result = exportResult.dilovodResponse;

        if (!exportResult.success) {
          const msg = String(exportResult.error || result?.error || result?.message || 'Unknown error');
          if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('object with id') || msg.toLowerCase().includes('не знайдено') || msg.toLowerCase().includes('не знайден')) {
            return res.status(422).json({ success: false, error: msg, canDeleteLocal: true });
          }
          return res.status(422).json({ success: false, error: msg });
        }
      } catch (err) {
        console.warn('[SetRelease] Error deleting in Dilovod:', err);
        return res.status(500).json({ success: false, error: 'Error deleting in Dilovod', details: err instanceof Error ? err.message : String(err) });
      }
    }

    await prisma.warehouseReleaseSet.update({ where: { id }, data: { status: 'deleted' } });
    res.json({ success: true });
  } catch (error) {
    console.error('[SetRelease] Error deleting release:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
