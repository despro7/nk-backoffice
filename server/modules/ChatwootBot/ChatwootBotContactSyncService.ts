import { logServer } from '../../lib/utils.js';
import type { ChatwootBotSettings, ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { extractCallbackPhone } from './ChatwootBotHandoverUtils.js';
import { botMessagingCredentials, handoverAssignmentCredentials } from './chatwootCredentials.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';
import { extractContactEmail } from './chatwootBotContactFields.js';

/** Контакт, що пише в розмові (sender або meta.sender). */
export function getContactId(payload: ChatwootWebhookMessageCreated): number | null {
  const senderId = payload.sender?.id;
  if (senderId && payload.sender?.type?.toLowerCase() === 'contact') return senderId;
  const metaId = payload.conversation?.meta?.sender?.id;
  return metaId ?? null;
}

/** Уже записані значення — не шлемо той самий PUT на кожне повідомлення. */
const synced = new Set<string>();
const SYNCED_MAX = 5000;

function remember(key: string): void {
  if (synced.size >= SYNCED_MAX) synced.clear();
  synced.add(key);
}

function isDuplicateError(message: string): boolean {
  return /\b422\b|taken|already|exists|вже/i.test(message);
}

/**
 * Телефон / email, які клієнт написав у чаті → порожні поля профілю контакту Chatwoot.
 * Заповнені поля не перезаписуємо. Телефон уже в іншого контакту (422) — приватна нотатка оператору.
 * Потрібен User PAT: Agent Bot token контакти не редагує.
 */
export class ChatwootBotContactSyncService {
  async syncFromMessage(
    settings: ChatwootBotSettings,
    payload: ChatwootWebhookMessageCreated,
    conversationId: number,
    content: string,
    dryRun: boolean,
  ): Promise<void> {
    if (!settings.contactSyncEnabled) return;
    const contactId = getContactId(payload);
    if (!contactId) return;
    const phone = extractCallbackPhone(content);
    const email = extractContactEmail(content);
    if (!phone && !email) return;
    if (!sanitizeChatwootApiToken(settings.inboxApiAccessToken)) {
      logServer('[ChatwootBot] contact sync skipped: no User PAT');
      return;
    }

    const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
    try {
      const current = await client.getContact(contactId);
      const fields: { phone_number?: string; email?: string } = {};
      if (phone && !current.phone_number && !synced.has(`${contactId}:${phone}`)) fields.phone_number = phone;
      if (email && !current.email && !synced.has(`${contactId}:${email}`)) fields.email = email;
      if (!fields.phone_number && !fields.email) return;

      if (dryRun) {
        logServer(`[ChatwootBot] contact sync dry_run contact=${contactId} fields=${Object.keys(fields).join(',')}`);
        return;
      }
      try {
        await client.updateContactOrThrow(contactId, fields);
        logServer(`[ChatwootBot] contact sync contact=${contactId} fields=${Object.keys(fields).join(',')}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isDuplicateError(message)) throw err;
        const note = [
          'Клієнт написав у чаті контакти, але Chatwoot не дав записати їх у профіль: вони вже є в іншому контакті.',
          fields.phone_number ? `Телефон: ${fields.phone_number}` : null,
          fields.email ? `Email: ${fields.email}` : null,
          'Можна обʼєднати контакти вручну (Контакт → Merge).',
        ]
          .filter(Boolean)
          .join('\n');
        await createChatwootApiClient(botMessagingCredentials(settings)).createOutgoingMessage(
          conversationId,
          note,
          true,
        );
      }
      if (fields.phone_number) remember(`${contactId}:${fields.phone_number}`);
      if (fields.email) remember(`${contactId}:${fields.email}`);
    } catch (err) {
      logServer(`[ChatwootBot] contact sync failed contact=${contactId} (non-fatal)`, err);
    }
  }
}

export const chatwootBotContactSyncService = new ChatwootBotContactSyncService();
