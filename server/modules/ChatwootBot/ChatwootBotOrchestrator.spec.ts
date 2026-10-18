import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  CHATWOOT_BOT_ATTR_OOH_CALLBACK_PENDING,
  DEFAULT_CHATWOOT_BOT_SETTINGS,
} from '../../../shared/types/chatwootBot.js';
import { chatwootBotEventLogService } from './ChatwootBotEventLogService.js';
import { chatwootBotSettingsService } from './ChatwootBotSettingsService.js';
import {
  chatwootBotOrchestrator,
  isConversationResolvedStatusEvent,
  isIncomingContactMessage,
} from './ChatwootBotOrchestrator.js';
import { getChatwootBotFixture } from './fixtures/index.js';
import { chatwootBotInboxHoursService } from './ChatwootBotInboxHoursService.js';
import { shouldPersistEvent } from './ChatwootBotHandoverUtils.js';
import { clearHumanAgentActivePersistGateForTests } from './humanAgentActivePersistGate.js';
vi.mock('./chatwootAgentsAvailabilityCache.js', () => ({
  isAssigneeOffline: vi.fn(async () => false),
}));

vi.mock('./chatwootLastAgentReplyCache.js', () => ({
  minutesSinceLastAgentPublicReply: vi.fn(async () => null),
}));

vi.mock('./ChatwootBotAnalyticsService.js', () => ({
  chatwootBotAnalyticsService: {
    recordBestEffort: vi.fn(),
    record: vi.fn(async () => undefined),
  },
}));

vi.mock('./chatwootHandoverReset.js', () => ({
  resetHumanHandoverOnConversation: vi.fn(async () => ({
    unassigned: true,
    humanHandoverAttrCleared: true,
    typingOff: 'dry_run',
  })),
}));

import { isAssigneeOffline } from './chatwootAgentsAvailabilityCache.js';
import { minutesSinceLastAgentPublicReply } from './chatwootLastAgentReplyCache.js';

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

describe('isIncomingContactMessage', () => {
  it('treats Agent Bot payload without message_type as incoming contact', () => {
    expect(
      isIncomingContactMessage({
        event: 'message_created',
        content: 'Hell',
        sender: { type: 'contact', id: 9 },
        conversation: { id: 2, inbox_id: 1 },
      }),
    ).toBe(true);
  });

  it('rejects outgoing when message_type is set', () => {
    expect(
      isIncomingContactMessage({
        event: 'message_created',
        message_type: 'outgoing',
        content: 'hi',
        sender: { type: 'user', id: 1 },
      }),
    ).toBe(false);
  });
});

describe('shouldPersistEvent', () => {
  it('skips noisy ignored reasons by default', () => {
    expect(shouldPersistEvent('ignored', 'unsupported_event:conversation_updated')).toBe(false);
    expect(shouldPersistEvent('ignored', 'private_message')).toBe(false);
    expect(shouldPersistEvent('ignored', 'not_incoming')).toBe(false);
    expect(shouldPersistEvent('ignored', 'sender_not_contact:agent_bot')).toBe(false);
    expect(shouldPersistEvent('ignored', 'duplicate_message')).toBe(false);
  });

  it('persists noise when debug options enabled', () => {
    expect(
      shouldPersistEvent('ignored', 'private_message', { persistPrivate: true }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'not_incoming', { persistOtherNoise: true }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'unsupported_event:conversation_updated', {
        persistOtherNoise: true,
      }),
    ).toBe(true);
    expect(
      shouldPersistEvent('ignored', 'duplicate_message', { persistOtherNoise: true }),
    ).toBe(false);
  });

  it('persists bot_disabled, human_agent_active and handover', () => {
    expect(shouldPersistEvent('ignored', 'bot_disabled')).toBe(true);
    expect(shouldPersistEvent('ignored', 'human_agent_active')).toBe(true);
    expect(shouldPersistEvent('handover', 'ooh_offer')).toBe(true);
  });
});

describe('ChatwootBotOrchestrator dry_run', () => {
  beforeEach(() => {
    clearHumanAgentActivePersistGateForTests();
    vi.mocked(isAssigneeOffline).mockResolvedValue(false);
    vi.mocked(minutesSinceLastAgentPublicReply).mockResolvedValue(null);
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

  it('ignores echo when human agent active on conversation', async () => {
    const payload = {
      ...getChatwootBotFixture('echo'),
      conversation: {
        ...getChatwootBotFixture('echo').conversation,
        id: 1,
        status: 'open',
        meta: { assignee: { id: 2, type: 'user' } },
      },
    };
    const first = await chatwootBotOrchestrator.processWebhook(payload, { source: 'simulate' });
    expect(first.action).toBe('ignored');
    expect(first.reason).toBe('human_agent_active');
    expect(first.event.id).not.toBe('skipped');
    expect(vi.mocked(chatwootBotEventLogService.append)).toHaveBeenCalledTimes(1);
    expect(String(first.event.details ?? '')).toContain('typing_off=dry_run');

    const second = await chatwootBotOrchestrator.processWebhook(
      { ...payload, id: (payload.id ?? 0) + 1, content: 'ще раз' },
      { source: 'simulate' },
    );
    expect(second.action).toBe('ignored');
    expect(second.reason).toBe('human_agent_active');
    expect(second.event.id).toBe('skipped');
    expect(vi.mocked(chatwootBotEventLogService.append)).toHaveBeenCalledTimes(1);
  });

  it('OOH reclaim when agent silent >10m → dry_run reclaim then echo', async () => {
    vi.mocked(minutesSinceLastAgentPublicReply).mockResolvedValue(15);
    vi.spyOn(chatwootBotInboxHoursService, 'isWithinBusinessHours').mockResolvedValue({
      inHours: false,
      source: 'chatwoot_inbox',
    });
    const payload = {
      ...getChatwootBotFixture('echo'),
      conversation: {
        ...getChatwootBotFixture('echo').conversation,
        id: 42,
        meta: { assignee: { id: 5, type: 'user' } },
      },
    };
    const result = await chatwootBotOrchestrator.processWebhook(payload, { source: 'simulate' });
    expect(result.action).toBe('echo');
    expect(result.reason).toBe('dry_run_echo');
    const appendCalls = vi.mocked(chatwootBotEventLogService.append).mock.calls;
    const reclaimCall = appendCalls.find((c) => c[0].reason === 'dry_run_reclaim_ooh');
    expect(reclaimCall).toBeTruthy();
  });

  it('offline reclaim → dry_run reclaim_offline then echo', async () => {
    vi.mocked(isAssigneeOffline).mockResolvedValue(true);
    const payload = {
      ...getChatwootBotFixture('echo'),
      conversation: {
        ...getChatwootBotFixture('echo').conversation,
        id: 43,
        meta: { assignee: { id: 5, type: 'user' } },
      },
    };
    const result = await chatwootBotOrchestrator.processWebhook(payload, { source: 'simulate' });
    expect(result.action).toBe('echo');
    const reclaimCall = vi.mocked(chatwootBotEventLogService.append).mock.calls.find(
      (c) => c[0].reason === 'dry_run_reclaim_offline',
    );
    expect(reclaimCall).toBeTruthy();
  });

  it('skips reclaim when reclaimEnabled is false', async () => {
    vi.mocked(isAssigneeOffline).mockResolvedValue(true);
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue({
      ...alwaysOpenHoursSettings,
      reclaimEnabled: false,
    });
    const payload = {
      ...getChatwootBotFixture('echo'),
      conversation: {
        ...getChatwootBotFixture('echo').conversation,
        id: 44,
        meta: { assignee: { id: 5, type: 'user' } },
      },
    };
    const result = await chatwootBotOrchestrator.processWebhook(payload, { source: 'simulate' });
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('human_agent_active');
  });

  it('resolve status webhook skipped when resolveCleanupEnabled false', async () => {
    vi.spyOn(chatwootBotSettingsService, 'getSettings').mockResolvedValue({
      ...alwaysOpenHoursSettings,
      resolveCleanupEnabled: false,
    });
    const result = await chatwootBotOrchestrator.processWebhook(
      {
        event: 'conversation_status_changed',
        conversation: { id: 99, status: 'resolved', inbox_id: 1 },
      },
      { source: 'simulate' },
    );
    expect(result.reason).toBe('resolve_cleanup_disabled');
  });

  it('resolve status webhook → resolve_cleanup', async () => {
    expect(
      isConversationResolvedStatusEvent({
        event: 'conversation_status_changed',
        conversation: { id: 1, status: 'resolved' },
      }),
    ).toBe(true);
    const result = await chatwootBotOrchestrator.processWebhook(
      {
        event: 'conversation_status_changed',
        conversation: { id: 99, status: 'resolved', inbox_id: 1 },
      },
      { source: 'simulate' },
    );
    expect(result.action).toBe('ignored');
    expect(result.reason).toBe('resolve_cleanup');
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
