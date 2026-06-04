import { Router } from 'express';
import { prisma } from '../../lib/utils.js';
import { authenticateToken, requireMinRole } from '../../middleware/auth.js';
import { ROLES } from '../../../shared/constants/roles.js';

const router = Router();

/**
 * POST /api/warehouse/releases
 * Create a new set release record (snapshot)
 */
router.post('/', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const userId = (req as any).user?.userId || (req as any).user?.id || 0;
    const userName = (req as any).user?.name || null;
    const { items, storageId, firmId, comment, status } = req.body;
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

    const itemsWithNames = items.map((it: any) => {
      const sku = String(it.set_sku || it.setSku || it.sku || '').trim();
      return { ...it, name: it.name ?? nameMap[sku] ?? null };
    });

    const totalQuantity = Number(itemsWithNames.reduce((acc:any, it:any) => acc + (Number(it.quantity) || 0), 0)) || 0;

    const record = await prisma.warehouseReleaseSet.create({ data: {
      setSku: itemsWithNames[0]?.set_sku ?? null,
      quantity: totalQuantity,
      // Prisma `Json` field expects a JS object/array — store as-is, avoid double-stringify
      items: itemsWithNames,
      storageId: storageId ?? null,
      firmId: stringFirmId,
      comment: comment ?? null,
      status: status ?? 'created',
      createdBy: Number(userId) || 0,
      createdByName: userName || null,
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

    // expandedComponents: sku -> { sku, name, quantity }
    const expandedComponents: Record<string, { sku: string; name?: string | null; quantity: number }> = {};

    const MAX_DEPTH = 10;

    const expandSkuRecursively = async (sku: string, qty: number, visited: Set<string> = new Set(), depth: number = 0) => {
      if (depth > MAX_DEPTH) {
        console.warn(`[SetRelease][preview] max depth reached for SKU=${sku}`);
        return;
      }
      const normSku = String(sku).trim();
      if (visited.has(normSku)) {
        console.warn(`[SetRelease][preview] cyclic reference detected for SKU=${normSku}`);
        return;
      }

      // Fetch product by SKU
      const product = await prisma.product.findUnique({ where: { sku: normSku } });
      if (!product) {
        // treat missing product as leaf with unknown name
        if (!expandedComponents[normSku]) expandedComponents[normSku] = { sku: normSku, name: null, quantity: 0 };
        expandedComponents[normSku].quantity += qty;
        return;
      }

      // Parse set if present
      let setData: any[] | null = null;
      try {
        setData = product.set ? (typeof product.set === 'string' ? JSON.parse(product.set) : product.set) : null;
      } catch (e) {
        console.warn(`[SetRelease][preview] failed to parse set for SKU=${normSku}`, e);
        setData = null;
      }

      // If no set -> leaf product
      if (!Array.isArray(setData) || setData.length === 0) {
        const name = product.name || null;
        if (!expandedComponents[normSku]) expandedComponents[normSku] = { sku: normSku, name, quantity: 0 };
        expandedComponents[normSku].quantity += qty;
        return;
      }

      // It's a set -> expand components recursively
      visited.add(normSku);
      for (const si of setData) {
        if (!si || !si.id) continue;
        const childSku = String(si.id).trim();
        const childQty = Number(si.quantity || 0) * qty;
        if (childQty <= 0) continue;
        await expandSkuRecursively(childSku, childQty, new Set(visited), depth + 1);
      }
      visited.delete(normSku);
    };

    for (const it of items) {
      const sku = it.set_sku || it.sku || it.setSku;
      const qty = Number(it.quantity || 0);
      if (!sku || qty <= 0) continue;
      await expandSkuRecursively(String(sku), qty, new Set(), 0);
    }

    // Prepare array result
    const result = Object.values(expandedComponents).map(c => ({ sku: c.sku, name: c.name, quantity: c.quantity }));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[SetRelease][preview] error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/** GET /api/warehouse/releases */
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') console.log('[SetRelease][get] user:', (req as any).user, 'query:', req.query);
    const rows = await prisma.warehouseReleaseSet.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: rows });
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
    await prisma.warehouseReleaseSet.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[SetRelease] Error deleting release:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
