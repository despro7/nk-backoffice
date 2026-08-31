import express from 'express';
import { dilovodService } from '../services/dilovod/DilovodService.js';
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
    // Опційний список SKU в тілі; інакше — активні SKU з catalog_goods (Готова продукція)
    let skuList: string[] | undefined = req.body?.skuList;
    if (!skuList || !Array.isArray(skuList)) {
      const cacheManager = new DilovodCacheManager();
      skuList = await cacheManager.fetchFreshSkusFromCatalog();
    }

    const result = await dilovodService.refreshGoodsCache(skuList);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
