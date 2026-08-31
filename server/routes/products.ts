import express from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { DilovodService } from '../services/dilovod/index.js';
import { handleDilovodApiError } from '../services/dilovod/DilovodUtils.js';
import { salesDriveService } from '../services/salesDriveService.js';
import { buildExportPayload } from '../services/productExportHelper.js';
import { catalogOpsLookup } from '../modules/Products/CatalogOpsLookup.js';
import { productOpsCache } from '../modules/Products/ProductOpsCache.js';
import { productsCatalogService } from '../modules/Products/ProductsCatalogService.js';
import { cronService } from '../services/cronService.js';

const router = express.Router();

const productsEdit = requirePermission('products', 'edit', 'Редагувати товари (вага, штрихкод, порядок)');
const productsSync = requirePermission('products', 'sync', 'Синхронізувати товари');
const productsSyncExport = requirePermission('products', 'syncExport', 'Синхронізація + експорт товарів');

async function resolveCatalogGoodId(id: string): Promise<string | null> {
  const numeric = parseInt(id, 10);
  if (!Number.isNaN(numeric) && String(numeric) === String(id).trim()) {
    const cache = await prisma.product.findUnique({
      where: { id: numeric },
      select: { sku: true, dilovodId: true },
    });
    if (cache?.dilovodId) return cache.dilovodId;
    if (cache?.sku) {
      const ops = await catalogOpsLookup.getBySku(cache.sku);
      return ops?.dilovodId ?? null;
    }
  }
  const byId = await prisma.catalogGood.findUnique({
    where: { id: String(id).trim() },
    select: { id: true, isGroup: true },
  });
  if (byId && !byId.isGroup) return byId.id;
  const bySku = await catalogOpsLookup.getBySku(id);
  return bySku?.dilovodId ?? null;
}

// Отримати всі товари з пагінацією
// GET /api/products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const category = req.query.category as string;

    const skip = (page - 1) * limit;
    const sortBy = (req.query.sortBy as string) || 'lastSyncAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const { products, total } = await catalogOpsLookup.search({
      search,
      category,
      showOutdated: req.query.showOutdated === 'true',
      skip,
      take: limit,
      sortBy,
      sortOrder,
    });
    const parsedProducts = products.map((p) => catalogOpsLookup.toApiShape(p));

    res.json({
      products: parsedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.log('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати масив продуктів за списком SKU з можливістю вибіркових полів
// GET /api/products/batch?skus=SKU1,SKU2&fields=costPerItem,additionalPrices
router.get('/batch', authenticateToken, async (req, res) => {
  try {
    const skusParam = req.query.skus as string || '';
    const fieldsParam = req.query.fields as string || '';
    const requestedFields = fieldsParam.split(',').map(s => s.trim()).filter(Boolean);
    const skus = skusParam.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (skus.length === 0) return res.status(400).json({ error: 'skus query parameter required' });

    const found = await catalogOpsLookup.getBySkus(skus);
    const parsed: any[] = [];
    for (const sku of skus) {
      const p = found.get(sku) ?? found.get(sku.toLowerCase());
      if (!p) continue;
      const shape = catalogOpsLookup.toApiShape(p);
      if (requestedFields.length === 0) {
        parsed.push(shape);
        continue;
      }
      const row: Record<string, unknown> = { sku: p.sku };
      for (const f of requestedFields) {
        if (f === 'setItems' || f === 'expandedPortions') continue;
        if (f in shape) row[f] = (shape as Record<string, unknown>)[f];
      }
      if (requestedFields.includes('setItems') || requestedFields.includes('expandedPortions') || requestedFields.includes('set')) {
        row.set = shape.set;
      }
      parsed.push(row);
    }

    try {
      const wantExpanded = requestedFields.includes('expandedPortions');
      const wantSetItems = requestedFields.includes('setItems');

      if (wantExpanded || wantSetItems) {
        for (const p of parsed) {
          if (p.set && Array.isArray(p.set) && p.set.length > 0) {
            const expandedComponents: { [sku: string]: { component: any; quantity: number } } = {};
            try {
              await expandProductSetRecursively(p, expandedComponents, new Set(), 0, 1);
            } catch (err) {
              console.warn(`Failed to expand set for ${p.sku}:`, err);
            }

            const items = Object.keys(expandedComponents).map((sku) => {
              const rec = expandedComponents[sku];
              const comp = rec.component || {};
              return {
                id: sku,
                quantity: rec.quantity,
                name: comp.name || undefined,
                isSet: !!(comp.set && ((Array.isArray(comp.set) && comp.set.length > 0) || (typeof comp.set === 'string' && comp.set.trim().startsWith('['))))
              };
            });

            if (wantSetItems) p.setItems = items;
            if (wantExpanded) p.expandedPortions = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
          } else {
            if (wantSetItems) p.setItems = [];
            if (wantExpanded) p.expandedPortions = 0;
          }
        }
      }
    } catch (err) {
      console.warn('Error computing expanded sets in batch:', err);
    }

    res.json({ products: parsed });
  } catch (error) {
    console.error('Error in /api/products/batch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати один товар безпосередньо з Dilovod за SKU (без повної синхронізації)
// GET /api/products/dilovod/:sku
router.get('/dilovod/:sku', authenticateToken, async (req, res) => {
  try {
    const { sku } = req.params;
    const dilovodService = new DilovodService();
    console.log(`API: Получаем товар из Dilovod по SKU=${sku}`);

    let products;
    try {
      products = await dilovodService.getGoodsInfoWithSetsOptimized([sku]);
    } catch (e: any) {
      const msg = handleDilovodApiError(e, 'get single product');
      return res.status(502).json({ error: msg });
    }

    const product = products.find(p => p.sku === sku);
    if (!product) {
      return res.status(404).json({ error: 'Product not found in Dilovod' });
    }

    return res.json({ product });
  } catch (error) {
    console.log('Error fetching single product from Dilovod:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Рекурсивно розгортає комплект на кінцеві товари
 * @param expandedComponents - Об'єкт для накопичення розгорнутих компонентів
 * @param visitedSets - Set для відстеження відвіданих SKU
 * @param depth - Поточна глибина рекурсії
 */
async function expandProductSetRecursively(
  product: any,
  expandedComponents: { [sku: string]: { component: any; quantity: number } } = {},
  visitedSets: Set<string> = new Set(),
  depth: number = 0,
  multiplier: number = 1
): Promise<void> {
  const MAX_DEPTH = 10;
  
  if (depth > MAX_DEPTH) {
    console.warn(`🛑 Максимальна глибина рекурсії для SKU: ${product.sku}`);
    return;
  }

  if (visitedSets.has(product.sku)) {
    console.warn(`🔄 Циклічне посилання на SKU: ${product.sku}`);
    return;
  }

  // Парсимо set якщо це JSON string
  let set = [];
  try {
    set = typeof product.set === 'string' ? JSON.parse(product.set) : product.set || [];
  } catch (e) {
    console.warn(`Failed to parse set for product ${product.sku}:`, e);
  }

  // Якщо це комплект - розгортаємо компоненти
  if (Array.isArray(set) && set.length > 0) {
    visitedSets.add(product.sku);

    for (const setItem of set) {
      if (!setItem.id || !setItem.quantity) continue;

      // Знаходимо компонент в БД
      const component = await catalogOpsLookup.getBySku(setItem.id);

      if (!component) {
        console.warn(`⚠️ Компонент не знайдено: ${setItem.id}`);
        continue;
      }

      // Effective quantity taking into account parent multiplier
      const effectiveQty = Number(setItem.quantity) * Number(multiplier || 1);

      // Перевіряємо, чи компонент є комплектом
      let componentSet = [];
      try {
        componentSet = typeof component.set === 'string' ? JSON.parse(component.set) : component.set || [];
      } catch (e) {
        console.warn(`Failed to parse set for component ${component.sku}:`, e);
      }

      const isComponentASet = Array.isArray(componentSet) && componentSet.length > 0;

      if (isComponentASet) {
        // Це комплект - рекурсивно розгортаємо його з effectiveQty як множник
        await expandProductSetRecursively(
          component,
          expandedComponents,
          new Set(visitedSets),
          depth + 1,
          effectiveQty
        );
      } else {
        // Це кінцевий товар - додаємо його до результату
        if (expandedComponents[setItem.id]) {
          expandedComponents[setItem.id].quantity += effectiveQty;
        } else {
          expandedComponents[setItem.id] = {
            component,
            quantity: effectiveQty
          };
        }
      }
    }

    visitedSets.delete(product.sku);
  }
}

// Експорт товарів до SalesDrive
// GET /api/products/export-to-salesdrive - отримати payload для підтвердження
// POST /api/products/export-to-salesdrive - відправити на SalesDrive
router.route('/export-to-salesdrive')
  .get(authenticateToken, async (req, res) => {
    try {
      const expandSets = req.query.expandSets === 'true';
      // adjustStock=true за замовчуванням; можна вимкнути через ?adjustStock=false
      const adjustStock = req.query.adjustStock !== 'false';

      const { payload, adjustedCount } = await buildExportPayload({ expandSets, adjustStock });

      const modeMsg = expandSets ? 'Комплекти розгорнуто' : 'Комплекти "як є"';
      const adjustMsg = adjustStock ? `, скориговано залишки для ${adjustedCount} SKU` : '';
      console.log(`📦 [Export preview] ${payload.length} товарів. ${modeMsg}${adjustMsg}`);

      res.json({
        success: true,
        payload,
        count: payload.length,
        expandedSets: expandSets,
        adjustedStock: adjustStock,
        adjustedCount,
      });
    } catch (error) {
      console.error('Error preparing export payload:', error);
      res.status(500).json({ error: 'Failed to prepare export payload' });
    }
  })
  .post(authenticateToken, async (req, res) => {
    try {
      const { payload } = req.body;

      if (!payload || !Array.isArray(payload)) {
        return res.status(400).json({ error: 'Invalid payload format' });
      }

      // Відправляємо на SalesDrive
      const result = await salesDriveService.exportProductsToSalesDrive(payload);

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully exported ${payload.length} products to SalesDrive`
        });
      } else {
        res.status(500).json({
          success: false,
          errors: result.errors
        });
      }
    } catch (error) {
      console.error('Error exporting to SalesDrive:', error);
      res.status(500).json({ error: 'Failed to export to SalesDrive' });
    }
  });

// Отримати відповідність назв категорій до ID
// GET /api/products/categories-mapping
router.get('/categories-mapping', authenticateToken, async (req, res) => {
  try {
    const mapping = await catalogOpsLookup.getCategoryMapping();
    res.json({ mapping });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати товар за SKU
// GET /api/products/:sku
router.get('/:sku', authenticateToken, async (req, res) => {
  try {
    const { sku } = req.params;
    const cached = await productOpsCache.get(sku);
    if (cached) {
      return res.json(cached);
    }
    const product = await catalogOpsLookup.getBySku(sku);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(catalogOpsLookup.toApiShape(product));
  } catch (error) {
    console.log('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити вагу товару за ID
// PUT /api/products/:id/weight
router.put('/:id/weight', authenticateToken, productsEdit, async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    // Валидация входных данных
    if (typeof weight !== 'number' || weight < 0) {
      return res.status(400).json({ error: 'Weight must be a non-negative number' });
    }

    const goodId = await resolveCatalogGoodId(id);
    if (!goodId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await prisma.catalogGood.update({
      where: { id: goodId },
      data: { weight: weight / 1000 },
    });
    await catalogOpsLookup.projectGood(goodId);
    const product = await catalogOpsLookup.getByDilovodIds([goodId]);
    res.json({
      success: true,
      product: catalogOpsLookup.toApiShape([...product.values()][0]),
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити ручний порядок (manualOrder) товару за ID
// PUT /api/products/:id/manual-order
router.put('/:id/manual-order', authenticateToken, productsEdit, async (req, res) => {
  try {
    const { id } = req.params;
    const { manualOrder } = req.body;

    if (typeof manualOrder !== 'number' || manualOrder < 0) {
      return res.status(400).json({ error: 'manualOrder must be a non-negative number' });
    }

    const goodId = await resolveCatalogGoodId(id);
    if (!goodId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await prisma.catalogGood.update({
      where: { id: goodId },
      data: { sortOrder: manualOrder },
    });
    await catalogOpsLookup.projectGood(goodId);
    const product = [...(await catalogOpsLookup.getByDilovodIds([goodId])).values()][0];
    res.json({ success: true, product: product ? catalogOpsLookup.toApiShape(product) : null });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити коефіцієнт unitRatio товару за ID
// PUT /api/products/:id/unit-ratio
router.put('/:id/unit-ratio', authenticateToken, productsEdit, async (req, res) => {
  try {
    const { id } = req.params;
    const { unitRatio } = req.body;

    if (typeof unitRatio !== 'number' || !isFinite(unitRatio) || unitRatio <= 0) {
      return res.status(400).json({ error: 'unitRatio must be a positive number' });
    }

    const goodId = await resolveCatalogGoodId(id);
    if (!goodId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await prisma.catalogGood.update({
      where: { id: goodId },
      data: { unitRatio },
    });
    await catalogOpsLookup.projectGood(goodId);
    const product = [...(await catalogOpsLookup.getByDilovodIds([goodId])).values()][0];
    res.json({ success: true, product: product ? catalogOpsLookup.toApiShape(product) : null });
  } catch (error) {
    console.log('Error updating unitRatio:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити штрих-код товару за ID
// PUT /api/products/:id/barcode
router.put('/:id/barcode', authenticateToken, productsEdit, async (req, res) => {
  try {
    const { id } = req.params;
    const { barcode } = req.body;

    if (typeof barcode !== 'string') {
      return res.status(400).json({ error: 'barcode must be a string' });
    }

    const goodId = await resolveCatalogGoodId(id);
    if (!goodId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const code = barcode.trim();
    const existing = await prisma.catalogGoodBarcode.findFirst({
      where: { goodId, goodPart: '' },
    });
    if (existing) {
      await prisma.catalogGoodBarcode.update({
        where: { id: existing.id },
        data: { code, activity: true },
      });
    } else if (code) {
      await prisma.catalogGoodBarcode.create({
        data: { goodId, code, goodPart: '', activity: true },
      });
    }
    await catalogOpsLookup.projectGood(goodId);
    const product = [...(await catalogOpsLookup.getByDilovodIds([goodId])).values()][0];
    res.json({ success: true, product: product ? catalogOpsLookup.toApiShape(product) : null });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/products/:id/portions-per-box
// Оновлює кількість порцій у коробці для порційних товарів
router.put('/:id/portions-per-box', authenticateToken, productsEdit, async (req, res) => {
  try {
    const { id } = req.params;
    const { portionsPerBox } = req.body;

    const value = parseInt(portionsPerBox);
    if (isNaN(value) || value < 1) {
      return res.status(400).json({ error: 'portionsPerBox must be a positive integer' });
    }

    const goodId = await resolveCatalogGoodId(id);
    if (!goodId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await prisma.catalogGood.update({
      where: { id: goodId },
      data: { packageRatio: value },
    });
    await catalogOpsLookup.projectGood(goodId);
    const product = [...(await catalogOpsLookup.getByDilovodIds([goodId])).values()][0];
    console.log(`✅ [Products] portionsPerBox updated for ${product?.sku}: ${value}`);
    res.json({ success: true, product: product ? catalogOpsLookup.toApiShape(product) : null });
  } catch (error) {
    console.log('Error updating portionsPerBox:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Скасувати поточну синхронізацію товарів
// POST /api/products/sync/cancel
router.post('/sync/cancel', authenticateToken, productsSync, async (req, res) => {
  try {
    const cancelled = DilovodService.cancelCurrentSync();

    if (cancelled) {
      console.log('✅ Синхронізацію товарів скасовано через API');
      res.json({
        success: true,
        message: 'Синхронізацію скасовано'
      });
    } else {
      res.json({
        success: false,
        message: 'Немає активної синхронізації для скасування'
      });
    }
  } catch (error) {
    console.log('Error cancelling sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронізувати товари з Dilovod
// POST /api/products/sync
router.post('/sync', authenticateToken, productsSync, async (req, res) => {
  try {

    // Перевіряємо, чи увімкнено синхронізацію Dilovod
    const { syncSettingsService } = await import('../services/syncSettingsService.js');
    const isEnabled = await syncSettingsService.isSyncEnabled('dilovod');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронізація Dilovod вимкнена в налаштуваннях'
      });
    }

    const dilovodService = new DilovodService();
    // Реєструємо AbortController глобально — щоб POST /sync/cancel міг його скасувати
    const abortController = new AbortController();
    DilovodService.registerSyncAbortController(abortController);
    req.on('close', () => {
      console.log('Клієнт закрив зʼєднання — сигналізуємо про скасування синхронізації');
      abortController.abort();
    });

    const result = await dilovodService.syncProductsWithDilovod('full', undefined, abortController.signal);

    res.json(result);
  } catch (error) {
    console.log('Error starting sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ручна синхронізація товарів за списком SKU
// POST /api/products/sync-manual
// body: { skus: string[], force?: boolean } — force=true ігнорує dilovodDataHash
router.post('/sync-manual', authenticateToken, productsSync, async (req, res) => {
  try {
    const { skus, force } = req.body;

    // Валідація вхідних даних
    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Потрібно вказати масив SKU для синхронізації'
      });
    }

    // Очищаємо та валідуємо SKU
    const cleanedSkus = skus
      .map((sku: any) => String(sku).trim())
      .filter((sku: string) => sku.length > 0);

    if (cleanedSkus.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Жоден валідний SKU не знайдено у списку'
      });
    }

    const { activeSkus, archivedSkus } =
      await productsCatalogService.partitionCatalogSkusByArchive(cleanedSkus);
    const outdatedCount =
      await productsCatalogService.markLegacyProductsOutdatedBySku(archivedSkus);

    if (activeSkus.length === 0) {
      return res.json({
        success: true,
        message:
          outdatedCount > 0
            ? `Архівні товари позначено як застарілі (${outdatedCount})`
            : 'Немає активних SKU для Dilovod sync-manual',
        syncedProducts: 0,
        syncedSets: 0,
        createdProducts: 0,
        updatedProducts: 0,
        skippedProducts: 0,
        outdatedProducts: outdatedCount,
        errors: [],
      });
    }

    const forceUpdate = force === true;
    console.log(
      `API: Ручна синхронізація для ${activeSkus.length} SKU${forceUpdate ? ' (force)' : ''}` +
        (archivedSkus.length ? `, архівних isOutdated: ${archivedSkus.length}` : '')
    );

    const dilovodService = new DilovodService();
    // Реєструємо AbortController глобально — щоб POST /sync/cancel міг його скасувати
    const abortController = new AbortController();
    DilovodService.registerSyncAbortController(abortController);
    req.on('close', () => {
      console.log('Клієнт закрив зʼєднання під час ручної синхронізації — скасовуємо');
      abortController.abort();
    });

    const result = await dilovodService.syncProductsWithDilovod(
      'manual',
      activeSkus,
      abortController.signal,
      { force: forceUpdate }
    );

    res.json({ ...result, outdatedProducts: outdatedCount });
  } catch (error) {
    console.log('Error in manual sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронізувати залишки товарів з Dilovod
// POST /api/products/sync-stock
router.post('/sync-stock', authenticateToken, productsSync, async (req, res) => {
  try {

    // Перевіряємо, чи увімкнено синхронізацію залишків
    const { syncSettingsService } = await import('../services/syncSettingsService.js');
    const isEnabled = await syncSettingsService.isSyncEnabled('stocks');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронизация остатков отключена в настройках'
      });
    }

    const dilovodService = new DilovodService();
    const result = await dilovodService.updateStockBalancesInDatabase();

    res.json(result);
  } catch (error) {
    console.log('Error starting stock sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TEMP: Dilovod → Backoffice → SalesDrive → WooCommerce (syncStock.php)
// POST /api/products/sync-stock-chain
router.post('/sync-stock-chain', authenticateToken, productsSync, async (req, res) => {
  try {
    const { syncSettingsService } = await import('../services/syncSettingsService.js');
    const isEnabled = await syncSettingsService.isSyncEnabled('stocks');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронизация остатков отключена в настройках',
      });
    }

    console.log(`API: sync-stock-chain triggered by ${req.user?.email}`);
    const result = await cronService.runLegacyStockSyncChain(`manual:${req.user?.email ?? 'unknown'}`);

    if (result.alreadyRunning) {
      return res.status(409).json({
        success: false,
        error: result.stockMessage,
        ...result,
      });
    }

    res.json(result);
  } catch (error) {
    console.log('Error starting stock sync chain:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Ручний тригер повного ланцюжку: синк товарів → залишки → експорт SD → WP sync
// POST /api/products/sync-and-export
router.post('/sync-and-export', authenticateToken, productsSyncExport, async (req, res) => {
  const jobId = Date.now();
  console.log(`🚀 [sync-and-export #${jobId}] Manual chain triggered by ${req.user.email}`);

  // Відповідаємо одразу — ланцюжок виконується у фоні
  res.json({ success: true, message: 'Chain started', jobId });

  (async () => {
    const startTime = Date.now();

    // [1/4] Синк товарів
    console.log(`🕐 [sync-and-export #${jobId}] [1/4] Syncing products from Dilovod...`);
    try {
      const dilovodService = new DilovodService();
      const result = await dilovodService.syncProductsWithDilovod();
      if (result.success) {
        console.log(`✅ [sync-and-export #${jobId}] [1/4] Products synced in ${Date.now() - startTime}ms: ${result.syncedProducts} products, ${result.syncedSets} sets`);
      } else {
        console.warn(`⚠️ [sync-and-export #${jobId}] [1/4] Sync completed with errors: ${result.message}`);
      }
    } catch (err) {
      console.error(`❌ [sync-and-export #${jobId}] [1/4] Products sync failed:`, err);
      return;
    }

    // [2/4] Оновлення залишків
    console.log(`🕐 [sync-and-export #${jobId}] [2/4] Updating stock balances...`);
    try {
      const dilovodService = new DilovodService();
      const result = await dilovodService.updateStockBalancesInDatabase();
      console.log(`${result.success ? '✅' : '⚠️'} [sync-and-export #${jobId}] [2/4] Stock update in ${Date.now() - startTime}ms: ${result.updatedProducts} updated, ${result.errors.length} errors`);
    } catch (err) {
      console.error(`❌ [sync-and-export #${jobId}] [2/4] Stock update failed:`, err);
      // Продовжуємо
    }

    // [3/4] Експорт у SalesDrive
    console.log(`🕐 [sync-and-export #${jobId}] [3/4] Exporting to SalesDrive...`);
    let exportedOk = false;
    try {
      const result = await salesDriveService.buildAndExportProducts();
      if (result.success) {
        exportedOk = true;
        console.log(`✅ [sync-and-export #${jobId}] [3/4] Exported in ${Date.now() - startTime}ms: ${result.exported} products, ${result.adjustedCount} adjustments`);
      } else {
        console.warn(`⚠️ [sync-and-export #${jobId}] [3/4] Export failed:`, result.errors);
      }
    } catch (err) {
      console.error(`❌ [sync-and-export #${jobId}] [3/4] Export failed:`, err);
    }

    // [4/4] Тригер SD → WP
    if (exportedOk) {
      console.log(`🕐 [sync-and-export #${jobId}] [4/4] Triggering SD → WP stock sync...`);
      try {
        const wpResponse = await fetch(
          'https://nk-food.shop/wp-content/plugins/mrkv-salesdrive/inc/syncStock.php',
          { signal: AbortSignal.timeout(30_000) }
        );
        console.log(`${wpResponse.ok ? '✅' : '⚠️'} [sync-and-export #${jobId}] [4/4] WP sync HTTP ${wpResponse.status} in ${Date.now() - startTime}ms`);
      } catch (err) {
        console.error(`❌ [sync-and-export #${jobId}] [4/4] WP sync failed:`, err);
      }
    } else {
      console.log(`⏭️ [sync-and-export #${jobId}] [4/4] Skipping WP sync — SD export was not successful.`);
    }

    console.log(`🏁 [sync-and-export #${jobId}] Chain finished in ${Date.now() - startTime}ms`);
  })();
});

// Тригер лише кроку SD → WP (HTTP виклик до syncStock.php)
// POST /api/products/trigger-wp-sync
// Доступно починаючи з ролі STOREKEEPER (комірник)
router.post('/trigger-wp-sync', authenticateToken, productsSync, async (req, res) => {
  try {
    console.log(`API: trigger-wp-sync called by ${req.user.email}`);
    const wpSyncUrl = 'https://nk-food.shop/wp-content/plugins/mrkv-salesdrive/inc/syncStock.php';
    const wpResponse = await fetch(wpSyncUrl, { signal: AbortSignal.timeout(30_000) });
    if (wpResponse.ok) {
      console.log(`API: trigger-wp-sync HTTP ${wpResponse.status}`);
      return res.json({ success: true, status: wpResponse.status });
    }
    const body = await wpResponse.text().catch(() => '');
    console.warn(`API: trigger-wp-sync returned ${wpResponse.status}`);
    return res.status(502).json({ success: false, status: wpResponse.status, body });
  } catch (error) {
    console.error('API: trigger-wp-sync failed:', error);
    return res.status(500).json({ success: false, error: 'WP sync request failed' });
  }
});

// Отримати статистику по товарах
// GET /api/products/stats/summary
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const stats = await catalogOpsLookup.getStats();
    res.json({
      totalProducts: stats.totalProducts,
      activeProducts: stats.activeProducts,
      outdatedProducts: stats.outdatedProducts,
      totalSets: stats.totalSets,
      activeSets: stats.totalSets - stats.outdatedSets,
      outdatedSets: stats.outdatedSets,
      totalDishes: stats.totalDishes,
      activeDishes: stats.totalDishes - stats.outdatedDishes,
      outdatedDishes: stats.outdatedDishes,
      categoriesCount: stats.categoriesWithActive,
      activeCategoriesCount: stats.activeCategoriesTotal,
      lastSync: stats.lastSyncAt,
    });
  } catch (error) {
    console.log('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Тест підключення до Dilovod (listMetadata)
// POST /api/products/test-connection
router.post('/test-connection', authenticateToken, async (req, res) => {
  try {
    const dilovodService = new DilovodService();
    const result = await dilovodService.testConnection();

    res.json(result);
  } catch (error) {
    console.log('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Тест отримання залишків за списком SKU
// POST /api/products/test-balance-by-sku
router.post('/test-balance-by-sku', authenticateToken, productsSync, async (req, res) => {
  try {
    console.log('=== API: test-balance-by-sku вызван ===');

    console.log('API: Создаем DilovodService...');
    const dilovodService = new DilovodService();

    console.log('API: Вызываем getBalanceBySkuList...');
    const result = await dilovodService.getBalanceBySkuList();

    console.log('API: Результат остатков по списку SKU получен:', result);
    res.json(result);
  } catch (error: any) {
    console.log('API: Ошибка в test-balance-by-sku:', error);

    if (
      error &&
      typeof error.message === 'string' &&
      error.message.includes('multithreadApiSession multithread api request blocked')
    ) {
      res.status(429).json({
        error: 'Dilovod API: multithreadApiSession multithread api request blocked',
        message: 'Dilovod API заблокировал многопоточный запрос. Попробуйте позже или уменьшите частоту обращений.'
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Тест отримання тільки комплектів
// POST /api/products/test-sets-only
router.post('/test-sets-only', authenticateToken, productsSync, async (req, res) => {
  try {
    console.log('=== API: test-sets-only вызван ===');

    console.log('API: Создаем DilovodService...');
    const dilovodService = new DilovodService();

    console.log('API: Вызываем testSetsOnly...');
    const result = await dilovodService.testSetsOnly();

    console.log('API: Результат только комплектов получен:', result);
    res.json(result);
  } catch (error) {
    console.log('API: Ошибка в test-sets-only:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати залишки товарів з можливістю синхронізації
// GET /api/products/stock/balance
router.get('/stock/balance', authenticateToken, productsSync, async (req, res) => {
  try {
    const { sync = 'false' } = req.query;
    const shouldSync = sync === 'true';

    const dilovodService = new DilovodService();

    const list = await catalogOpsLookup.listFinishedProducts({ includeOutdated: true });
    const products = list.map((p) => catalogOpsLookup.toApiShape(p));

    if (shouldSync) {
      const syncResult = await dilovodService.syncProductsWithDilovod();

      if (!syncResult.success) {
        return res.status(500).json({
          error: 'Sync failed',
          details: syncResult
        });
      }

      const after = await catalogOpsLookup.listFinishedProducts({ includeOutdated: true });
      res.json({
        message: 'Sync completed successfully',
        syncResult,
        products: after.map((p) => catalogOpsLookup.toApiShape(p)),
      });
    } else {
      res.json({ products });
    }
  } catch (error) {
    console.log('Error in stock balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
