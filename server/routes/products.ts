import express from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken } from '../middleware/auth.js';
import { DilovodService, logWithTimestamp } from '../services/dilovod/index.js';

const router = express.Router();

// Получить все товары с пагинацией
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
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (category) {
      where.categoryName = category;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastSyncAt: 'desc' }
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

// Получить товар по SKU
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

// Обновить вес товара по ID
router.put('/:id/weight', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;
    
    // Проверяем права доступа (только ADMIN и BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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

// Синхронизировать товары с Dilovod
router.post('/sync', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Проверяем права доступа (только ADMIN и BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Проверяем, включена ли синхронизация Dilovod
    const { syncSettingsService } = await import('../services/syncSettingsService.js');
    const isEnabled = await syncSettingsService.isSyncEnabled('dilovod');

    if (!isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Синхронизация Dilovod отключена в настройках'
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

// Синхронизировать остатки товаров с Dilovod
router.post('/sync-stock', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Проверяем права доступа (только ADMIN и BOSS)
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
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

// Получить статистику по товарам
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const [totalProducts, categoriesCount, lastSync] = await Promise.all([
      prisma.product.count(),
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

// Тест подключения к Dilovod (listMetadata)
router.post('/test-connection', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;
    
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const dilovodService = new DilovodService();
    const result = await dilovodService.testConnection();
    
    res.json(result);
  } catch (error) {
    logWithTimestamp('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Тест получения остатков по списку SKU
router.post('/test-balance-by-sku', authenticateToken, async (req, res) => {
  try {
    logWithTimestamp('=== API: test-balance-by-sku вызван ===');
    
    const { user } = req as any;
    
    if (!['admin', 'boss'].includes(user.role)) {
      logWithTimestamp('API: Access denied для пользователя:', user.role);
      return res.status(403).json({ error: 'Access denied' });
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

// Тест получения только комплектов
router.post('/test-sets-only', authenticateToken, async (req, res) => {
  try {
    logWithTimestamp('=== API: test-sets-only вызван ===');
    
    const { user } = req as any;
    
    if (!['admin', 'boss'].includes(user.role)) {
      logWithTimestamp('API: Access denied для пользователя:', user.role);
      return res.status(403).json({ error: 'Access denied' });
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

// Очистить кеш SKU
router.post('/clear-sku-cache', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;
    
    if (!['admin', 'boss'].includes(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const dilovodService = new DilovodService();
    const result = await dilovodService.clearSkuCache();
    
    res.json(result);
  } catch (error) {
    logWithTimestamp('Error clearing SKU cache:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить остатки товаров с возможностью синхронизации
router.get('/stock/balance', authenticateToken, async (req, res) => {
  try {
    const { sync = 'false' } = req.query;
    const shouldSync = sync === 'true';
    
    const dilovodService = new DilovodService();
    
    if (shouldSync) {
      // Проверяем права доступа для синхронизации (только ADMIN и BOSS)
      const { user } = req as any;
      if (!['admin', 'boss'].includes(user.role)) {
        return res.status(403).json({ error: 'Access denied for sync operation' });
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
