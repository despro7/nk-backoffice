/**
 * Роути для імпорту реєстру переказів (Cash-In Import)
 *
 * POST /api/dilovod/cash-in/preview  — парсинг Excel + валідація проти БД
 * POST /api/dilovod/cash-in/export   — побудова payload та відправка в Dilovod
 *                                      ?dryRun=true — повертає payload без відправки
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, requireMinRole, ROLES } from '../middleware/auth.js';
import { cashInImportService } from '../services/dilovod/CashInImportService.js';
import { cashInExportBuilder } from '../services/dilovod/CashInExportBuilder.js';
import { logServer } from '../lib/utils.js';
import type { CashInExportRequest } from '../../shared/types/cashIn.js';

const router = Router();

// Multer: зберігаємо файл в пам'яті (не на диск) — файли невеликі
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — з запасом
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel',                                           // xls
      'text/csv',
      'application/octet-stream', // деякі браузери відправляють xlsx як octet-stream
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Непідтримуваний формат файлу: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/dilovod/cash-in/preview
 * Приймає Excel-файл, парсить та валідує рядки проти БД.
 * Повертає масив рядків зі статусами валідації.
 */
router.post(
  '/preview',
  authenticateToken,
  requireMinRole(ROLES.SHOP_MANAGER),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'Файл не завантажено. Поле: file' });
        return;
      }

      // multer зберігає originalname як Latin-1 — декодуємо в UTF-8
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      logServer(`📂 [CashIn] Отримано файл: ${fileName} (${req.file.size} байт)`);

      const result = await cashInImportService.parseAndValidate(req.file.buffer);
      res.json(result);
    } catch (error: any) {
      logServer(`❌ [CashIn] Помилка парсингу: ${error.message}`);
      res.status(500).json({ message: `Помилка парсингу файлу: ${error.message}` });
    }
  }
);

/**
 * POST /api/dilovod/cash-in/export
 * Приймає підтверджені рядки, будує Payload та відправляє в Dilovod.
 *
 * Query-параметр ?dryRun=true — повертає payload без відправки (для debug).
 */
router.post(
  '/export',
  authenticateToken,
  requireMinRole(ROLES.SHOP_MANAGER),
  async (req, res) => {
    try {
      const { rows } = req.body as CashInExportRequest;

      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ message: 'Масив рядків порожній або відсутній' });
        return;
      }

      const isDryRun = req.query.dryRun === 'true';
      const userId: number | undefined = (req as any).user?.userId || (req as any).user?.id;

      if (isDryRun) {
        // Dry-run: повертаємо payload без відправки (тільки для ADMIN в debug-режимі)
        logServer(`🔍 [CashIn] Dry-run: побудова payload для ${rows.length} рядків`);
        const result = await cashInExportBuilder.buildPayloads(rows, userId);
        res.json({
          dryRun: true,
          count: result.payloads.length,
          firm: result.firm,
          cashAccount: result.cashAccount,
          payloads: result.payloads,
        });
        return;
      }

      // Реальна відправка
      logServer(`🚀 [CashIn] Відправка ${rows.length} рядків в Діловод...`);
      const result = await cashInExportBuilder.exportAll(rows, userId);
      res.json(result);
    } catch (error: any) {
      logServer(`❌ [CashIn] Помилка експорту: ${error.message}`);
      res.status(500).json({ message: `Помилка вивантаження в Діловод: ${error.message}` });
    }
  }
);

export default router;
