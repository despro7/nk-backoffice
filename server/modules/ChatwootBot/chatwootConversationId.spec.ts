import { describe, expect, it } from 'vitest';
import { resolveConversationApiId } from './chatwootConversationId.js';
import type { ChatwootWebhookMessageCreated } from '../../../shared/types/chatwootBot.js';

describe('resolveConversationApiId', () => {
  it('prefers display_id when present', () => {
    const payload: ChatwootWebhookMessageCreated = {
      conversation: { id: 999, display_id: 1 },
    };
    expect(resolveConversationApiId(payload)).toBe(1);
  });

  it('falls back to conversation.id', () => {
    const payload: ChatwootWebhookMessageCreated = {
      conversation: { id: 42 },
    };
    expect(resolveConversationApiId(payload)).toBe(42);
  });
});
