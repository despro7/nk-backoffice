
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { dilovodService } from '../services/dilovod/DilovodService.js';
import { getUserById } from '../lib/utils.js';

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

    // Resolve user names for numeric initiatedBy values
    const userIds = [...new Set(
      logs
        .map((l: any) => l.initiatedBy)
        .filter((v: any) => v && /^\d+$/.test(v))
        .map((v: any) => parseInt(v, 10))
    )] as number[];

    const usersMap: Record<number, { name: string | null; email: string }> = {};
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true }
      });
      for (const u of users) {
        usersMap[u.id] = { name: u.name, email: u.email };
      }
    }

    const logsWithNames = logs.map((log: any) => {
      const raw: string | null = log.initiatedBy ?? null;
      const isUserId = raw && /^\d+$/.test(raw);
      const userRecord = isUserId ? usersMap[parseInt(raw!, 10)] : undefined;
      return {
        ...log,
        initiatedBy: {
          raw,
          name: userRecord?.name ?? null,
          email: userRecord?.email ?? null
        }
      };
    });

    res.json(logsWithNames);
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// GET /api/meta-logs/count?orderNumber=12345 - count logs for order
router.get('/count', async (req, res) => {
  try {
    const { orderNumber } = req.query;
    if (!orderNumber) return res.status(400).json({ success: false, error: 'orderNumber is required' });

    // @ts-ignore
    const count = await prisma.meta_logs.count({ where: { orderNumber: String(orderNumber) as any } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// GET /api/meta-logs/:id - fetch single log by id (with resolved initiatedBy)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

    const log = await prisma.meta_logs.findUnique({ where: { id } });
    if (!log) return res.status(404).json({ success: false, error: 'Not found' });

    // Resolve initiatedBy user name
    const raw: string | null = (log as any).initiatedBy ?? null;
    const isUserId = raw && /^\d+$/.test(raw);
    let userRecord = isUserId ? await getUserById(raw) : undefined;

    res.json({
      ...(log as any),
      initiatedBy: { raw, name: userRecord?.name ?? null, email: userRecord?.email ?? null }
    });
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
