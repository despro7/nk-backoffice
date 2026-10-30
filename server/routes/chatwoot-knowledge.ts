import { Router, type Response } from 'express';
import { authenticateToken, requirePermission, requirePermissionKey } from '../middleware/auth.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import { logServer } from '../lib/utils.js';
import {
  ChatwootBotKnowledgeValidationError,
  chatwootBotKnowledgeService,
} from '../modules/ChatwootBot/ChatwootBotKnowledgeService.js';
import type { ChatwootBotKnowledgeEntryInput } from '../../shared/types/chatwootBotKnowledge.js';

/**
 * База знань Chatwoot Bot. Окремий роутер із власними правами (менеджер ролей → «Чат-бот»),
 * незалежними від прав на налаштування бота.
 */
const router = Router();
const authOnly = [authenticateToken] as const;
// Читання — за доступом до сторінки «База знань», зміни — окрема дія.
const knowledgeRead = requirePermissionKey(PERMISSIONS.PAGE_CHATWOOT_KNOWLEDGE);
const knowledgeManage = requirePermission('chatwoot', 'knowledgeManage', 'Редагування бази знань чат-бота');

function handleError(res: Response, error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error);
  logServer(`[ChatwootKnowledge] ${context}: ${message}`, error);
  const notFound = typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025';
  const status = error instanceof ChatwootBotKnowledgeValidationError ? 400 : notFound ? 404 : 500;
  res.status(status).json({ success: false, error: notFound ? 'Статтю не знайдено' : message });
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bodyInput(body: unknown): Partial<ChatwootBotKnowledgeEntryInput> {
  return (body ?? {}) as Partial<ChatwootBotKnowledgeEntryInput>;
}

router.get('/', ...authOnly, knowledgeRead, async (_req, res) => {
  try {
    res.json({ success: true, data: await chatwootBotKnowledgeService.list() });
  } catch (error) {
    handleError(res, error, 'GET');
  }
});

/** POST /search { query } — що знайде бот (для перевірки статей). */
router.post('/search', ...authOnly, knowledgeRead, async (req, res) => {
  try {
    const query = String(req.body?.query ?? '').trim();
    res.json({ success: true, data: query ? await chatwootBotKnowledgeService.search(query, 5) : [] });
  } catch (error) {
    handleError(res, error, 'search');
  }
});

router.post('/', ...authOnly, knowledgeManage, async (req, res) => {
  try {
    const data = await chatwootBotKnowledgeService.create(bodyInput(req.body), req.user?.userId ?? null);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'POST');
  }
});

router.put('/:id', ...authOnly, knowledgeManage, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, error: 'Невірний id' });
    return;
  }
  try {
    const data = await chatwootBotKnowledgeService.update(id, bodyInput(req.body), req.user?.userId ?? null);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error, 'PUT');
  }
});

router.delete('/:id', ...authOnly, knowledgeManage, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, error: 'Невірний id' });
    return;
  }
  try {
    await chatwootBotKnowledgeService.remove(id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'DELETE');
  }
});

export default router;
