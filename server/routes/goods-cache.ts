import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dilovodService } from '../services/dilovod/DilovodService.js';
import { prisma } from '../lib/utils.js';
import { DilovodCacheManager } from '../services/dilovod/DilovodCacheManager.js';

const router = express.Router();

// GET /api/goods-cache/status - get goods cache status
router.get('/status', async (req, res) => {
  try {
    const status = await dilovodService.getGoodsCacheStatus();
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/goods-cache/refresh - refresh goods cache
router.post('/refresh', async (req, res) => {
  try {
    // Підтримуємо опціональний список SKU в тілі запиту
    // Якщо він не передано — отримуємо свіжі SKU напряму з WordPress
    let skuList: string[] | undefined = req.body?.skuList;
    if (!skuList || !Array.isArray(skuList)) {
      const cacheManager = new DilovodCacheManager();
      skuList = await cacheManager.fetchFreshSkusFromWordPress();
    }

    // Підмішуємо всі SKU з таблиці settings_wp_sku.skus
    const skuWhiteList = await prisma.settingsWpSku.findFirst({ orderBy: { lastUpdated: 'desc' } });
    if (skuWhiteList && skuWhiteList.skus) {
      let dbSkus: string[] = [];
      try {
        dbSkus = JSON.parse(skuWhiteList.skus);
      } catch {
        dbSkus = skuWhiteList.skus.split(',').map(s => s.trim()).filter(Boolean);
      }
      // Об'єднуємо списки, уникаючи дублікатів
      skuList = [...new Set([...(skuList || []), ...dbSkus])];
    }

    const result = await dilovodService.refreshGoodsCache(skuList);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
