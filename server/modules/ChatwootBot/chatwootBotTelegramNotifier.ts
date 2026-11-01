import { logServer } from '../../lib/utils.js';
import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** Сповіщення операторів у Telegram (окремий бот із налаштувань чат-бота). Без токена чи chat id — нічого. */
export const chatwootBotTelegramNotifier = {
  isConfigured(settings: Pick<ChatwootBotSettings, 'telegramNotifyBotToken' | 'telegramNotifyChatId'>): boolean {
    return Boolean(settings.telegramNotifyBotToken && settings.telegramNotifyChatId);
  },

  /** Best-effort: помилка лише в лог. Повертає, чи пішло повідомлення. */
  async send(
    settings: Pick<ChatwootBotSettings, 'telegramNotifyBotToken' | 'telegramNotifyChatId'>,
    text: string,
  ): Promise<boolean> {
    if (!this.isConfigured(settings)) return false;
    try {
      const response = await fetch(`${TELEGRAM_API}${settings.telegramNotifyBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramNotifyChatId,
          text: text.slice(0, 4096),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!response.ok || body.ok === false) {
        throw new Error(body.description || `HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      logServer('[ChatwootBot] telegram notify failed (non-fatal)', err);
      return false;
    }
  },
};
