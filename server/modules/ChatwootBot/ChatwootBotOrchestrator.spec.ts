import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING,
  DEFAULT_CHATWOOT_BOT_SETTINGS,
} from '../../../shared/types/chatwootBot.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import { chatwootBotOrchestrator } from './ChatwootBotOrchestrator.js';
import { getChatwootBotFixture } from './fixtures/index.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
import { shouldPersistEvent } from './ChatwootBotHandoverUtils.js';

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

const alwaysOpenHoursSettings = {
  ...DEFAULT_CHATWOOT_BOT_SETTINGS,
  enabled: true,
  replyMode: 'dry_run' as const,
  handoverWorkDays: [1, 2, 3, 4, 5, 6, 7],
  handoverWorkStart: '00:00',
  handoverWorkEnd: '23:59',
};

describe('shouldPersistEvent', () => {
  it('skips noisy ignored reasons', () => {
    expect(shouldPersistEvent('ignored', 'unsupported_event:conversation_updated')).toBe(false);
    expect(shouldPersistEvent('ignored', 'private_message')).toBe(false);
    expect(shouldPersistEvent('ignored', 'not_incoming')).toBe(false);
    expect(shouldPersistEvent('ignored', 'sender_not_contact:agent_bot')).toBe(false);
  });

  it('persists bot_disabled and handover', () => {
    expect(shouldPersistEvent('ignored', 'bot_disabled')).toBe(true);
    expect(shouldPersistEvent('handover', 'ooh_offer')).toBe(true);
  });
});

describe('ChatwootBotOrchestrator dry_run', () => {
  beforeEach(() => {
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue(alwaysOpenHoursSettings);
    vi.spyOn(chatwootBotInboxHoursService, 'isWithinBusinessHours').mockResolvedValue({
      inHours: true,
      source: 'chatwoot_inbox',
    });
    vi.mocked(chatwootBotEventLogService.append).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('handover fixture in hours → dry_run handover', async () => {
    const result = await chatwootBotOrchestrator.processWebhook(
      getChatwootBotFixture('handover'),
      { source: 'simulate' },
    );
    expect(result.action).toBe('handover');
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reason).toBe('dry_run_handover');
  });

  it('handover keyword OOH → ooh_offer (bot stays)', async () => {
    vi.spyOn(chatwootBotInboxHoursService, 'isWithinBusinessHours').mockResolvedValue({
      inHours: false,
      source: 'chatwoot_inbox',
    });
    const result = await chatwootBotOrchestrator.processWebhook(
      getChatwootBotFixture('handover'),
      { source: 'simulate' },
    );
    expect(result.action).toBe('handover');
    expect(result.reason).toBe('dry_run_ooh_offer');
  });

  it('emergency OOH → dry_run handover assign path', async () => {
    vi.spyOn(chatwootBotInboxHoursService, 'isWithinBusinessHours').mockResolvedValue({
      inHours: false,
      source: 'chatwoot_inbox',
    });
    const result = await chatwootBotOrchestrator.processWebhook(
      {
        ...getChatwootBotFixture('echo'),
        content: 'терміново допоможіть',
      },
      { source: 'simulate' },
    );
    expect(result.action).toBe('handover');
    expect(result.reason).toBe('dry_run_handover');
    expect(result.event.details).toContain('mode=emergency');
  });

  it('OOH callback after offer → dry_run_ooh_callback', async () => {
    vi.spyOn(chatwootBotInboxHoursService, 'isWithinBusinessHours').mockResolvedValue({
      inHours: false,
      source: 'chatwoot_inbox',
    });
    const result = await chatwootBotOrchestrator.processWebhook(
      {
        ...getChatwootBotFixture('echo'),
        content: 'мій телефон +380501112233',
        conversation: {
          ...getChatwootBotFixture('echo').conversation,
          custom_attributes: { [CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING]: true },
        },
      },
      { source: 'simulate' },
    );
    expect(result.action).toBe('handover');
    expect(result.reason).toBe('dry_run_ooh_callback');
  });

  it('ignores outgoing and private without persisting', async () => {
    vi.mocked(chatwootBotEventLogService.append).mockClear();
    const outgoing = await chatwootBotOrchestrator.processWebhook({
      ...getChatwootBotFixture('echo'),
      message_type: 'outgoing',
    });
    expect(outgoing.action).toBe('ignored');
    expect(outgoing.reason).toBe('not_incoming');
    expect(outgoing.event.id).toBe('skipped');
    expect(vi.mocked(chatwootBotEventLogService.append)).not.toHaveBeenCalled();

    const priv = await chatwootBotOrchestrator.processWebhook({
      ...getChatwootBotFixture('echo'),
      private: true,
    });
    expect(priv.action).toBe('ignored');
    expect(priv.reason).toBe('private_message');
    expect(priv.event.id).toBe('skipped');
    expect(vi.mocked(chatwootBotEventLogService.append)).not.toHaveBeenCalled();
  });

  it('ignores when bot disabled and persists', async () => {
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue({
      ...alwaysOpenHoursSettings,
      enabled: false,
    });
    const result = await chatwootBotOrchestrator.processWebhook(getChatwootBotFixture('echo'));
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('bot_disabled');
    expect(vi.mocked(chatwootBotEventLogService.append)).toHaveBeenCalled();
  });
});
