/**
 * Роути імпорту банківських виписок
 *
 * POST /api/dilovod/bank-statement/preview
 * POST /api/dilovod/bank-statement/export  (?dryRun=true)
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, requirePermissionKey } from '../middleware/auth.js';
import { bankStatementImportService } from '../services/dilovod/BankStatementImportService.js';
import { bankStatementExportBuilder } from '../services/dilovod/BankStatementExportBuilder.js';
import { bankStatementTemplateService } from '../services/dilovod/BankStatementTemplateService.js';
import { logServer } from '../lib/utils.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import type {
  BankStatementExportRequest,
  BankStatementParseMapping,
  BankStatementTemplate,
  BankStatementTemplatesState,
} from '../../shared/types/bankStatement.js';

const router = Router();
const accountingBankStatements = requirePermissionKey(PERMISSIONS.PAGE_ACCOUNTING_BANK_STATEMENTS);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Непідтримуваний формат файлу: ${file.mimetype}`));
    }
  },
});

router.post(
  '/preview',
  authenticateToken,
  accountingBankStatements,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'Файл не завантажено. Поле: file' });
        return;
      }

      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      logServer(`📂 [BankStatement] Отримано файл: ${fileName} (${req.file.size} байт)`);

      let mapping: Partial<BankStatementParseMapping> | undefined;
      const rawMapping = req.body?.mapping;
      if (typeof rawMapping === 'string' && rawMapping.trim()) {
        try {
          mapping = JSON.parse(rawMapping) as Partial<BankStatementParseMapping>;
        } catch {
          res.status(400).json({ message: 'Некоректний JSON мапінгу колонок' });
          return;
        }
      }

      const result = await bankStatementImportService.parseAndValidate(req.file.buffer, mapping);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logServer(`❌ [BankStatement] Помилка парсингу: ${message}`);
      res.status(500).json({ message: `Помилка парсингу файлу: ${message}` });
    }
  }
);

router.post(
  '/export',
  authenticateToken,
  accountingBankStatements,
  async (req, res) => {
    try {
      const { rows, fileCashAccount } = req.body as BankStatementExportRequest;

      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ message: 'Масив рядків порожній або відсутній' });
        return;
      }

      const isDryRun = req.query.dryRun === 'true';
      const userId: number | undefined = (req as { user?: { userId?: number; id?: number } }).user?.userId
        || (req as { user?: { userId?: number; id?: number } }).user?.id;

      if (isDryRun) {
        logServer(`🔍 [BankStatement] Dry-run: ${rows.length} рядків`);
        const result = await bankStatementExportBuilder.buildPayloads(rows, userId, fileCashAccount);
        res.json({
          dryRun: true,
          count: result.payloads.length,
          firm: result.firm,
          firmName: result.firmName ?? null,
          cashAccount: result.cashAccount,
          fileCashAccount: fileCashAccount || null,
          payloads: result.payloads,
        });
        return;
      }

      logServer(`🚀 [BankStatement] Відправка ${rows.length} рядків в Діловод...`);
      const result = await bankStatementExportBuilder.exportAll(rows, userId, fileCashAccount);
      res.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logServer(`❌ [BankStatement] Помилка експорту: ${message}`);
      res.status(500).json({ message: `Помилка вивантаження в Діловод: ${message}` });
    }
  }
);

router.get(
  '/templates',
  authenticateToken,
  accountingBankStatements,
  async (_req, res) => {
    try {
      const state = await bankStatementTemplateService.getState();
      res.json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message });
    }
  }
);

router.put(
  '/templates',
  authenticateToken,
  accountingBankStatements,
  async (req, res) => {
    try {
      const body = req.body as Partial<BankStatementTemplatesState> & { template?: BankStatementTemplate };
      if (body.kindKeywords !== undefined || body.inlineEditColumns !== undefined) {
        const extras = await bankStatementTemplateService.patchExtras({
          kindKeywords: body.kindKeywords,
          inlineEditColumns: body.inlineEditColumns,
        });
        if (!body.template && !(body.templates && body.activeId)) {
          res.json(extras);
          return;
        }
      }
      if (body.template) {
        const state = await bankStatementTemplateService.upsertTemplate(body.template, true);
        res.json(state);
        return;
      }
      if (body.templates && body.activeId) {
        const state = await bankStatementTemplateService.saveState({
          activeId: body.activeId,
          templates: body.templates,
        });
        res.json(state);
        return;
      }
      res.status(400).json({ message: 'Потрібен template або { templates, activeId }' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message });
    }
  }
);

router.post(
  '/templates/active',
  authenticateToken,
  accountingBankStatements,
  async (req, res) => {
    try {
      const id = String((req.body as { id?: string })?.id ?? '');
      if (!id) {
        res.status(400).json({ message: 'id шаблону обовʼязковий' });
        return;
      }
      const state = await bankStatementTemplateService.setActive(id);
      res.json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message });
    }
  }
);

router.delete(
  '/templates/:id',
  authenticateToken,
  accountingBankStatements,
  async (req, res) => {
    try {
      const state = await bankStatementTemplateService.deleteTemplate(req.params.id);
      res.json(state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ message });
    }
  }
);

export default router;
