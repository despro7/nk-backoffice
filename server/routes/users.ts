import express from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users?ids=1,2,3
router.get('/', authenticateToken, async (req, res) => {
  try {
    const idsParam = String(req.query.ids || '');
    const ids = idsParam.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (ids.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error in /api/users:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

export default router;
