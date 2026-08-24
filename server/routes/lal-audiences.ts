import { Router, Request, Response } from 'express';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { logServer } from '../lib/utils.js';
import {
  lalAudiencesService,
  parseLalAudienceFilters,
} from '../services/LalAudiencesService.js';
import type { LalExportFormat } from '../../shared/types/lalAudiences.js';

const router = Router();
const lalManage = requirePermission('lal', 'manage', 'LAL аудиторії (експорт)');

router.get('/', authenticateToken, lalManage, async (req: Request, res: Response) => {
  try {
    const filters = parseLalAudienceFilters(req.query as Record<string, unknown>);
    const result = await lalAudiencesService.list(filters);
    res.json(result);
  } catch (error) {
    logServer('[LalAudiences] GET failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Не вдалося побудувати аудиторію',
    });
  }
});

router.post('/export', authenticateToken, lalManage, async (req: Request, res: Response) => {
  try {
    const parsed = parseLalAudienceFilters(
      (req.body ?? {}) as Record<string, unknown>,
      { requireFormat: true }
    );
    const format: LalExportFormat = parsed.format === 'xlsx' ? 'xlsx' : 'csv';
    const file = await lalAudiencesService.export(
      parsed,
      format,
      parsed.excludePhones ?? [],
      parsed.columns ?? []
    );

    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  } catch (error) {
    logServer('[LalAudiences] POST export failed', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Не вдалося експортувати аудиторію',
    });
  }
});

export default router;
