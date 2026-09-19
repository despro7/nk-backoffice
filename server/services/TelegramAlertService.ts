import { logServer } from '../lib/utils.js';
import { supportReportSettingsService } from './SupportReportSettingsService.js';
import type { SupportReportMetadata } from '../../shared/types/supportReport.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const TELEGRAM_CAPTION_LIMIT = 1024;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 20)}\n… (truncated)`;
}

function getImageFileMeta(buffer: Buffer): { mime: string; ext: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  return { mime: 'image/png', ext: 'png' };
}

function formatReportTimestamp(reportCreatedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = [
    reportCreatedAt.getFullYear(),
    pad(reportCreatedAt.getMonth() + 1),
    pad(reportCreatedAt.getDate()),
  ].join('-');
  const time = [
    pad(reportCreatedAt.getHours()),
    pad(reportCreatedAt.getMinutes()),
    pad(reportCreatedAt.getSeconds()),
  ].join('-');
  return `${stamp}_${time}`;
}

/** Точна дата для імені .log файлу: backoffice-report_2026-09-19_20-04-33_#42.log */
export function formatReportLogFilename(reportCreatedAt: Date, reportId: number): string {
  return `backoffice-report_${formatReportTimestamp(reportCreatedAt)}_#${reportId}.log`;
}

/** Скриншот як document (PNG/JPEG без стиснення Telegram photo): …_#42.png */
export function formatReportScreenshotFilename(
  reportCreatedAt: Date,
  reportId: number,
  ext: string,
): string {
  return `backoffice-report_${formatReportTimestamp(reportCreatedAt)}_#${reportId}.${ext}`;
}

type SendUserReportParams = {
  reportId: number;
  reportCreatedAt: Date;
  comment: string;
  metadata: SupportReportMetadata;
  clientLogs?: string;
  serverConsoleLogs?: string;
  serverMetaLogs?: string;
  screenshotBuffer?: Buffer;
};

export class TelegramAlertService {
  private async getBotConfig(): Promise<{ token: string; chatId: string; enabled: boolean }> {
    const settings = await supportReportSettingsService.getSettings();
    return {
      token: settings.telegramBotToken,
      chatId: settings.telegramAlertChatId,
      enabled: settings.telegramAlertsEnabled,
    };
  }

  async sendTestMessage(): Promise<void> {
    const { token, chatId, enabled } = await this.getBotConfig();
    if (!enabled) {
      throw new Error('Telegram alerts вимкнені в налаштуваннях');
    }
    if (!token || !chatId) {
      throw new Error('Не налаштовано Telegram bot token або chat ID');
    }

    const text = [
      '✅ <b>Тестове повідомлення Backoffice</b>',
      '',
      'Інтеграція «Звіти користувачів / Telegram» працює.',
      `Час: ${escapeHtml(new Date().toLocaleString('uk-UA'))}`,
    ].join('\n');

    await this.sendMessage(token, chatId, text);
  }

  async sendUserReport(params: SendUserReportParams): Promise<void> {
    const { token, chatId, enabled } = await this.getBotConfig();
    if (!enabled) {
      logServer('TelegramAlertService: alerts disabled, skipping Telegram send');
      return;
    }
    if (!token || !chatId) {
      logServer('TelegramAlertService: missing token or chatId, skipping Telegram send');
      return;
    }

    const {
      reportId,
      reportCreatedAt,
      comment,
      metadata,
      clientLogs,
      serverConsoleLogs,
      serverMetaLogs,
      screenshotBuffer,
    } = params;

    const caption = this.buildReportCaption({ reportId, comment, metadata });
    const logsCombined = this.buildLogsFileContent({
      clientLogs,
      serverConsoleLogs,
      serverMetaLogs,
    });
    const logFilename = formatReportLogFilename(reportCreatedAt, reportId);

    // Telegram не дозволяє два document в одному повідомленні — окремі повідомлення
    if (screenshotBuffer && screenshotBuffer.length > 0) {
      const imageMeta = getImageFileMeta(screenshotBuffer);
      const screenshotFilename = formatReportScreenshotFilename(
        reportCreatedAt,
        reportId,
        imageMeta.ext,
      );
      await this.sendDocument(
        token,
        chatId,
        screenshotBuffer,
        screenshotFilename,
        imageMeta.mime,
        caption,
      );
    } else if (logsCombined) {
      await this.sendDocument(
        token,
        chatId,
        Buffer.from(logsCombined, 'utf-8'),
        logFilename,
        'text/plain',
        caption,
      );
    } else {
      await this.sendMessage(token, chatId, caption);
      return;
    }

    if (logsCombined && screenshotBuffer && screenshotBuffer.length > 0) {
      await this.sendDocument(
        token,
        chatId,
        Buffer.from(logsCombined, 'utf-8'),
        logFilename,
        'text/plain',
      );
    }
  }

  private buildReportCaption(params: {
    reportId: number;
    comment: string;
    metadata: SupportReportMetadata;
  }): string {
    const { reportId, comment, metadata } = params;

    const userLine = [
      metadata.userName,
      metadata.userEmail ? `(${metadata.userEmail})` : null,
      metadata.userRole ? `[${metadata.userRole}]` : null,
      metadata.userId ? `#${metadata.userId}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const messageLines = [
      '🆘 <b>Звіт користувача</b>',
      '',
      userLine ? `👤 ${escapeHtml(userLine)}` : null,
      metadata.url ? `🔗 ${escapeHtml(metadata.url)}` : null,
      metadata.orderNumber ? `📦 Замовлення: ${escapeHtml(metadata.orderNumber)}` : null,
      metadata.appVersion ? `📱 v${escapeHtml(metadata.appVersion)}` : null,
      metadata.viewport
        ? `🖥 ${metadata.viewport.width}×${metadata.viewport.height}`
        : null,
      '',
      comment ? `💬 <b>Коментар:</b>\n${escapeHtml(comment)}` : '💬 <i>Без коментаря</i>',
      '',
      `🆔 meta_log #${reportId}`,
    ].filter((line) => line !== null) as string[];

    return truncate(messageLines.join('\n'), TELEGRAM_CAPTION_LIMIT);
  }

  private buildLogsFileContent(sections: {
    clientLogs?: string;
    serverConsoleLogs?: string;
    serverMetaLogs?: string;
  }): string | undefined {
    const parts = [
      sections.clientLogs ? `=== CLIENT LOGS ===\n${sections.clientLogs}` : null,
      sections.serverConsoleLogs
        ? `=== SERVER CONSOLE LOGS ===\n${sections.serverConsoleLogs}`
        : null,
      sections.serverMetaLogs
        ? `=== SERVER META_LOGS (DB) ===\n${sections.serverMetaLogs}`
        : null,
    ].filter(Boolean);

    if (!parts.length) return undefined;
    return parts.join('\n\n');
  }

  private async sendMessage(
    token: string,
    chatId: string,
    text: string,
    replyToMessageId?: number,
  ): Promise<number> {
    const url = `${TELEGRAM_API}${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_to_message_id: replyToMessageId,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || body.ok === false) {
      logServer('TelegramAlertService sendMessage failed', { status: response.status, body });
      throw new Error(body.description || `Telegram sendMessage failed (${response.status})`);
    }
    return body.result?.message_id ?? 0;
  }

  private async sendDocument(
    token: string,
    chatId: string,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    caption?: string,
    replyToMessageId?: number,
  ): Promise<number> {
    const url = `${TELEGRAM_API}${token}/sendDocument`;
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append(
      'document',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );
    if (caption) {
      form.append('caption', truncate(caption, TELEGRAM_CAPTION_LIMIT));
      form.append('parse_mode', 'HTML');
    }
    if (replyToMessageId) {
      form.append('reply_to_message_id', String(replyToMessageId));
    }

    const response = await fetch(url, { method: 'POST', body: form });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };
    if (!response.ok || body.ok === false) {
      logServer('TelegramAlertService sendDocument failed', { status: response.status, body });
      throw new Error(body.description || `Telegram sendDocument failed (${response.status})`);
    }
    return body.result?.message_id ?? 0;
  }
}

export const telegramAlertService = new TelegramAlertService();
