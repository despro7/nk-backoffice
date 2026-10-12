import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DEFAULT_CHATWOOT_BOT_SETTINGS } from '../../../shared/types/chatwootBot.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { chatwootBotOrchestrator } from './ChatwootBotOrchestrator.js';
import { getChatwootBotFixture } from './fixtures/index.js';

vi.mock('./ChatwootBotEventLogService.js', () => ({
  chatwootBotEventLogService: {
    append: vi.fn(async (input: {
      source: string;
      action: string;
      reason: string;
      conversationId: number | null;
      messageId: number | null;
      contentPreview: string;
      replyMode: string;
      dryRun: boolean;
      details?: string;
    }) => ({
      id: 'test-id',
      at: new Date().toISOString(),
      source: input.source === 'simulate' ? 'simulate' : 'webhook',
      action: input.action,
      reason: input.reason,
      conversationId: input.conversationId,
      messageId: input.messageId,
      contentPreview: input.contentPreview,
      replyMode: input.replyMode === 'live' ? 'live' : 'dry_run',
      dryRun: input.dryRun,
      details: input.details,
    })),
  },
}));

describe('ChatwootBotOrchestrator dry_run', () => {
  beforeEach(() => {
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue({
      ...DEFAULT_CHATWOOT_BOT_SETTINGS,
      enabled: true,
      replyMode: 'dry_run',
    });
  });

  it('echo fixture → dry_run echo', async () => {
    const result = await chatwootBotOrchestrator.processWebhook(getChatwootBotFixture('echo'), {
      source: 'simulate',
    });
    expect(result.action).toBe('echo');
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('dry_run_echo');
  });

  it('handover fixture → dry_run handover', async () => {
    const result = await chatwootBotOrchestrator.processWebhook(
      getChatwootBotFixture('handover'),
      { source: 'simulate' },
    );
    expect(result.action).toBe('handover');
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('dry_run_handover');
  });

  it('ignores outgoing and private', async () => {
    const outgoing = await chatwootBotOrchestrator.processWebhook({
      ...getChatwootBotFixture('echo'),
      message_type: 'outgoing',
    });
    expect(outgoing.action).toBe('ignored');
    expect(outgoing.reason).toBe('not_incoming');

    const priv = await chatwootBotOrchestrator.processWebhook({
      ...getChatwootBotFixture('echo'),
      private: true,
    });
    expect(priv.action).toBe('ignored');
    expect(priv.reason).toBe('private_message');
  });

  it('ignores when bot disabled', async () => {
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue({
      ...DEFAULT_CHATWOOT_BOT_SETTINGS,
      enabled: false,
      replyMode: 'dry_run',
    });
    const result = await chatwootBotOrchestrator.processWebhook(getChatwootBotFixture('echo'));
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('bot_disabled');
  });
});
