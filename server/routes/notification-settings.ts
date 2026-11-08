/**
 * Notification Centre settings (playground at /settings/notifications).
 * Access: page.settings.notifications (admin has it implicitly).
 *
 * GET    /rules · POST /rules · PUT /rules/:id · PATCH /rules/:id/enabled · DELETE /rules/:id
 * PUT    /rules/reorder { ids } · POST /rules/:id/reset
 * GET    /glossary · POST /glossary · PUT /glossary/:id · DELETE /glossary/:id
 * GET    /revisions · POST /revisions/:id/revert
 * GET    /sources?days=90 · GET /logs?search&category&status&limit&ids
 * GET    /preview-feed?role=&tab= – feed as seen by a role (current user as addressee)
 * GET    /telegram · PUT /telegram { botToken?, enabled? } · DELETE /telegram/links/:userId · POST /telegram/test
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { sendInsufficientRole } from '../middleware/requirePermission.js';
import { roleService } from '../services/RoleService.js';
import { pageKey } from '../../shared/constants/permissions.js';
import { NOTIFICATION_TABS, type NotificationTab } from '../../shared/types/notifications.js';
import {
  NotificationTelegramError,
  notificationTelegramService as telegram,
} from '../modules/Notifications/NotificationTelegramService.js';
import {
  NotificationSettingsError,
  notificationSettingsService as service,
} from '../modules/Notifications/NotificationSettingsService.js';

const router = Router();
const PAGE_KEY = pageKey('settings', 'notifications');

async function requireNotificationSettings(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (await roleService.hasPermission(req.user.role, PAGE_KEY)) return next();
  return sendInsufficientRole(res, 'Немає доступу до налаштувань сповіщень', { permissionKey: PAGE_KEY });
}

router.use(authenticateToken, requireNotificationSettings);

type Handler = (req: Request, res: Response) => Promise<unknown>;

function wrap(fn: Handler) {
  return async (req: Request, res: Response) => {
    try {
      const data = await fn(req, res);
      if (!res.headersSent) res.json({ success: true, data: data ?? null });
    } catch (err) {
      if (err instanceof NotificationTelegramError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err instanceof NotificationSettingsError) {
        return res.status(err.status).json({ success: false, error: err.message, details: err.details });
      }
      console.error('❌ [NotificationSettings]', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  };
}

const uid = (req: Request) => req.user!.userId;
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new NotificationSettingsError('Невірний id');
  return id;
};

// ── Rules ────────────────────────────────────────────────────────────────────
router.get('/rules', wrap(() => service.listRules()));
router.post('/rules', wrap((req) => service.createRule(req.body, uid(req))));
router.put('/rules/reorder', wrap(async (req) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  await service.reorderRules(ids, uid(req));
  return service.listRules();
}));
router.put('/rules/:id', wrap((req) => service.updateRule(idParam(req), req.body, uid(req))));
router.patch('/rules/:id/enabled', wrap(async (req) => {
  await service.setRuleEnabled(idParam(req), req.body?.enabled === true, uid(req));
  return service.listRules();
}));
router.delete('/rules/:id', wrap((req) => service.deleteRule(idParam(req), uid(req))));
router.post('/rules/:id/reset', wrap((req) => service.resetRule(idParam(req), uid(req))));

// ── Glossary ─────────────────────────────────────────────────────────────────
router.get('/glossary', wrap(() => service.listGlossary()));
router.post('/glossary', wrap((req) => service.createGlossary(req.body, uid(req))));
router.put('/glossary/:id', wrap((req) => service.updateGlossary(idParam(req), req.body, uid(req))));
router.delete('/glossary/:id', wrap((req) => service.deleteGlossary(idParam(req), uid(req))));

// ── History ──────────────────────────────────────────────────────────────────
router.get('/revisions', wrap((req) => service.listRevisions(Number(req.query.limit) || 100)));
router.post('/revisions/:id/revert', wrap((req) => service.revert(idParam(req), uid(req))));

// ── Playground data ──────────────────────────────────────────────────────────
router.get('/sources', wrap((req) => service.listSources(Number(req.query.days) || 90)));
router.get('/logs', wrap((req) => {
  const ids = typeof req.query.ids === 'string'
    ? req.query.ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : undefined;
  return service.listRawLogs({
    search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined,
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    limit: Number(req.query.limit) || 300,
    ids,
  });
}));

// ── Telegram ─────────────────────────────────────────────────────────────────
router.get('/telegram', wrap(() => telegram.adminState()));
router.put('/telegram', wrap(async (req) => {
  await telegram.saveSettings({
    botToken: typeof req.body?.botToken === 'string' ? req.body.botToken : undefined,
    enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
  });
  return telegram.adminState();
}));
router.delete('/telegram/links/:id', wrap(async (req) => {
  await telegram.unlink(idParam(req));
  return telegram.adminState();
}));
router.post('/telegram/test', wrap((req) => telegram.sendTest(uid(req))));

router.get('/preview-feed', wrap(async (req) => {
  const role = typeof req.query.role === 'string' && req.query.role ? req.query.role : req.user!.role;
  await roleService.assertRoleExists(role);
  const tabParam = String(req.query.tab ?? 'all') as NotificationTab;
  const tab: NotificationTab = NOTIFICATION_TABS.includes(tabParam) ? tabParam : 'all';
  const permissions = await roleService.getPermissionSet(role);
  return service.feedService.getFeed({ userId: uid(req), isAdmin: role === 'admin', permissions }, tab, 100);
}));

export default router;
