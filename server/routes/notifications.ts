/**
 * Notification Centre — backed by meta_logs.readBy JSON field.
 *
 * readBy structure: Record<string, string>
 *   key   = userId as string, e.g. "3"
 *   value = ISO timestamp when the user read it
 *   "_all" = special key: marked as read for ALL users at that timestamp
 *
 * GET    /api/notifications          – list (errors + warnings)
 * GET    /api/notifications/unread-count
 * PUT    /api/notifications/:id/read – mark one as read by current user
 * PUT    /api/notifications/read-all – mark all as read for current user
 * DELETE /api/notifications/read-state – clear own read marks (debug / reset)
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../lib/utils.js';
import type { AppNotification, NotificationsResponse } from '../../shared/types/notifications.js';

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

/** Структура поля readBy в meta_logs: { "3": "ISO", "_all": "ISO" } */
type ReadByMap = Record<string, string>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseReadBy(raw: unknown): ReadByMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ReadByMap;
}

/** Чи прочитав цей userId (або є _all ключ) */
function isReadBy(readBy: ReadByMap, userId: number): boolean {
  return `${userId}` in readBy || '_all' in readBy;
}

function resolveTag(initiatedBy: string | null | undefined): string {
  if (!initiatedBy) return 'system';
  if (initiatedBy.startsWith('webhook:'))  return 'webhook';
  if (initiatedBy.startsWith('cron:'))     return 'cron';
  if (initiatedBy.startsWith('manual:'))   return 'manual';
  if (initiatedBy.startsWith('system:'))   return 'system';
  if (/^\d+$/.test(initiatedBy))           return 'manual';
  return initiatedBy.split(':')[0] || 'system';
}

function resolveSeverity(status: string): AppNotification['severity'] {
  if (status === 'error')   return 'error';
  if (status === 'warning') return 'warning';
  if (status === 'success') return 'success';
  return 'info';
}

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const severityParam = (req.query.severity as string | undefined)
      ?.split(',').map(s => s.trim()) ?? ['error', 'warning'];
    // successCategories — категорії, success-записи яких теж відображаємо в bell
    // Передається як: &successCategories=warehouse_movement,other_category
    const successCategoriesParam = (req.query.successCategories as string | undefined)
      ?.split(',').map(s => s.trim()) ?? [];
    const unreadOnly = req.query.unreadOnly === '1' || req.query.unreadOnly === 'true';

    const baseStatuses: string[] = [];
    if (severityParam.includes('error'))   baseStatuses.push('error');
    if (severityParam.includes('warning')) baseStatuses.push('warning');
    // success без категорій — показуємо всі success
    if (severityParam.includes('success') && successCategoriesParam.length === 0) baseStatuses.push('success');

    // Будуємо WHERE: базові severity OR (success + конкретні категорії)
    let whereClause: any = undefined;
    if (baseStatuses.length > 0 && successCategoriesParam.length > 0) {
      whereClause = {
        OR: [
          { status: { in: baseStatuses } },
          { status: 'success', category: { in: successCategoriesParam } },
        ],
      };
    } else if (baseStatuses.length > 0) {
      whereClause = { status: { in: baseStatuses } };
    }

    const logs = await prisma.meta_logs.findMany({
      where: whereClause,
      orderBy: { datetime: 'desc' },
      take: limit,
      select: {
        id: true,
        datetime: true,
        category: true,
        title: true,
        status: true,
        message: true,
        orderNumber: true,
        initiatedBy: true,
        readBy: true,
        hiddenBy: true,
      },
    });

    // Фільтруємо приховані поточним юзером (або _all)
    const visibleLogs = logs.filter((log) => !isReadBy(parseReadBy(log.hiddenBy), userId));

    const notifications: AppNotification[] = visibleLogs.map((log) => {
      const readBy = parseReadBy(log.readBy);
      return {
        id:          log.id,
        severity:    resolveSeverity(log.status),
        title:       log.title || log.category,
        message:     log.message || '',
        createdAt:   log.datetime.toISOString(),
        read:        isReadBy(readBy, userId),
        orderNumber: log.orderNumber ?? null,
        tag:         resolveTag(log.initiatedBy),
        category:    log.category,
      };
    });

    const filtered    = unreadOnly ? notifications.filter(n => !n.read) : notifications;
    const unreadCount = notifications.filter(n => !n.read).length;

    const response: NotificationsResponse = {
      success: true,
      data: filtered,
      unreadCount,
      total: filtered.length,
      serverTime: new Date().toISOString(),
    };

    res.json(response);
  } catch (err) {
    console.error('❌ [Notifications] GET / error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── GET /api/notifications/unread-count ─────────────────────────────────────

router.get('/unread-count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const logs = await prisma.meta_logs.findMany({
      where: { status: { in: ['error', 'warning'] } },
      select: { readBy: true, hiddenBy: true },
    });

    const unreadCount = logs.filter(
      (l) => !isReadBy(parseReadBy(l.hiddenBy), userId) && !isReadBy(parseReadBy(l.readBy), userId)
    ).length;
    res.json({ success: true, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/read-all ─────────────────────────────────────────
// ВАЖЛИВО: має бути ДО маршруту /:id/read

router.put('/read-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now    = new Date().toISOString();
    const userKey = `${userId}`;

    // Обираємо тільки логи, які не приховані для цього юзера (не в hiddenBy[userId] і не в hiddenBy["_all"])
    // і ще не прочитані (не в readBy[userId] і не в readBy["_all"])
    const logs = await (prisma.meta_logs.findMany as any)({
      where: { status: { in: ['error', 'warning'] } },
      select: { id: true, readBy: true, hiddenBy: true },
    });

    const toMark = (logs as any[]).filter((log: any) => {
      const hidden = parseReadBy(log.hiddenBy);
      const read   = parseReadBy(log.readBy);
      return !isReadBy(hidden, userId) && !isReadBy(read, userId);
    });

    if (toMark.length === 0) {
      return res.json({ success: true, markedCount: 0 });
    }

    // Один batched raw SQL: JSON_SET readBy для всіх потрібних id
    const ids = (toMark as any[]).map((l: any) => l.id);
    await (prisma.$executeRawUnsafe as any)(
      `UPDATE meta_logs SET readBy = JSON_SET(COALESCE(readBy, '{}'), ?, ?) WHERE id IN (${ids.map(() => '?').join(',')})`,
      `$.${userKey}`,
      now,
      ...ids,
    );

    res.json({ success: true, markedCount: ids.length });
  } catch (err) {
    console.error('❌ [Notifications] PUT /read-all error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/read-all-global ──────────────────────────────────
// Позначає всі записи прочитаними для ВСІХ юзерів через readBy["_all"].
// ?offset=N — виключити останні N записів (за datetime desc).
// Тільки для debug-режиму (адмін/ручний виклик).

router.put('/read-all-global', authenticateToken, async (req: Request, res: Response) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const now    = new Date().toISOString();

    // Беремо всі error/warning логи, відсортовані від нових до старих
    const logs = await (prisma.meta_logs.findMany as any)({
      where: { status: { in: ['error', 'warning'] } },
      orderBy: { datetime: 'desc' },
      select: { id: true, readBy: true },
    });

    // Виключаємо перші `offset` (найновіші) — вони залишаться непрочитаними
    const toMark = (logs as any[]).slice(offset);

    let markedCount = 0;
    for (const log of toMark) {
      const readBy = parseReadBy(log.readBy);
      if (!('_all' in readBy)) {
        readBy['_all'] = now;
        await (prisma.meta_logs.update as any)({ where: { id: log.id }, data: { readBy } });
        markedCount++;
      }
    }

    res.json({ success: true, markedCount, skipped: offset });
  } catch (err) {
    console.error('❌ [Notifications] PUT /read-all-global error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/:id/hide-global ──────────────────────────────────
// [admin] Ховає одне повідомлення для ВСІХ юзерів через hiddenBy["_all"].
// Аналог "Вирішено" — позначає питання вирішеним.

router.put('/:id/hide-global', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin role required' });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

    const log = await prisma.meta_logs.findUnique({ where: { id }, select: { id: true, hiddenBy: true } });
    if (!log) return res.status(404).json({ success: false, error: 'Not found' });

    const hiddenBy = parseReadBy(log.hiddenBy);
    if (!('_all' in hiddenBy)) {
      hiddenBy['_all'] = new Date().toISOString();
      await prisma.meta_logs.update({ where: { id }, data: { hiddenBy } });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('❌ [Notifications] PUT /:id/hide-global error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/:id/read ─────────────────────────────────────────

router.put('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

    const log = await (prisma.meta_logs.findUnique as any)({ where: { id }, select: { id: true, readBy: true } });
    if (!log) return res.status(404).json({ success: false, error: 'Not found' });

    const readBy = parseReadBy(log.readBy);
    if (!isReadBy(readBy, userId)) {
      readBy[`${userId}`] = new Date().toISOString();
      await (prisma.meta_logs.update as any)({ where: { id }, data: { readBy } });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('❌ [Notifications] PUT /:id/read error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/hide-all ─────────────────────────────────────────
// Ховає всі error/warning для поточного юзера через hiddenBy[userId]

router.put('/hide-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now    = new Date().toISOString();

    const logs = await prisma.meta_logs.findMany({
      where: { status: { in: ['error', 'warning'] } },
      select: { id: true, hiddenBy: true },
    });

    let hiddenCount = 0;
    for (const log of logs) {
      const hiddenBy = parseReadBy(log.hiddenBy);
      if (!isReadBy(hiddenBy, userId)) {
        hiddenBy[`${userId}`] = now;
        await prisma.meta_logs.update({ where: { id: log.id }, data: { hiddenBy } });
        hiddenCount++;
      }
    }

    res.json({ success: true, hiddenCount });
  } catch (err) {
    console.error('❌ [Notifications] PUT /hide-all error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── PUT /api/notifications/hide-all-global ───────────────────────────────────
// [debug] Ховає для ВСІХ юзерів через hiddenBy["_all"]. ?offset=N — пропустити N найновіших.

router.put('/hide-all-global', authenticateToken, async (req: Request, res: Response) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const now    = new Date().toISOString();

    const logs = await prisma.meta_logs.findMany({
      where: { status: { in: ['error', 'warning'] } },
      orderBy: { datetime: 'desc' },
      select: { id: true, hiddenBy: true },
    });

    const toHide = logs.slice(offset);

    let hiddenCount = 0;
    for (const log of toHide) {
      const hiddenBy = parseReadBy(log.hiddenBy);
      if (!('_all' in hiddenBy)) {
        hiddenBy['_all'] = now;
        await prisma.meta_logs.update({ where: { id: log.id }, data: { hiddenBy } });
        hiddenCount++;
      }
    }

    res.json({ success: true, hiddenCount, skipped: offset });
  } catch (err) {
    console.error('❌ [Notifications] PUT /hide-all-global error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── DELETE /api/notifications/hidden-state ───────────────────────────────────
// Скидає HIDDEN-позначки поточного userId (повертає приховані назад у список)

router.delete('/hidden-state', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId  = req.user!.userId;
    const userKey = `${userId}`;

    const logs = await prisma.meta_logs.findMany({
      where: { status: { in: ['error', 'warning'] } },
      select: { id: true, hiddenBy: true },
    });

    let clearedCount = 0;
    for (const log of logs) {
      const hiddenBy = parseReadBy(log.hiddenBy);
      if (userKey in hiddenBy || '_all' in hiddenBy) {
        delete hiddenBy[userKey];
        delete hiddenBy['_all'];
        await prisma.meta_logs.update({ where: { id: log.id }, data: { hiddenBy } });
        clearedCount++;
      }
    }

    res.json({ success: true, clearedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// ─── DELETE /api/notifications/read-state ────────────────────────────────────
// Скидає READ-позначки поточного userId (debug / reset)

router.delete('/read-state', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId  = req.user!.userId;
    const userKey = `${userId}`;

    const logs = await (prisma.meta_logs.findMany as any)({
      where: { status: { in: ['error', 'warning'] } },
      select: { id: true, readBy: true },
    });

    let clearedCount = 0;
    for (const log of logs as any[]) {
      const readBy = parseReadBy(log.readBy);
      if (userKey in readBy || '_all' in readBy) {
        delete readBy[userKey];
        delete readBy['_all'];
        await (prisma.meta_logs.update as any)({ where: { id: log.id }, data: { readBy } });
        clearedCount++;
      }
    }

    res.json({ success: true, clearedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;