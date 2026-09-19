import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { prisma, logServer } from '../lib/utils.js';
import { supportReportSettingsService } from '../services/SupportReportSettingsService.js';
import { telegramAlertService } from '../services/TelegramAlertService.js';
import { ServerLogBuffer } from '../services/ServerLogBuffer.js';
import type {
  SupportReportPayload,
  SupportReportMetadata,
} from '../../shared/types/supportReport.js';

const router = Router();

/** In-memory rate limit: userId → last submit timestamp */
const lastSubmitByUser = new Map<number, number>();

function extractOrderNumber(url: string): string | undefined {
  const match = url.match(/\/orders\/([^/?#]+)/i);
  return match?.[1];
}

function formatClientLogs(
  logs: SupportReportPayload['clientLogs'],
): string | undefined {
  if (!logs?.length) return undefined;
  return logs
    .map((entry) => `[${entry.ts}] ${entry.level}: ${entry.message}`)
    .join('\n');
}

function fetchRecentServerConsoleLogs(limit: number): string | undefined {
  if (limit <= 0) return undefined;
  return ServerLogBuffer.getRecentLines(limit);
}

async function fetchRecentServerMetaLogs(
  userId: number,
  limit: number,
): Promise<string | undefined> {
  if (limit <= 0) return undefined;
  try {
    const rows = await prisma.meta_logs.findMany({
      where: { initiatedBy: String(userId) },
      orderBy: { datetime: 'desc' },
      take: limit,
      select: {
        id: true,
        datetime: true,
        category: true,
        status: true,
        title: true,
        message: true,
      },
    });
    if (!rows.length) return undefined;
    return rows
      .map(
        (row) =>
          `[${row.datetime.toISOString()}] #${row.id} ${row.category}/${row.status}: ${row.title || ''} ${row.message || ''}`.trim(),
      )
      .join('\n');
  } catch (error) {
    logServer('support-reports: failed to fetch server meta_logs', error);
    return undefined;
  }
}

function parseScreenshotBase64(base64?: string): Buffer | undefined {
  if (!base64) return undefined;
  const cleaned = base64.replace(/^data:image\/[\w+.-]+;base64,/, '');
  try {
    const buf = Buffer.from(cleaned, 'base64');
    return buf.length > 0 ? buf : undefined;
  } catch {
    return undefined;
  }
}

/** Публічні ліміти для авторизованих користувачів */
router.get('/config', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const settings = await supportReportSettingsService.getSettings();
    ServerLogBuffer.configure(settings.serverLogLines);
    res.json({
      success: true,
      data: supportReportSettingsService.getPublicConfig(settings),
    });
  } catch (error) {
    logServer('support-reports config error', error);
    res.status(500).json({ success: false, error: 'Failed to load config' });
  }
});

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const settings = await supportReportSettingsService.getSettings();
    ServerLogBuffer.configure(settings.serverLogLines);
    const body = req.body as SupportReportPayload;

    if (!body?.metadata || typeof body.metadata !== 'object') {
      return res.status(400).json({ success: false, error: 'metadata is required' });
    }

    const comment = (body.comment || '').trim();
    if (comment.length > settings.maxCommentLength) {
      return res.status(400).json({
        success: false,
        error: `Коментар перевищує ${settings.maxCommentLength} символів`,
      });
    }

    const lastSubmit = lastSubmitByUser.get(userId) ?? 0;
    const elapsed = (Date.now() - lastSubmit) / 1000;
    if (elapsed < settings.rateLimitSeconds) {
      const wait = Math.ceil(settings.rateLimitSeconds - elapsed);
      return res.status(429).json({
        success: false,
        error: `Зачекайте ${wait} с перед наступним звітом`,
      });
    }

    const screenshotBuffer = parseScreenshotBase64(body.screenshotBase64);
    const maxBytes = settings.maxScreenshotMb * 1024 * 1024;
    if (screenshotBuffer && screenshotBuffer.length > maxBytes) {
      return res.status(400).json({
        success: false,
        error: `Скриншот перевищує ${settings.maxScreenshotMb} МБ`,
      });
    }

    const metadata: SupportReportMetadata = {
      ...body.metadata,
      userId: body.metadata.userId ?? userId,
      userEmail: body.metadata.userEmail ?? req.user!.email,
      userName: body.metadata.userName ?? req.user!.name,
      userRole: body.metadata.userRole ?? req.user!.role,
      orderNumber:
        body.metadata.orderNumber ??
        extractOrderNumber(body.metadata.url || body.metadata.pathname || ''),
    };

    const clientLogsText = formatClientLogs(body.clientLogs);
    const serverConsoleLogsText = fetchRecentServerConsoleLogs(settings.serverLogLines);
    const serverMetaLogsText = await fetchRecentServerMetaLogs(
      userId,
      settings.serverMetaLogLines,
    );

    const metaLog = await prisma.meta_logs.create({
      data: {
        category: 'user_report',
        status: 'warning',
        title: 'Звіт користувача',
        message: comment || 'Без коментаря',
        orderNumber: metadata.orderNumber ?? null,
        initiatedBy: String(userId),
        data: {
          url: metadata.url,
          pathname: metadata.pathname,
          comment,
          hasScreenshot: Boolean(screenshotBuffer),
          userAgent: metadata.userAgent,
          viewport: metadata.viewport,
          appVersion: metadata.appVersion,
          clientLogCount: body.clientLogs?.length ?? 0,
        },
      },
    });

    lastSubmitByUser.set(userId, Date.now());

    try {
      await telegramAlertService.sendUserReport({
        reportId: metaLog.id,
        reportCreatedAt: metaLog.datetime,
        comment,
        metadata,
        clientLogs: clientLogsText,
        serverConsoleLogs: serverConsoleLogsText,
        serverMetaLogs: serverMetaLogsText,
        screenshotBuffer,
      });
    } catch (telegramError) {
      logServer('support-reports: Telegram send failed (report saved)', telegramError);
    }

    res.json({
      success: true,
      reportId: metaLog.id,
      message: 'Звіт надіслано адміністратору',
    });
  } catch (error) {
    logServer('support-reports POST error', error);
    res.status(500).json({ success: false, error: 'Не вдалося надіслати звіт' });
  }
});

export default router;
