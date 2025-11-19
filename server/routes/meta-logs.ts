
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { dilovodService } from '../services/dilovod/DilovodService.js';

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/meta-logs?orderNumber=12345 - fetch logs for order
router.get('/', async (req, res) => {
  try {
    const { orderNumber } = req.query;
    if (!orderNumber) {
      return res.status(400).json({ success: false, error: 'orderNumber is required' });
    }
    // Use explicit orderNumber column for direct DB filtering
    const logs = await prisma.meta_logs.findMany({
      // @ts-ignore - `orderNumber` field will exist after running `npx prisma generate`
      where: { orderNumber: String(orderNumber) as any },
      orderBy: { datetime: 'desc' }
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// GET /api/meta-logs/count?orderNumber=12345 - count logs for order
router.get('/count', async (req, res) => {
  try {
    const { orderNumber } = req.query;
    if (!orderNumber) return res.status(400).json({ success: false, error: 'orderNumber is required' });

    // @ts-ignore - `orderNumber` field will exist after running `npx prisma generate`
    const count = await prisma.meta_logs.count({ where: { orderNumber: String(orderNumber) as any } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});


// Універсальний лог-ендпоінт
router.post('/', async (req, res) => {
  try {
    const { category, title, status, message, data } = req.body;
    // Dilovod export логування
    if (category === 'dilovod-export') {
      await dilovodService.logMetaDilovodExport({ title, status, message, data });
      return res.json({ success: true });
    }
    // Save any other categories as well - store orderNumber if present for easy lookup
    try {
      // @ts-ignore - `orderNumber` will exist in Prisma model after regeneration
      await prisma.meta_logs.create({
        // @ts-ignore
        data: { category, title, status, message, data, orderNumber: data && typeof data === 'object' && 'orderNumber' in data ? (data as any).orderNumber : undefined } as any
      });
    } catch (err) {
      console.error('meta-logs: failed to persist log', err);
    }

    res.json({ success: true }); // ✅ stored (or best-effort)
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;
