import express from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken, requireRole, requireMinRole, ROLE_SETS, ROLES } from '../middleware/auth.js';
import { DilovodService } from '../services/dilovod/index.js';
import { handleDilovodApiError } from '../services/dilovod/DilovodUtils.js';
import { salesDriveService } from '../services/salesDriveService.js';
import { buildExportPayload } from '../services/productExportHelper.js';

const router = express.Router();

// Отримати всі товари з пагінацією
// GET /api/products
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const category = req.query.category as string;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } }
      ];
    }

    if (category) {
      where.categoryName = category;
    }

    const sortBy = (req.query.sortBy as string) || 'lastSyncAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

    const orderBy: any = {};
    if (['lastSyncAt', 'name', 'categoryName', 'weight', 'manualOrder'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy['lastSyncAt'] = 'desc';
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy
      }),
      prisma.product.count({ where })
    ]);

    // Парсим JSON поля для всех продуктов с обработкой ошибок
    const parsedProducts = products.map(product => ({
      ...product,
      set: product.set ? (() => {
        try {
          return JSON.parse(product.set);
        } catch (e) {
          console.warn(`Failed to parse set for product ${product.sku}:`, e);
          return null;
        }
      })() : null,
      additionalPrices: product.additionalPrices ? (() => {
        try {
          return JSON.parse(product.additionalPrices);
        } catch (e) {
          console.warn(`Failed to parse additionalPrices for product ${product.sku}:`, e);
          return null;
        }
      })() : null,
      stockBalanceByStock: product.stockBalanceByStock ? (() => {
        try {
          return JSON.parse(product.stockBalanceByStock);
        } catch (e) {
          console.warn(`Failed to parse stockBalanceByStock for product ${product.sku}:`, e);
          return null;
        }
      })() : null
    }));

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

// Отримати один товар безпосередньо з Dilovod за SKU (без повної синхронізації)
// GET /api/products/dilovod/:sku
router.get('/dilovod/:sku', authenticateToken, requireMinRole(ROLES.SHOP_MANAGER), async (req, res) => {
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

// Отримати SKU whitelist (settings_wp_sku)
// GET /api/products/sku-whitelist
router.get('/sku-whitelist', authenticateToken, requireMinRole(ROLES.BOSS), async (req, res) => {
  try {
    const record = await prisma.settingsWpSku.findFirst();
    if (!record) {
      return res.json({ skus: '', totalCount: 0, lastUpdated: null });
    }

    res.json({ skus: record.skus || '', totalCount: record.totalCount || 0, lastUpdated: record.lastUpdated });
  } catch (error) {
    console.log('Error fetching SKU whitelist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити SKU whitelist
// PUT /api/products/sku-whitelist
router.put('/sku-whitelist', authenticateToken, requireMinRole(ROLES.BOSS), async (req, res) => {
  try {
    const { skus } = req.body;
    if (typeof skus !== 'string') {
      return res.status(400).json({ error: 'skus must be a string' });
    }

    // Очищаємо список і підраховуємо
    const parsed = skus.split(/[\s,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    const totalCount = parsed.length;

    const existing = await prisma.settingsWpSku.findFirst();
    if (existing) {
      await prisma.settingsWpSku.update({
        where: { id: existing.id },
        data: { skus: parsed.join(', '), totalCount, lastUpdated: new Date() }
      });
    } else {
      await prisma.settingsWpSku.create({
        data: { skus: parsed.join(', '), totalCount, lastUpdated: new Date() }
      });
    }

    res.json({ success: true, totalCount });
  } catch (error) {
    console.log('Error updating SKU whitelist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати масив ID груп комплектів (dilovod_set_parent_ids)
// GET /api/products/set-parent-ids
router.get('/set-parent-ids', authenticateToken, requireMinRole(ROLES.BOSS), async (req, res) => {
  try {
    // Спочатку читаємо новий ключ (масив), потім — старий (один рядок) для backward-compatibility
    const newRecord = await prisma.settingsBase.findFirst({
      where: { key: 'dilovod_set_parent_ids', isActive: true }
    });

    if (newRecord) {
      try {
        const ids = JSON.parse(newRecord.value) as string[];
        return res.json({ ids });
      } catch {
        // Ignore parse error and fall through
      }
    }

    const oldRecord = await prisma.settingsBase.findFirst({
      where: { key: 'dilovod_set_parent_id', isActive: true }
    });

    if (oldRecord?.value) {
      return res.json({ ids: [oldRecord.value] });
    }

    // Значення за замовчуванням
    res.json({ ids: ['1100300000001315'] });
  } catch (error) {
    console.log('Error fetching set-parent-ids:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити масив ID груп комплектів (dilovod_set_parent_ids)
// PUT /api/products/set-parent-ids
router.put('/set-parent-ids', authenticateToken, requireRole(ROLE_SETS.ADMIN_ONLY), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.some((id: any) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'ids must be an array of strings' });
    }

    const cleaned = ids.map((id: string) => id.trim()).filter((id: string) => id.length > 0);

    await prisma.settingsBase.upsert({
      where: { key: 'dilovod_set_parent_ids' },
      update: { value: JSON.stringify(cleaned), isActive: true },
      create: {
        key: 'dilovod_set_parent_ids',
        value: JSON.stringify(cleaned),
        description: 'Масив ID батьківських груп комплектів у Dilovod',
        category: 'dilovod',
        isActive: true
      }
    });

    // Очищаємо кеш конфігурації Dilovod, щоб зміни підхопились одразу
    const { clearConfigCache } = await import('../services/dilovod/DilovodUtils.js');
    clearConfigCache();

    console.log(`✅ dilovod_set_parent_ids оновлено: ${JSON.stringify(cleaned)}`);
    res.json({ success: true, ids: cleaned });
  } catch (error) {
    console.log('Error updating set-parent-ids:', error);
    res.status(500).json({ error: 'Internal server error' });
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
  depth: number = 0
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
      const component = await prisma.product.findUnique({
        where: { sku: setItem.id }
      });

      if (!component) {
        console.warn(`⚠️ Компонент не знайдено: ${setItem.id}`);
        continue;
      }

      // Перевіряємо, чи компонент є комплектом
      let componentSet = [];
      try {
        componentSet = typeof component.set === 'string' ? JSON.parse(component.set) : component.set || [];
      } catch (e) {
        console.warn(`Failed to parse set for component ${component.sku}:`, e);
      }

      const isComponentASet = Array.isArray(componentSet) && componentSet.length > 0;

      if (isComponentASet) {
        // Це комплект - рекурсивно розгортаємо його
        await expandProductSetRecursively(
          component,
          expandedComponents,
          new Set(visitedSets),
          depth + 1
        );
      } else {
        // Це кінцевий товар - додаємо його до результату
        if (expandedComponents[setItem.id]) {
          expandedComponents[setItem.id].quantity += setItem.quantity;
        } else {
          expandedComponents[setItem.id] = {
            component,
            quantity: setItem.quantity
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
    // Отримуємо унікальні пари categoryName -> categoryId
    const categoryMappings = await prisma.product.findMany({
      where: {
        categoryName: { not: null },
        categoryId: { not: null }
      },
      select: {
        categoryName: true,
        categoryId: true
      },
      distinct: ['categoryName', 'categoryId']
    });

    // Групуємо по categoryName, вибираємо перший categoryId (якщо є кілька)
    const mapping: { [name: string]: number } = {};
    categoryMappings.forEach(item => {
      if (item.categoryName && item.categoryId && !mapping[item.categoryName]) {
        mapping[item.categoryName] = item.categoryId;
      }
    });

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
    const product = await prisma.product.findUnique({
      where: { sku }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Парсим JSON поля с обработкой ошибок
    const parsedProduct = {
      ...product,
      set: product.set ? (() => {
        try {
          return JSON.parse(product.set);
        } catch (e) {
          console.warn(`Failed to parse set for product ${sku}:`, e);
          return null;
        }
      })() : null,
      additionalPrices: product.additionalPrices ? (() => {
        try {
          return JSON.parse(product.additionalPrices);
        } catch (e) {
          console.warn(`Failed to parse additionalPrices for product ${sku}:`, e);
          return null;
        }
      })() : null,
      stockBalanceByStock: product.stockBalanceByStock ? (() => {
        try {
          return JSON.parse(product.stockBalanceByStock);
        } catch (e) {
          console.warn(`Failed to parse stockBalanceByStock for product ${sku}:`, e);
          return null;
        }
      })() : null
    };

    res.json(parsedProduct);
  } catch (error) {
    console.log('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити вагу товару за ID
// PUT /api/products/:id/weight
router.put('/:id/weight', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    // Валидация входных данных
    if (typeof weight !== 'number' || weight < 0) {
      return res.status(400).json({ error: 'Weight must be a non-negative number' });
    }

    const productId = parseInt(id);

    // Проверяем, существует ли товар
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Обновляем вес товара
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { weight: weight }
    });

    res.json({
      success: true,
      product: updatedProduct
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити ручний порядок (manualOrder) товару за ID
// PUT /api/products/:id/manual-order
router.put('/:id/manual-order', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { manualOrder } = req.body;

    if (typeof manualOrder !== 'number' || manualOrder < 0) {
      return res.status(400).json({ error: 'manualOrder must be a non-negative number' });
    }

    const productId = parseInt(id);
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: ({ manualOrder } as any)
    });

    res.json({ success: true, product: updatedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити штрих-код товару за ID
// PUT /api/products/:id/barcode
router.put('/:id/barcode', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { barcode } = req.body;

    if (typeof barcode !== 'string') {
      return res.status(400).json({ error: 'barcode must be a string' });
    }

    const productId = parseInt(id);
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: ({ barcode } as any)
    });

    res.json({ success: true, product: updatedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/products/:id/portions-per-box
// Оновлює кількість порцій у коробці для порційних товарів
router.put('/:id/portions-per-box', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { id } = req.params;
    const { portionsPerBox } = req.body;

    const value = parseInt(portionsPerBox);
    if (isNaN(value) || value < 1) {
      return res.status(400).json({ error: 'portionsPerBox must be a positive integer' });
    }

    const productId = parseInt(id);
    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { portionsPerBox: value }
    });

    console.log(`✅ [Products] portionsPerBox updated for product ${existingProduct.sku}: ${existingProduct.portionsPerBox} → ${value}`);
    res.json({ success: true, product: updatedProduct });
  } catch (error) {
    console.log('Error updating portionsPerBox:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Скасувати поточну синхронізацію товарів
// POST /api/products/sync/cancel
router.post('/sync/cancel', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
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
router.post('/sync', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
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
router.post('/sync-manual', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { skus } = req.body;

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

    console.log(`API: Ручна синхронізація для ${cleanedSkus.length} SKU`);

    const dilovodService = new DilovodService();
    // Реєструємо AbortController глобально — щоб POST /sync/cancel міг його скасувати
    const abortController = new AbortController();
    DilovodService.registerSyncAbortController(abortController);
    req.on('close', () => {
      console.log('Клієнт закрив зʼєднання під час ручної синхронізації — скасовуємо');
      abortController.abort();
    });

    const result = await dilovodService.syncProductsWithDilovod('manual', cleanedSkus, abortController.signal);

    res.json(result);
  } catch (error) {
    console.log('Error in manual sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронізувати залишки товарів з Dilovod
// POST /api/products/sync-stock
router.post('/sync-stock', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
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

// Ручний тригер повного ланцюжку: синк товарів → залишки → експорт SD → WP sync
// POST /api/products/sync-and-export
router.post('/sync-and-export', authenticateToken, requireRole(ROLE_SETS.ADMIN_ONLY), async (req, res) => {
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

// Отримати статистику по товарах
// GET /api/products/stats/summary
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const [
      totalProducts,
      outdatedProducts,
      totalSets,
      outdatedSets,
      totalDishes,
      outdatedDishes,
      categoriesCount,
      activeCategoriesCount,
      lastSync
    ] = await Promise.all([
      // Всього товарів
      prisma.product.count(),
      // Застарілих товарів
      prisma.product.count({ where: { isOutdated: true } }),
      // Всього комплектів (set != null)
      prisma.product.count({ where: { set: { not: null } } }),
      // Застарілих комплектів
      prisma.product.count({ where: { set: { not: null }, isOutdated: true } }),
      // Всього страв (окремих, не-комплектних товарів: set == null)
      prisma.product.count({ where: { set: null } }),
      // Застарілих страв
      prisma.product.count({ where: { set: null, isOutdated: true } }),
      // Всі товари по категоріях
      prisma.product.groupBy({
        by: ['categoryName'],
        _count: { categoryName: true }
      }),
      // Активні товари по категоріях
      prisma.product.groupBy({
        by: ['categoryName'],
        where: { isOutdated: false },
        _count: { categoryName: true }
      }),
      prisma.product.findFirst({
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true }
      })
    ]);

    // Будуємо map активних товарів по категорії
    const activeCountMap = new Map(
      activeCategoriesCount.map(c => [c.categoryName, c._count.categoryName])
    );

    const categoriesWithActive = categoriesCount.map(c => ({
      name: c.categoryName || 'Без категорії',
      count: c._count.categoryName,
      activeCount: activeCountMap.get(c.categoryName) ?? 0
    }));

    const activeCategoriesTotal = categoriesWithActive.filter(c => c.activeCount > 0).length;

    res.json({
      totalProducts,
      activeProducts: totalProducts - outdatedProducts,
      outdatedProducts,
      totalSets,
      activeSets: totalSets - outdatedSets,
      outdatedSets,
      totalDishes,
      activeDishes: totalDishes - outdatedDishes,
      outdatedDishes,
      categoriesCount: categoriesWithActive,
      activeCategoriesCount: activeCategoriesTotal,
      lastSync: lastSync?.lastSyncAt
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
router.post('/test-balance-by-sku', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
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
router.post('/test-sets-only', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
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
router.get('/stock/balance', authenticateToken, requireMinRole(ROLES.STOREKEEPER), async (req, res) => {
  try {
    const { sync = 'false' } = req.query;
    const shouldSync = sync === 'true';

    const dilovodService = new DilovodService();

    if (shouldSync) {
      // Синхронизируем товары с Dilovod
      const syncResult = await dilovodService.syncProductsWithDilovod();

      if (!syncResult.success) {
        return res.status(500).json({
          error: 'Sync failed',
          details: syncResult
        });
      }

      res.json({
        message: 'Sync completed successfully',
        syncResult,
        products: await prisma.product.findMany({
          orderBy: { lastSyncAt: 'desc' }
        })
      });
    } else {
      // Просто возвращаем товары из базы
      const products = await prisma.product.findMany({
        orderBy: { lastSyncAt: 'desc' }
      });

      res.json({ products });
    }
  } catch (error) {
    console.log('Error in stock balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
