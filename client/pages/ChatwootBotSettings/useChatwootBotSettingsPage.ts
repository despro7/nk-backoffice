import { useCallback, useEffect, useState } from 'react';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { llmSettingsApi } from '@/services/LlmSettingsService';
import { parseUrlHash, useUrlHashSync } from '@/hooks/useUrlHashSync';
import type {
  ChatwootBotAgentSummary,
  ChatwootBotEventRecord,
  ChatwootInboxHoursStatus,
} from '@shared/types/chatwootBot';
import {
  type FormState,
  textToKeywords,
  toFormState,
} from './chatwootBotFormState';
import {
  type ChatwootSettingsTabKey,
  parseChatwootSettingsTabKey,
} from './chatwootBotTabKeys';
import { type LlmPlatformSnapshot, defaultLlmPlatformSnapshot } from './llmPlatformHelpers';

export function useChatwootBotSettingsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isProbingWebhook, setIsProbingWebhook] = useState(false);
  const [events, setEvents] = useState<ChatwootBotEventRecord[]>([]);
  const [agents, setAgents] = useState<ChatwootBotAgentSummary[]>([]);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [isClearingWebhookSecret, setIsClearingWebhookSecret] = useState(false);
  const [isClearingEvents, setIsClearingEvents] = useState(false);
  const [unassigningConvId, setUnassigningConvId] = useState<number | null>(null);
  const [clearEventsConfirm, setClearEventsConfirm] = useState(false);
  const [inboxTokenVisible, setInboxTokenVisible] = useState(false);
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Set<string>>(new Set());
  const [inboxHours, setInboxHours] = useState<ChatwootInboxHoursStatus | null>(null);
  const [isLoadingInboxHours, setIsLoadingInboxHours] = useState(false);
  const [verifyTestPhone, setVerifyTestPhone] = useState('');
  const [verifyTestOrder, setVerifyTestOrder] = useState('');
  const [verifyTestDate, setVerifyTestDate] = useState('');
  const [verifyTestResult, setVerifyTestResult] = useState('');
  const [isVerifyTesting, setIsVerifyTesting] = useState(false);
  const [aiTestMessage, setAiTestMessage] = useState('Що є в наявності на вітрині?');
  const [aiTestReply, setAiTestReply] = useState('');
  const [isAiTesting, setIsAiTesting] = useState(false);
  const [llmPlatform, setLlmPlatform] = useState<LlmPlatformSnapshot | null>(null);
  const [webhookProcessorHealth, setWebhookProcessorHealth] = useState<{
    localBuild: string;
    localHost?: string | null;
    targetHealthUrl: string | null;
    targetBuild: string | null;
    targetHost?: string | null;
    tunnelPointsHere?: boolean;
    mismatch: boolean;
    message: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<ChatwootSettingsTabKey>(() =>
    parseChatwootSettingsTabKey(parseUrlHash(window.location.hash).get('tab')),
  );

  useUrlHashSync({ tab: activeTab === 'connection' ? null : activeTab }, (params) => {
    setActiveTab(parseChatwootSettingsTabKey(params.get('tab')));
  });

  const togglePayloadExpanded = (eventId: string) => {
    setExpandedPayloadIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const loadInboxHours = useCallback(async (inboxId: number | null) => {
    const id = inboxId ?? 1;
    setIsLoadingInboxHours(true);
    try {
      const status = await chatwootBotApi.getInboxSchedule(id);
      setInboxHours(status);
    } catch {
      setInboxHours(null);
    } finally {
      setIsLoadingInboxHours(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const recent = await chatwootBotApi.recentEvents(30);
      setEvents(recent);
    } catch {
      // non-fatal
    }
  }, []);

  const loadWebhookProcessorHealth = useCallback(async (): Promise<void> => {
    try {
      setWebhookProcessorHealth(await chatwootBotApi.getWebhookProcessorHealth());
    } catch {
      setWebhookProcessorHealth(null);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await chatwootBotApi.getSettings(false);
      setForm(toFormState(data));
      void chatwootBotApi.listAgents().then(setAgents).catch(() => setAgents([]));
      void loadInboxHours(data.handoverDefaultInboxId);
      await loadEvents();
      void loadWebhookProcessorHealth();
      void llmSettingsApi
        .getSettings(false)
        .then((llm) =>
          setLlmPlatform({
            defaultProvider: llm.defaultProvider,
            modelPriceHighlight: llm.modelPriceHighlight,
            hasOpenaiApiKey: llm.hasOpenaiApiKey,
            hasGoogleApiKey: llm.hasGoogleApiKey,
            hasOpenrouterApiKey: llm.hasOpenrouterApiKey,
            openaiDefaultModel: llm.openaiDefaultModel,
            googleDefaultModel: llm.googleDefaultModel,
            openrouterDefaultModel: llm.openrouterDefaultModel,
          }),
        )
        .catch(() => setLlmPlatform(null));
    } catch (error) {
      console.error('ChatwootBotSettings load error:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося завантажити налаштування Chatwoot Bot',
        color: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadEvents, loadInboxHours, loadWebhookProcessorHealth]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      const saved = await chatwootBotApi.updateSettings({
        enabled: form.enabled,
        baseUrl: form.baseUrl,
        accountId: Number(form.accountId),
        apiAccessToken: form.apiAccessToken || undefined,
        webhookSecret: form.webhookSecret || undefined,
        fallbackMessage: form.fallbackMessage,
        echoMessage: form.fallbackMessage,
        autoReplyRules: form.autoReplyRules,
        aiEnabled: form.aiEnabled,
        aiMaskId: form.aiMaskId,
        aiMasks: form.aiMasks,
        aiProvider: form.aiProvider,
        aiModel: form.aiModel,
        verifySessionTtlHours: Number(form.verifySessionTtlHours),
        verifyRateLimitMaxAttempts: Number(form.verifyRateLimitMaxAttempts),
        verifyRateLimitWindowMinutes: Number(form.verifyRateLimitWindowMinutes),
        verifyFailMessage: form.verifyFailMessage,
        verifyRequiredHint: form.verifyRequiredHint,
        verifyPromptOrderNumber: form.verifyPromptOrderNumber,
        verifyPromptLastOrderDate: form.verifyPromptLastOrderDate,
        handoverKeywords: textToKeywords(form.handoverKeywordsText),
        replyMode: form.replyMode,
        outgoingUrlHint: form.outgoingUrlHint,
        eventLogRetentionDays: Number(form.eventLogRetentionDays),
        eventLogMaxRecords: Number(form.eventLogMaxRecords),
        eventLogStoreFullPayload: form.eventLogStoreFullPayload,
        eventLogPersistPrivate: form.eventLogPersistPrivate,
        eventLogPersistOtherNoise: form.eventLogPersistOtherNoise,
        handoverAssignMode: form.handoverAssignMode,
        handoverAssigneeId: form.handoverAssigneeId,
        handoverDefaultInboxId: form.handoverDefaultInboxId,
        inboxApiAccessToken: form.inboxApiAccessToken || undefined,
        handoverMessageInHours: form.handoverMessageInHours,
        handoverMessageOutOfHours: form.handoverMessageOutOfHours,
        handoverCallbackAckMessage: form.handoverCallbackAckMessage,
        handoverEmergencyEnabled: form.handoverEmergencyEnabled,
        handoverEmergencyKeywords: textToKeywords(form.handoverEmergencyKeywordsText),
        handoverMessageEmergency: form.handoverMessageEmergency,
        reclaimEnabled: form.reclaimEnabled,
        reclaimOnAssigneeOffline: form.reclaimOnAssigneeOffline,
        reclaimOnOohAgentSilent: form.reclaimOnOohAgentSilent,
        reclaimOohSilentMinutes: Number(form.reclaimOohSilentMinutes),
        reclaimOohTreatNoAgentReplyAsSilent: form.reclaimOohTreatNoAgentReplyAsSilent,
        reclaimInHoursAgentSilentEnabled: form.reclaimInHoursAgentSilentEnabled,
        reclaimInHoursSilentMinutes: Number(form.reclaimInHoursSilentMinutes),
        reclaimInHoursTreatNoAgentReplyAsSilent: form.reclaimInHoursTreatNoAgentReplyAsSilent,
        reclaimMessageOffline: form.reclaimMessageOffline,
        reclaimMessageOoh: form.reclaimMessageOoh,
        reclaimMessageInHours: form.reclaimMessageInHours,
        reclaimContinueWithEcho: form.reclaimContinueWithEcho,
        resolveCleanupEnabled: form.resolveCleanupEnabled,
      });
      setForm(toFormState(saved));
      setTokenVisible(false);
      setSecretVisible(false);
      ToastService.show({
        title: 'Збережено',
        description: 'Налаштування Chatwoot Bot оновлено',
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося зберегти',
        color: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearWebhookSecret = async () => {
    if (!form?.hasWebhookSecret) return;
    setIsClearingWebhookSecret(true);
    try {
      const saved = await chatwootBotApi.updateSettings({ clearWebhookSecret: true });
      setForm(toFormState(saved));
      setSecretVisible(false);
      ToastService.show({
        title: 'Webhook Secret очищено',
        description: 'Перевірка plain header вимкнена до збереження нового значення',
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося очистити secret',
        color: 'danger',
      });
    } finally {
      setIsClearingWebhookSecret(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await chatwootBotApi.testConnection();
      ToastService.show({
        title: result.ok ? 'Зʼєднання OK' : 'Зʼєднання невдале',
        description: result.error || result.message,
        color: result.ok ? 'success' : 'danger',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Тест не вдався',
        color: 'danger',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearEvents = async () => {
    if (!clearEventsConfirm) {
      setClearEventsConfirm(true);
      return;
    }
    setIsClearingEvents(true);
    try {
      const deleted = await chatwootBotApi.clearRecentEvents();
      setEvents([]);
      setClearEventsConfirm(false);
      ToastService.show({
        title: 'Історію очищено',
        description: `Видалено записів: ${deleted}`,
        color: 'success',
      });
    } catch (error) {
      setClearEventsConfirm(false);
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося очистити',
        color: 'danger',
      });
    } finally {
      setIsClearingEvents(false);
    }
  };

  const handleUnassignConversation = async (conversationId: number) => {
    setUnassigningConvId(conversationId);
    try {
      const result = await chatwootBotApi.unassignConversation(conversationId);
      ToastService.show({
        title: `Знято assignee · conv #${conversationId}`,
        description: `handover attr cleared · typing_off=${result.typingOff}`,
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Не вдалося зняти assignee',
        description: error instanceof Error ? error.message : 'Unassign failed',
        color: 'danger',
      });
    } finally {
      setUnassigningConvId(null);
    }
  };

  return {
    form,
    isLoading,
    isSaving,
    isTesting,
    isProbingWebhook,
    setIsProbingWebhook,
    events,
    agents,
    tokenVisible,
    setTokenVisible,
    secretVisible,
    setSecretVisible,
    isClearingWebhookSecret,
    isClearingEvents,
    unassigningConvId,
    clearEventsConfirm,
    setClearEventsConfirm,
    inboxTokenVisible,
    setInboxTokenVisible,
    expandedPayloadIds,
    inboxHours,
    isLoadingInboxHours,
    verifyTestPhone,
    setVerifyTestPhone,
    verifyTestOrder,
    setVerifyTestOrder,
    verifyTestDate,
    setVerifyTestDate,
    verifyTestResult,
    setVerifyTestResult,
    isVerifyTesting,
    setIsVerifyTesting,
    aiTestMessage,
    setAiTestMessage,
    aiTestReply,
    setAiTestReply,
    isAiTesting,
    setIsAiTesting,
    llmPlatform,
    setLlmPlatform,
    webhookProcessorHealth,
    loadWebhookProcessorHealth,
    activeTab,
    setActiveTab,
    togglePayloadExpanded,
    loadInboxHours,
    loadEvents,
    updateField,
    setForm,
    handleSave,
    handleClearWebhookSecret,
    handleTest,
    handleClearEvents,
    handleUnassignConversation,
  };
}

export type ChatwootBotSettingsPageModel = ReturnType<typeof useChatwootBotSettingsPage>;
