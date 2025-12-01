import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { dilovodService } from '../services/dilovod/DilovodService.js';

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
      const { DilovodCacheManager } = await import('../services/dilovod/DilovodCacheManager.js');
      const cacheManager = new DilovodCacheManager();
      skuList = await cacheManager.fetchFreshSkusFromWordPress();
    }

    const result = await dilovodService.refreshGoodsCache(skuList);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
