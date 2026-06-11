import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import ExpandService from '../services/expandService.js';

const router = express.Router();

// POST /api/expand/flatten
// Body: { skus: string[] }
router.post('/flatten', authenticateToken, async (req, res) => {
  try {
    const { skus } = req.body;
    if (!Array.isArray(skus) || skus.length === 0) {
      return res.status(400).json({ error: 'skus must be a non-empty array' });
    }

    const payload = await ExpandService.flattenBatch(skus);
    res.json({ success: true, products: payload.products, notFound: payload.notFound, foundCount: payload.foundCount, durationMs: payload.durationMs });
  } catch (error) {
    console.error('Error in /api/expand/flatten:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
