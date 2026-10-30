import { DEFAULT_CHATWOOT_BOT_SETTINGS } from '@shared/types/chatwootBot';
import type {
  ChatwootBotReplyMode,
  ChatwootBotSettingsResponse,
  ChatwootBotAutoReplyRule,
  ChatwootBotAiMask,
  ChatwootHandoverAssignMode,
  ChatwootBotTopicsClassifier,
} from '@shared/types/chatwootBot';

export type FormState = {
  enabled: boolean;
  baseUrl: string;
  accountId: number;
  apiAccessToken: string;
  apiAccessTokenMasked: string;
  hasApiAccessToken: boolean;
  webhookSecret: string;
  webhookSecretMasked: string;
  hasWebhookSecret: boolean;
  fallbackMessage: string;
  autoReplyRules: ChatwootBotAutoReplyRule[];
  aiEnabled: boolean;
  aiMaskId: string;
  aiMasks: ChatwootBotAiMask[];
  aiProvider: '' | 'openai' | 'google' | 'openrouter';
  aiModel: string;
  verifySessionTtlHours: number;
  verifyRateLimitMaxAttempts: number;
  verifyRateLimitWindowMinutes: number;
  verifyFailMessage: string;
  verifyRequiredHint: string;
  verifyPromptOrderNumber: string;
  verifyPromptLastOrderDate: string;
  handoverKeywordsText: string;
  replyMode: ChatwootBotReplyMode;
  outgoingUrlHint: string;
  eventLogRetentionDays: number;
  eventLogMaxRecords: number;
  eventLogStoreFullPayload: boolean;
  eventLogPersistPrivate: boolean;
  eventLogPersistOtherNoise: boolean;
  handoverAssignMode: ChatwootHandoverAssignMode;
  handoverAssigneeId: number | null;
  handoverDefaultInboxId: number | null;
  inboxApiAccessToken: string;
  inboxApiAccessTokenMasked: string;
  hasInboxApiAccessToken: boolean;
  handoverMessageInHours: string;
  handoverMessageOutOfHours: string;
  handoverCallbackAckMessage: string;
  handoverEmergencyEnabled: boolean;
  handoverEmergencyKeywordsText: string;
  handoverMessageEmergency: string;
  reclaimEnabled: boolean;
  reclaimOnAssigneeOffline: boolean;
  reclaimOnOohAgentSilent: boolean;
  reclaimOohSilentMinutes: number;
  reclaimOohTreatNoAgentReplyAsSilent: boolean;
  reclaimInHoursAgentSilentEnabled: boolean;
  reclaimInHoursSilentMinutes: number;
  reclaimInHoursTreatNoAgentReplyAsSilent: boolean;
  reclaimMessageOffline: string;
  reclaimMessageOoh: string;
  reclaimMessageInHours: string;
  reclaimContinueWithEcho: boolean;
  resolveCleanupEnabled: boolean;
  topicsClassifier: ChatwootBotTopicsClassifier;
  topicsJevMinConfidence: number;
  topicsJevExamplesPerTopic: number;
  topicsJevMaxPerSync: number;
  topicsSyncDelaySeconds: number;
  topicsCronMinutes: number;
};

export function keywordsToText(keywords: string[]): string {
  return keywords.join(', ');
}

export function textToKeywords(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toFormState(data: ChatwootBotSettingsResponse): FormState {
  return {
    enabled: data.enabled,
    baseUrl: data.baseUrl,
    accountId: data.accountId,
    apiAccessToken: '',
    apiAccessTokenMasked: data.apiAccessTokenMasked,
    hasApiAccessToken: data.hasApiAccessToken,
    webhookSecret: '',
    webhookSecretMasked: data.webhookSecretMasked,
    hasWebhookSecret: data.hasWebhookSecret,
    fallbackMessage: data.fallbackMessage || data.echoMessage,
    autoReplyRules: data.autoReplyRules ?? [],
    aiEnabled: data.aiEnabled,
    aiMaskId: data.aiMaskId,
    aiMasks: data.aiMasks ?? [],
    aiProvider: data.aiProvider,
    aiModel: data.aiModel,
    verifySessionTtlHours: data.verifySessionTtlHours,
    verifyRateLimitMaxAttempts: data.verifyRateLimitMaxAttempts,
    verifyRateLimitWindowMinutes: data.verifyRateLimitWindowMinutes,
    verifyFailMessage: data.verifyFailMessage,
    verifyRequiredHint: data.verifyRequiredHint,
    verifyPromptOrderNumber: data.verifyPromptOrderNumber,
    verifyPromptLastOrderDate: data.verifyPromptLastOrderDate,
    handoverKeywordsText: keywordsToText(data.handoverKeywords),
    replyMode: data.replyMode,
    outgoingUrlHint: data.outgoingUrlHint || DEFAULT_CHATWOOT_BOT_SETTINGS.outgoingUrlHint,
    eventLogRetentionDays: data.eventLogRetentionDays,
    eventLogMaxRecords: data.eventLogMaxRecords,
    eventLogStoreFullPayload: data.eventLogStoreFullPayload,
    eventLogPersistPrivate: data.eventLogPersistPrivate,
    eventLogPersistOtherNoise: data.eventLogPersistOtherNoise,
    handoverAssignMode: data.handoverAssignMode,
    handoverAssigneeId: data.handoverAssigneeId,
    handoverDefaultInboxId: data.handoverDefaultInboxId,
    inboxApiAccessToken: '',
    inboxApiAccessTokenMasked: data.inboxApiAccessTokenMasked,
    hasInboxApiAccessToken: data.hasInboxApiAccessToken,
    handoverMessageInHours: data.handoverMessageInHours,
    handoverMessageOutOfHours: data.handoverMessageOutOfHours,
    handoverCallbackAckMessage: data.handoverCallbackAckMessage,
    handoverEmergencyEnabled: data.handoverEmergencyEnabled,
    handoverEmergencyKeywordsText: keywordsToText(data.handoverEmergencyKeywords),
    handoverMessageEmergency: data.handoverMessageEmergency,
    reclaimEnabled: data.reclaimEnabled,
    reclaimOnAssigneeOffline: data.reclaimOnAssigneeOffline,
    reclaimOnOohAgentSilent: data.reclaimOnOohAgentSilent,
    reclaimOohSilentMinutes: data.reclaimOohSilentMinutes,
    reclaimOohTreatNoAgentReplyAsSilent: data.reclaimOohTreatNoAgentReplyAsSilent,
    reclaimInHoursAgentSilentEnabled: data.reclaimInHoursAgentSilentEnabled,
    reclaimInHoursSilentMinutes: data.reclaimInHoursSilentMinutes,
    reclaimInHoursTreatNoAgentReplyAsSilent: data.reclaimInHoursTreatNoAgentReplyAsSilent,
    reclaimMessageOffline: data.reclaimMessageOffline,
    reclaimMessageOoh: data.reclaimMessageOoh,
    reclaimMessageInHours: data.reclaimMessageInHours,
    reclaimContinueWithEcho: data.reclaimContinueWithEcho,
    resolveCleanupEnabled: data.resolveCleanupEnabled,
    topicsClassifier: data.topicsClassifier,
    topicsJevMinConfidence: data.topicsJevMinConfidence,
    topicsJevExamplesPerTopic: data.topicsJevExamplesPerTopic,
    topicsJevMaxPerSync: data.topicsJevMaxPerSync,
    topicsSyncDelaySeconds: data.topicsSyncDelaySeconds,
    topicsCronMinutes: data.topicsCronMinutes,
  };
}
