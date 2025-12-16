import express from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken } from '../middleware/auth.js';
import { DilovodService, logWithTimestamp } from '../services/dilovod/index.js';
import { handleDilovodApiError } from '../services/dilovod/DilovodUtils.js';
import { salesDriveService } from '../services/salesDriveService.js';

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
    logWithTimestamp('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати один товар безпосередньо з Dilovod за SKU (без повної синхронізації)
// GET /api/products/dilovod/:sku
router.get('/dilovod/:sku', authenticateToken, async (req, res) => {
  try {

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'shop-manager'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, shop-manager'
      });
    }

    const { sku } = req.params;
    const dilovodService = new DilovodService();
    logWithTimestamp(`API: Получаем товар из Dilovod по SKU=${sku}`);

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
    logWithTimestamp('Error fetching single product from Dilovod:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати SKU whitelist (settings_wp_sku)
// GET /api/products/sku-whitelist
router.get('/sku-whitelist', authenticateToken, async (req, res) => {
  try {
    // Тільки для адміністраторів
    if (!req.user || !['admin', 'boss'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const record = await prisma.settingsWpSku.findFirst();
    if (!record) {
      return res.json({ skus: '', totalCount: 0, lastUpdated: null });
    }

    res.json({ skus: record.skus || '', totalCount: record.totalCount || 0, lastUpdated: record.lastUpdated });
  } catch (error) {
    logWithTimestamp('Error fetching SKU whitelist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити SKU whitelist
// PUT /api/products/sku-whitelist
router.put('/sku-whitelist', authenticateToken, async (req, res) => {
  try {
    if (!req.user || !['admin', 'boss'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

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
    logWithTimestamp('Error updating SKU whitelist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Експорт товарів до SalesDrive
// GET /api/products/export-to-salesdrive - отримати payload для підтвердження
// POST /api/products/export-to-salesdrive - відправити на SalesDrive
router.route('/export-to-salesdrive')
  .get(authenticateToken, async (req, res) => {
    try {
      // Отримуємо всі товари з БД
      const products = await prisma.product.findMany({
        orderBy: { name: 'asc' },
        where: {
          isOutdated: { not: true }
        }
      });

      // Формуємо payload для SalesDrive
      const payload = products.map(product => {
        // Парсимо JSON поля
        let set = [];
        try {
          set = product.set ? JSON.parse(product.set) : [];
        } catch (e) {
          console.warn(`Failed to parse set for product ${product.sku}:`, e);
        }

        let additionalPrices = [];
        try {
          additionalPrices = product.additionalPrices ? JSON.parse(product.additionalPrices) : [];
        } catch (e) {
          console.warn(`Failed to parse additionalPrices for product ${product.sku}:`, e);
        }

        let stockBalanceByStock = {};
        try {
          stockBalanceByStock = product.stockBalanceByStock ? JSON.parse(product.stockBalanceByStock) : {};
        } catch (e) {
          console.warn(`Failed to parse stockBalanceByStock for product ${product.sku}:`, e);
        }

        return {
          id: product.sku,
          name: product.name,
          sku: product.sku,
          costPerItem: (product.costPerItem || 0).toFixed(5),
          currency: product.currency || 'UAH',
          category: {
            id: product.categoryId || 0,
            name: product.categoryName || ''
          },
          set,
          additionalPrices,
          stockBalanceByStock
        };
      });

      res.json({
        success: true,
        payload,
        count: payload.length
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
    logWithTimestamp('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Оновити вагу товару за ID
// PUT /api/products/:id/weight
router.put('/:id/weight', authenticateToken, async (req, res) => {
  try {

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

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
router.put('/:id/manual-order', authenticateToken, async (req, res) => {
  try {

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

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
router.put('/:id/barcode', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

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

// Синхронізувати товари з Dilovod
// POST /api/products/sync
router.post('/sync', authenticateToken, async (req, res) => {
  try {

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Недостатньо прав доступу. Потрібні ролі: admin, boss, storekeeper'
      });
    }

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
    const result = await dilovodService.syncProductsWithDilovod();

    res.json(result);
  } catch (error) {
    logWithTimestamp('Error starting sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ручна синхронізація товарів за списком SKU
// POST /api/products/sync-manual
router.post('/sync-manual', authenticateToken, async (req, res) => {
  try {
    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Недостатньо прав доступу. Потрібні ролі: admin, boss, storekeeper'
      });
    }

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

    logWithTimestamp(`API: Ручна синхронізація для ${cleanedSkus.length} SKU`);

    const dilovodService = new DilovodService();
    const result = await dilovodService.syncProductsWithDilovod('manual', cleanedSkus);

    res.json(result);
  } catch (error) {
    logWithTimestamp('Error in manual sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Синхронізувати залишки товарів з Dilovod
// POST /api/products/sync-stock
router.post('/sync-stock', authenticateToken, async (req, res) => {
  try {

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

    // Проверяем, включена ли синхронизация остатков
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
    logWithTimestamp('Error starting stock sync:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати статистику по товарах
// GET /api/products/stats/summary
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const [totalProducts, totalSets, categoriesCount, lastSync] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: {
          set: {
            not: null
          }
        }
      }),
      prisma.product.groupBy({
        by: ['categoryName'],
        _count: { categoryName: true }
      }),
      prisma.product.findFirst({
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true }
      })
    ]);

    res.json({
      totalProducts,
      totalSets,
      categoriesCount: categoriesCount.map(c => ({
        name: c.categoryName || 'Без категории',
        count: c._count.categoryName
      })),
      lastSync: lastSync?.lastSyncAt
    });
  } catch (error) {
    logWithTimestamp('Error fetching stats:', error);
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
    logWithTimestamp('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Тест отримання залишків за списком SKU
// POST /api/products/test-balance-by-sku
router.post('/test-balance-by-sku', authenticateToken, async (req, res) => {
  try {
    logWithTimestamp('=== API: test-balance-by-sku вызван ===');

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

    logWithTimestamp('API: Создаем DilovodService...');
    const dilovodService = new DilovodService();

    logWithTimestamp('API: Вызываем getBalanceBySkuList...');
    const result = await dilovodService.getBalanceBySkuList();

    logWithTimestamp('API: Результат остатков по списку SKU получен:', result);
    res.json(result);
  } catch (error: any) {
    logWithTimestamp('API: Ошибка в test-balance-by-sku:', error);

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
router.post('/test-sets-only', authenticateToken, async (req, res) => {
  try {
    logWithTimestamp('=== API: test-sets-only вызван ===');

    // Перевіряємо ролі доступу
    if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
      });
    }

    logWithTimestamp('API: Создаем DilovodService...');
    const dilovodService = new DilovodService();

    logWithTimestamp('API: Вызываем testSetsOnly...');
    const result = await dilovodService.testSetsOnly();

    logWithTimestamp('API: Результат только комплектов получен:', result);
    res.json(result);
  } catch (error) {
    logWithTimestamp('API: Ошибка в test-sets-only:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отримати залишки товарів з можливістю синхронізації
// GET /api/products/stock/balance
router.get('/stock/balance', authenticateToken, async (req, res) => {
  try {
    const { sync = 'false' } = req.query;
    const shouldSync = sync === 'true';

    const dilovodService = new DilovodService();

    if (shouldSync) {
      // Перевіряємо ролі доступу
      if (!req.user || !['admin', 'boss', 'storekeeper'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions. Required roles: admin, boss, storekeeper'
        });
      }

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
    logWithTimestamp('Error in stock balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
