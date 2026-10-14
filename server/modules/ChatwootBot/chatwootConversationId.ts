import type { ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';

/**
 * ID для Application API: у webhook `conversation.id` — це display_id (див. Chatwoot EventDataPresenter).
 */
export function resolveConversationApiId(payload: ChatwootWebhookMessageCreated): number | null {
  const conv = payload.conversation;
  if (!conv) return null;

  const displayRaw = (conv as { display_id?: number | string }).display_id;
  if (displayRaw != null && displayRaw !== '') {
    const displayId = Number(displayRaw);
    if (Number.isFinite(displayId) && displayId > 0) return displayId;
  }

  if (conv.id != null) {
    const id = Number(conv.id);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}
