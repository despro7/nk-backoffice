import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  cn,
  Divider,
  Input,
  RadioGroup,
  Select,
  SelectItem,
  Switch,
  Textarea,
  Tooltip,
  useRadio,
  VisuallyHidden,
  type RadioProps,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  DEFAULT_CHATWOOT_BOT_SETTINGS,
  type ChatwootBotAgentSummary,
  type ChatwootBotEventRecord,
  type ChatwootInboxHoursStatus,
  type ChatwootBotReplyMode,
  type ChatwootHandoverAssignMode,
  type ChatwootBotSettingsResponse,
  type ChatwootBotAutoReplyRule,
  type ChatwootBotAiMask,
} from '@shared/types/chatwootBot';

type FormState = {
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
  aiProvider: '' | 'openai' | 'google';
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
};

function keywordsToText(keywords: string[]): string {
  return keywords.join(', ');
}

function textToKeywords(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function compressHandoverTrace(traceBody: string): string {
  const bits: string[] = [];
  if (traceBody.includes('bot_handoff:ok')) bits.push('handoff✓');
  else if (traceBody.includes('bot_handoff:start')) bits.push('handoff…');
  if (/auto_inbox:assignee=#\d+/.test(traceBody)) {
    bits.push(traceBody.match(/auto_inbox:assignee=#\d+/)?.[0] ?? 'assign✓');
  } else if (traceBody.includes('auto_inbox:assignee=none') || traceBody.includes('skip:auto_inbox')) {
    bits.push('assign:none');
  } else if (traceBody.includes('assign:via_')) {
    bits.push(traceBody.match(/assign:via_\w+/)?.[0] ?? 'assign✓');
  }
  if (traceBody.includes('public_message:ok')) bits.push('msg✓');
  if (traceBody.includes('private_note:ok')) bits.push('note✓');
  if (traceBody.includes('custom_attributes:ok')) bits.push('attrs✓');
  return bits.join(' ');
}

function formatEventLogDetails(details: string): string {
  const trimmed = details.trim();

  if (
    trimmed.includes('<!DOCTYPE') ||
    trimmed.includes('<html') ||
    /HTML\s+\d{3}/i.test(trimmed)
  ) {
    const step = trimmed.match(/handover step=[^\s·]+/)?.[0];
    const proc = trimmed.match(/build=[^;]+;host=[^;]+;pid=\d+/)?.[0];
    const title = trimmed.match(/<title>\s*([^<]+)/i)?.[1]?.replace(/\s+/g, ' ').trim();
    const summary = title ? `HTML ${title}` : 'HTML-відповідь проксі';
    return [step, proc, summary].filter(Boolean).join(' · ');
  }

  const stepErr = trimmed.match(/handover step=[^\s·]+/)?.[0];
  const proc = trimmed.match(/build=[^;]+;host=[^;]+;pid=\d+/)?.[0];
  const mode = trimmed.match(/mode=\w+/)?.[0];
  const hours = trimmed.match(/hours=(?:in|ooh)/)?.[0];
  const assign =
    trimmed.match(/auto_inbox:(?:#\d+|none)/)?.[0] ??
    trimmed.match(/manual:[^\s·]+/)?.[0];
  const traceRaw = trimmed.match(/trace=([^·]+)/)?.[1];

  if (traceRaw || mode || stepErr) {
    const traceShort = traceRaw ? compressHandoverTrace(traceRaw) : '';
    return [mode, hours, assign, traceShort, stepErr, proc].filter(Boolean).join(' · ');
  }

  const max = 220;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function toFormState(data: ChatwootBotSettingsResponse): FormState {
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
  };
}

function actionColor(action: ChatwootBotEventRecord['action']): 'success' | 'warning' | 'danger' | 'default' {
  switch (action) {
    case 'echo':
      return 'success';
    case 'handover':
      return 'warning';
    case 'error':
      return 'danger';
    case 'ignored':
      return 'default';
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

const replyModeRadioCardClassNames: RadioProps['classNames'] = {
  base: cn(
    'group relative inline-flex max-w-none w-full min-w-0 flex-1 flex-row items-center',
    'justify-start gap-2 m-0 px-3 py-2 cursor-pointer select-none tap-highlight-transparent',
    'border border-default-200 rounded-medium',
    'hover:bg-default-100 active:opacity-80',
    'data-[selected=true]:border-primary data-[selected=true]:bg-primary-50/40',
  ),
  wrapper: cn(
    'shrink-0',
    'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
    'group-data-[focus-visible=true]:outline-none',
  ),
  labelWrapper: 'flex flex-col gap-0.5 flex-1 min-w-0 ms-0 ml-0',
  label: 'text-sm font-medium text-foreground',
  description: 'text-xs text-foreground-500',
};

function FormSwitchField({
  isSelected,
  onValueChange,
  isDisabled,
  title,
  description,
}: {
  isSelected: boolean;
  onValueChange: (v: boolean) => void;
  isDisabled?: boolean;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        classNames={{ base: 'mt-0.5' }}
        isSelected={isSelected}
        isDisabled={isDisabled}
        onValueChange={onValueChange}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-default-500">{description}</p> : null}
      </div>
    </div>
  );
}

type ReplyModeRadioProps = RadioProps & {
  description?: string;
};

function ReplyModeRadio({ description, children, classNames, ...props }: ReplyModeRadioProps) {
  const {
    Component,
    getBaseProps,
    getWrapperProps,
    getInputProps,
    getLabelProps,
    getLabelWrapperProps,
    getControlProps,
    getDescriptionProps,
  } = useRadio({
    ...props,
    description,
    classNames: {
      ...replyModeRadioCardClassNames,
      ...classNames,
      base: cn(replyModeRadioCardClassNames?.base, classNames?.base),
      wrapper: cn(replyModeRadioCardClassNames?.wrapper, classNames?.wrapper),
      labelWrapper: cn(replyModeRadioCardClassNames?.labelWrapper, classNames?.labelWrapper),
      label: cn(replyModeRadioCardClassNames?.label, classNames?.label),
      description: cn(replyModeRadioCardClassNames?.description, classNames?.description),
    },
  });

  return (
    <Component {...getBaseProps()}>
      <VisuallyHidden>
        <input {...getInputProps()} />
      </VisuallyHidden>
      <span {...getWrapperProps()}>
        <span {...getControlProps()} />
      </span>
      <div {...getLabelWrapperProps()}>
        {children ? <span {...getLabelProps()}>{children}</span> : null}
        {description ? <span {...getDescriptionProps()}>{description}</span> : null}
      </div>
    </Component>
  );
}

const SettingsChatwootBot: React.FC = () => {
  const { hasPermission } = useRoleAccess();
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
  const [verifyTestResult, setVerifyTestResult] = useState<string>('');
  const [isVerifyTesting, setIsVerifyTesting] = useState(false);
  const [aiTestMessage, setAiTestMessage] = useState('Що є в наявності на вітрині?');
  const [aiTestReply, setAiTestReply] = useState('');
  const [isAiTesting, setIsAiTesting] = useState(false);
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

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await chatwootBotApi.getSettings(false);
      setForm(toFormState(data));
      void chatwootBotApi.listAgents().then(setAgents).catch(() => setAgents([]));
      void loadInboxHours(data.handoverDefaultInboxId);
      await loadEvents();
      void chatwootBotApi
        .getWebhookProcessorHealth()
        .then(setWebhookProcessorHealth)
        .catch(() => setWebhookProcessorHealth(null));
    } catch (error) {
      console.error('SettingsChatwootBot load error:', error);
      ToastService.show({
        title: 'Помилка',
        description: 'Не вдалося завантажити налаштування Chatwoot Bot',
        color: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadEvents, loadInboxHours]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  if (!hasPermission(PERMISSIONS.PAGE_SETTINGS_ADMIN)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до цієї сторінки.</p>
        </div>
      </div>
    );
  }

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

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center h-64 text-default-500">
        Завантаження…
      </div>
    );
  }

  const keywordChips = textToKeywords(form.handoverKeywordsText);

  return (
    <div className="space-y-6">
      <p className="text-sm text-default-500">
        Патерни, AI, verify замовлень, handover, reclaim і робочі години.
      </p>

      {webhookProcessorHealth?.mismatch && (
        <Card className="border-2 border-danger-300 bg-danger-50/40">
          <CardBody className="gap-2 p-4">
            <div className="flex gap-2 items-start">
              <DynamicIcon name="triangle-alert" size={20} className="text-danger shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-semibold text-danger-800">Webhook не на цей backoffice</p>
                <p className="text-danger-900/90">{webhookProcessorHealth.message}</p>
                <p className="text-xs text-danger-800/80 font-mono">
                  local host={webhookProcessorHealth.localHost ?? '?'} build=
                  {webhookProcessorHealth.localBuild}
                  {webhookProcessorHealth.targetHost
                    ? ` · tunnel host=${webhookProcessorHealth.targetHost} build=${webhookProcessorHealth.targetBuild ?? '?'}`
                    : ''}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {!form.enabled && (
        <Card className="border-2 border-warning-300 bg-warning-50/50">
          <CardBody className="p-4 text-sm text-warning-900">
            <strong>Бот вимкнено.</strong> HTTP webhook може долітати, але обробка йде в{' '}
            <span className="font-mono">bot_disabled</span> – echo/handover не виконуються. Увімкніть
            перемикач нижче, режим <span className="font-mono">live</span> і натисніть «Зберегти».
          </CardBody>
        </Card>
      )}

      {webhookProcessorHealth &&
        !webhookProcessorHealth.mismatch &&
        webhookProcessorHealth.tunnelPointsHere &&
        form.outgoingUrlHint.includes('chatwoot-dev') && (
          <Card className="border border-success-200 bg-success-50/50">
            <CardBody className="p-4 text-sm text-success-900 space-y-1">
              <p>
                Health тунелю chatwoot-dev вказує на цей Mac. Перевірте доставку кнопкою «Тест
                Outgoing URL» – у терміналі має зʼявитись{' '}
                <span className="font-mono text-xs">📦 Webhook raw body</span>.
              </p>
              <p className="text-xs text-success-800/90">
                У Chatwoot → Agent Bot → <strong>Outgoing URL</strong> має бути той самий рядок, що
                в hint (backoffice hint сам Chatwoot не змінює).
              </p>
            </CardBody>
          </Card>
        )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6 min-w-0 pr-1">
          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="bot" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Підключення</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <div className="flex items-center gap-3">
                <Switch isSelected={form.enabled} onValueChange={(v) => updateField('enabled', v)} />
                <div>
                  <p className="text-sm font-medium">Бот увімкнено</p>
                  <p className="text-xs text-default-500">
                    Вимкнено – у журналі <span className="font-mono">bot_disabled</span>, без echo/handover
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                <Input
                  className="min-w-0 flex-1"
                  label="Base URL Chatwoot"
                  placeholder="https://chat.example.com"
                  value={form.baseUrl}
                  onValueChange={(v) => updateField('baseUrl', v)}
                />
                <Input
                  className="w-full sm:w-28 sm:shrink-0"
                  type="number"
                  label="Account ID"
                  value={String(form.accountId)}
                  onValueChange={(v) => updateField('accountId', Number(v) || 1)}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Input
                  label="API Access Token"
                  type={tokenVisible ? 'text' : 'password'}
                  placeholder={
                    form.hasApiAccessToken
                      ? `Збережено: ${form.apiAccessTokenMasked}`
                      : 'Вставте api_access_token'
                  }
                  value={form.apiAccessToken}
                  onValueChange={(v) => updateField('apiAccessToken', v)}
                  description="Токен Agent Bot – для echo/handover і POST assignments (assign конкретного агента через API, не плутати з UI «політики призначення» Business plan)."
                  endContent={
                    form.apiAccessToken.trim() ? (
                      <Tooltip content={tokenVisible ? 'Приховати' : 'Показати'} placement="top">
                        <Button
                          size="sm"
                          variant="light"
                          isIconOnly
                          aria-label={tokenVisible ? 'Приховати token' : 'Показати token'}
                          onPress={() => setTokenVisible((v) => !v)}
                        >
                          <DynamicIcon name={tokenVisible ? 'eye-off' : 'eye'} size={16} />
                        </Button>
                      </Tooltip>
                    ) : null
                  }
                />

                <Input
                  label="Inbox API token (User PAT, опційно)"
                  type={inboxTokenVisible ? 'text' : 'password'}
                  placeholder={
                    form.hasInboxApiAccessToken
                      ? `Збережено: ${form.inboxApiAccessTokenMasked}`
                      : 'Personal Access Token з профілю Chatwoot'
                  }
                  value={form.inboxApiAccessToken}
                  onValueChange={(v) => updateField('inboxApiAccessToken', v)}
                  description="Handover: спочатку Agent Bot token (bot_handoff + assign). PAT – fallback для assign на старих Chatwoot, список агентів і години inbox."
                  endContent={
                    form.inboxApiAccessToken.trim() ? (
                      <Tooltip content={inboxTokenVisible ? 'Приховати' : 'Показати'} placement="top">
                        <Button
                          size="sm"
                          variant="light"
                          isIconOnly
                          aria-label={inboxTokenVisible ? 'Приховати inbox token' : 'Показати inbox token'}
                          onPress={() => setInboxTokenVisible((v) => !v)}
                        >
                          <DynamicIcon name={inboxTokenVisible ? 'eye-off' : 'eye'} size={16} />
                        </Button>
                      </Tooltip>
                    ) : null
                  }
                />
              </div>

              <Input
                label="Webhook Secret"
                type={secretVisible ? 'text' : 'password'}
                placeholder={
                  form.hasWebhookSecret
                    ? `Збережено: ${form.webhookSecretMasked}`
                    : 'Порожньо – без plain header (рекомендовано до HMAC)'
                }
                value={form.webhookSecret}
                onValueChange={(v) => updateField('webhookSecret', v)}
                description="Новий secret – введіть і «Зберегти». Порожнє поле не змінює збережене; іконка справа очищає його."
                endContent={
                  form.hasWebhookSecret && !form.webhookSecret.trim() ? (
                    <Tooltip content="Очистити збережений Webhook Secret" placement="top">
                      <Button
                        size="sm"
                        variant="light"
                        isIconOnly
                        aria-label="Очистити збережений Webhook Secret"
                        isLoading={isClearingWebhookSecret}
                        isDisabled={isClearingWebhookSecret}
                        onPress={() => void handleClearWebhookSecret()}
                      >
                        {!isClearingWebhookSecret ? (
                          <DynamicIcon name="trash-2" size={16} className="text-danger" />
                        ) : null}
                      </Button>
                    </Tooltip>
                  ) : form.webhookSecret.trim() ? (
                    <Tooltip content={secretVisible ? 'Приховати' : 'Показати'} placement="top">
                      <Button
                        size="sm"
                        variant="light"
                        isIconOnly
                        aria-label={secretVisible ? 'Приховати secret' : 'Показати secret'}
                        onPress={() => setSecretVisible((v) => !v)}
                      >
                        <DynamicIcon name={secretVisible ? 'eye-off' : 'eye'} size={16} />
                      </Button>
                    </Tooltip>
                  ) : null
                }
              />
              <div className="rounded-medium border border-default-200 p-3 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <Input
                    className="min-w-0 flex-1"
                    label="Outgoing URL hint"
                    value={form.outgoingUrlHint}
                    onValueChange={(v) => updateField('outgoingUrlHint', v)}
                  />
                  <Button
                    size="sm"
                    variant="flat"
                    className="shrink-0 w-full sm:w-auto"
                    isDisabled={!form.outgoingUrlHint.trim()}
                    isLoading={isProbingWebhook}
                    onPress={() => {
                      void (async () => {
                        setIsProbingWebhook(true);
                        try {
                          const r = await chatwootBotApi.probeOutgoingWebhook();
                          ToastService.show({
                            title: r.ok ? 'Probe OK' : `Probe HTTP ${r.httpStatus}`,
                            description: `${r.postUrl} – ${r.bodyPreview.slice(0, 80)}`,
                            color: r.ok ? 'success' : 'warning',
                          });
                          void loadEvents();
                        } catch (e) {
                          ToastService.show({
                            title: 'Probe не вдався',
                            description: e instanceof Error ? e.message : String(e),
                            color: 'danger',
                          });
                        } finally {
                          setIsProbingWebhook(false);
                        }
                      })();
                    }}
                    startContent={
                      !isProbingWebhook ? (
                        <DynamicIcon name="radar" size={16} />
                      ) : undefined
                    }
                  >
                    Тест Outgoing URL
                  </Button>
                </div>
                <p className="text-xs text-default-500">
                  {form.outgoingUrlHint.includes('chatwoot-dev')
                    ? 'Скопіюйте в Chatwoot Agent Bot → Outgoing URL. Локально: npm run dev:chatwoot.'
                    : 'Повний Outgoing URL – той самий, що в Chatwoot Agent Bot (для health/probe).'}
                </p>
              </div>

              <RadioGroup
                label="Режим відповіді"
                size="sm"
                orientation="horizontal"
                value={form.replyMode}
                onValueChange={(v) => updateField('replyMode', v as ChatwootBotReplyMode)}
                classNames={{
                  base: 'gap-2',
                  wrapper: 'flex flex-row flex-wrap gap-2 w-full',
                }}
              >
                <ReplyModeRadio value="dry_run" description="Лише журнал">
                  dry_run
                </ReplyModeRadio>
                <ReplyModeRadio value="live" description="POST у Chatwoot">
                  live
                </ReplyModeRadio>
              </RadioGroup>
            </CardBody>
            <CardFooter className="gap-2 flex-wrap p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
              <Button
                variant="flat"
                color="warning"
                isDisabled={isTesting}
                onPress={() => void handleTest()}
                startContent={
                  <DynamicIcon
                    name={isTesting ? 'loader-2' : 'plug'}
                    className={isTesting ? 'animate-spin' : ''}
                    size={16}
                  />
                }
              >
                Перевірити зʼєднання
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="message-square" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Відповіді та AI</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <Textarea
                label="Fallback (якщо патерн і AI не відповіли)"
                minRows={3}
                value={form.fallbackMessage}
                onValueChange={(v) => updateField('fallbackMessage', v)}
              />

              <Input
                label="Handover keywords"
                placeholder="оператор, людина, менеджер"
                value={form.handoverKeywordsText}
                onValueChange={(v) => updateField('handoverKeywordsText', v)}
                description="Через кому. Substring match, без урахування регістру"
              />
              {keywordChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywordChips.map((kw) => (
                    <Chip key={kw} size="sm" variant="flat">
                      {kw}
                    </Chip>
                  ))}
                </div>
              )}

              <Divider />
              <div className="flex flex-wrap gap-2 items-center">
                <p className="text-sm font-medium w-full">Патерни (автовідповіді)</p>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    const id = `rule_${Date.now()}`;
                    updateField('autoReplyRules', [
                      ...form.autoReplyRules,
                      {
                        id,
                        enabled: true,
                        priority: (form.autoReplyRules.length + 1) * 10,
                        matchType: 'substring',
                        pattern: '',
                        reply: '',
                        caseInsensitive: true,
                      },
                    ]);
                  }}
                >
                  Додати правило
                </Button>
              </div>
              {form.autoReplyRules.map((rule, idx) => (
                <div key={rule.id} className="grid gap-2 p-3 border border-default-200 rounded-lg">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      size="sm"
                      className="flex-1 min-w-[120px]"
                      label="Патерн"
                      value={rule.pattern}
                      onValueChange={(v) => {
                        const next = [...form.autoReplyRules];
                        next[idx] = { ...rule, pattern: v };
                        updateField('autoReplyRules', next);
                      }}
                    />
                    <Select
                      size="sm"
                      className="w-40"
                      label="Тип"
                      selectedKeys={[rule.matchType]}
                      onSelectionChange={(keys) => {
                        const key = Array.from(keys)[0];
                        if (key !== 'substring' && key !== 'regex') return;
                        const next = [...form.autoReplyRules];
                        next[idx] = { ...rule, matchType: key };
                        updateField('autoReplyRules', next);
                      }}
                    >
                      <SelectItem key="substring">substring</SelectItem>
                      <SelectItem key="regex">regex</SelectItem>
                    </Select>
                    <Input
                      size="sm"
                      type="number"
                      className="w-24"
                      label="Пріоритет"
                      value={String(rule.priority)}
                      onValueChange={(v) => {
                        const next = [...form.autoReplyRules];
                        next[idx] = { ...rule, priority: Number(v) || 0 };
                        updateField('autoReplyRules', next);
                      }}
                    />
                  </div>
                  <Textarea
                    size="sm"
                    label="Відповідь"
                    minRows={2}
                    value={rule.reply}
                    onValueChange={(v) => {
                      const next = [...form.autoReplyRules];
                      next[idx] = { ...rule, reply: v };
                      updateField('autoReplyRules', next);
                    }}
                  />
                  <div className="flex gap-2">
                    <Switch
                      size="sm"
                      isSelected={rule.enabled}
                      onValueChange={(v) => {
                        const next = [...form.autoReplyRules];
                        next[idx] = { ...rule, enabled: v };
                        updateField('autoReplyRules', next);
                      }}
                    >
                      Увімкнено
                    </Switch>
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      onPress={() =>
                        updateField(
                          'autoReplyRules',
                          form.autoReplyRules.filter((r) => r.id !== rule.id),
                        )
                      }
                    >
                      Видалити
                    </Button>
                  </div>
                </div>
              ))}

              <Divider />
              <FormSwitchField
                title="AI-відповіді (LLM)"
                description="Ключі API – Налаштування → LLM (/settings/llm) або env LLM_*"
                isSelected={form.aiEnabled}
                onValueChange={(v) => updateField('aiEnabled', v)}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <Select
                  label="Маска (system prompt)"
                  selectedKeys={form.aiMaskId ? [form.aiMaskId] : []}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0];
                    if (key) updateField('aiMaskId', String(key));
                  }}
                >
                  {form.aiMasks.map((m) => (
                    <SelectItem key={m.id} textValue={m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Провайдер (override)"
                  selectedKeys={[form.aiProvider || 'platform']}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0];
                    updateField(
                      'aiProvider',
                      key === 'openai' || key === 'google' ? key : '',
                    );
                  }}
                >
                  <SelectItem key="platform">З платформи</SelectItem>
                  <SelectItem key="openai">OpenAI</SelectItem>
                  <SelectItem key="google">Google Gemini</SelectItem>
                </Select>
              </div>
              <Input
                label="Модель (override, опційно)"
                value={form.aiModel}
                onValueChange={(v) => updateField('aiModel', v)}
              />
              <Textarea
                label="System prompt обраної маски"
                minRows={4}
                value={
                  form.aiMasks.find((m) => m.id === form.aiMaskId)?.systemPrompt ?? ''
                }
                onValueChange={(v) => {
                  const next = form.aiMasks.map((m) =>
                    m.id === form.aiMaskId ? { ...m, systemPrompt: v } : m,
                  );
                  updateField('aiMasks', next);
                }}
              />

              <Divider />
              <p className="text-sm font-medium">Верифікація замовлень</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Input
                  type="number"
                  label="TTL сесії (год)"
                  value={String(form.verifySessionTtlHours)}
                  onValueChange={(v) => updateField('verifySessionTtlHours', Number(v) || 24)}
                />
                <Input
                  type="number"
                  label="Спроб / вікно"
                  value={String(form.verifyRateLimitMaxAttempts)}
                  onValueChange={(v) =>
                    updateField('verifyRateLimitMaxAttempts', Number(v) || 5)
                  }
                />
                <Input
                  type="number"
                  label="Вікно (хв)"
                  value={String(form.verifyRateLimitWindowMinutes)}
                  onValueChange={(v) =>
                    updateField('verifyRateLimitWindowMinutes', Number(v) || 15)
                  }
                />
              </div>
              <Textarea
                label="Повідомлення при невдалій verify"
                minRows={2}
                value={form.verifyFailMessage}
                onValueChange={(v) => updateField('verifyFailMessage', v)}
              />
              <Textarea
                label="Підказка verification_required"
                minRows={2}
                value={form.verifyRequiredHint}
                onValueChange={(v) => updateField('verifyRequiredHint', v)}
              />

              <Divider />
              <p className="text-sm font-medium">Тести (без PII у відповіді)</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label="Телефон"
                  value={verifyTestPhone}
                  onValueChange={setVerifyTestPhone}
                />
                <Input
                  label="Номер замовлення"
                  value={verifyTestOrder}
                  onValueChange={setVerifyTestOrder}
                />
                <Input
                  label="Або дата останнього замовлення"
                  value={verifyTestDate}
                  onValueChange={setVerifyTestDate}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={isVerifyTesting}
                  onPress={async () => {
                    setIsVerifyTesting(true);
                    setVerifyTestResult('');
                    try {
                      const data = verifyTestDate.trim()
                        ? await chatwootBotApi.verifyByDateTest(
                            verifyTestPhone,
                            verifyTestDate,
                          )
                        : await chatwootBotApi.verifyOrderTest(
                            verifyTestPhone,
                            verifyTestOrder,
                          );
                      setVerifyTestResult(JSON.stringify(data, null, 2));
                    } catch (e) {
                      setVerifyTestResult(e instanceof Error ? e.message : 'Помилка');
                    } finally {
                      setIsVerifyTesting(false);
                    }
                  }}
                >
                  Тест verify
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={isAiTesting}
                  onPress={async () => {
                    setIsAiTesting(true);
                    setAiTestReply('');
                    try {
                      const data = await chatwootBotApi.testAi(aiTestMessage);
                      setAiTestReply(data.reply);
                    } catch (e) {
                      setAiTestReply(e instanceof Error ? e.message : 'Помилка');
                    } finally {
                      setIsAiTesting(false);
                    }
                  }}
                >
                  Тест AI
                </Button>
              </div>
              {verifyTestResult ? (
                <pre className="text-xs bg-default-100 p-2 rounded-lg overflow-auto max-h-40">
                  {verifyTestResult}
                </pre>
              ) : null}
              <Textarea
                label="Повідомлення для тесту AI"
                minRows={2}
                value={aiTestMessage}
                onValueChange={setAiTestMessage}
              />
              {aiTestReply ? (
                <Textarea label="Відповідь AI" minRows={3} isReadOnly value={aiTestReply} />
              ) : null}
            </CardBody>
            <CardFooter className="p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="headset" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Handover і робочі години</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                <Select
                  label="Призначення при handover"
                  selectedKeys={[form.handoverAssignMode]}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0];
                    if (key === 'auto_inbox' || key === 'specific_agent') {
                      updateField('handoverAssignMode', key);
                    }
                  }}
                  description="Після bot_handoff (open) Chatwoot сам призначає агента, якщо в inbox увімкнено automatic assignment / Assignment V2."
                >
                  <SelectItem key="auto_inbox" textValue="Автоматично">
                    Автоматично (Chatwoot inbox assignment)
                  </SelectItem>
                  <SelectItem key="specific_agent" textValue="Конкретний агент">
                    Конкретний агент
                  </SelectItem>
                </Select>
                <Select
                  label="Агент для виклику"
                  placeholder="Оберіть агента або введіть ID нижче"
                  isDisabled={form.handoverAssignMode === 'auto_inbox'}
                  selectedKeys={
                    form.handoverAssigneeId != null ? [String(form.handoverAssigneeId)] : []
                  }
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0];
                    updateField('handoverAssigneeId', key ? Number(key) : null);
                  }}
                  description="ID користувача-агента в Chatwoot (не Agent Bot). Список – через User PAT у полі «Inbox API token»."
                >
                  {agents.map((a) => (
                    <SelectItem key={String(a.id)} textValue={a.name}>
                      {a.name} (#{a.id})
                    </SelectItem>
                  ))}
                </Select>
                <Input
                  type="number"
                  label="Агент ID (вручну)"
                  placeholder="напр. 2"
                  className="w-full sm:w-40 sm:shrink-0"
                  isDisabled={form.handoverAssignMode === 'auto_inbox'}
                  value={form.handoverAssigneeId != null ? String(form.handoverAssigneeId) : ''}
                  onValueChange={(v) =>
                    updateField('handoverAssigneeId', v.trim() ? Number(v) || null : null)
                  }
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                <Input
                  type="number"
                  label="Inbox ID (fallback / симуляція)"
                  description="Робочі години беруться з Chatwoot → Inbox → Робочий час. У webhook використовується inbox_id з conversation; це поле – якщо його немає."
                  className="min-w-0 flex-1"
                  value={form.handoverDefaultInboxId != null ? String(form.handoverDefaultInboxId) : ''}
                  onValueChange={(v) =>
                    updateField('handoverDefaultInboxId', v.trim() ? Number(v) || null : null)
                  }
                />
                <div className="flex flex-col items-start gap-2 min-w-0">
                  {inboxHours ? (
                    <Chip
                      size="sm"
                      variant="flat"
                      color={inboxHours.inHours ? 'success' : 'warning'}
                    >
                      Зараз: {inboxHours.inHours ? 'робочі години' : 'поза годинами'} ·{' '}
                      {inboxHours.schedule.name} ({inboxHours.source})
                    </Chip>
                  ) : (
                    <span className="text-xs text-default-500">
                      Не вдалося зчитати години inbox – перевірте User PAT.
                    </span>
                  )}
                  <Button
                    size="sm"
                    color="primary"
                    data-btn-tone="primary-blue-flat"
                    isLoading={isLoadingInboxHours}
                    onPress={() => void loadInboxHours(form.handoverDefaultInboxId)}
                  >
                    Оновити з Chatwoot
                  </Button>
                </div>
              </div>
              <Textarea
                label="Повідомлення клієнту (робочі години, виклик оператора)"
                minRows={2}
                value={form.handoverMessageInHours}
                onValueChange={(v) => updateField('handoverMessageInHours', v)}
              />
              <Textarea
                label="Повідомлення клієнту (поза годинами – бот лишається)"
                minRows={3}
                value={form.handoverMessageOutOfHours}
                onValueChange={(v) => updateField('handoverMessageOutOfHours', v)}
              />
              <Textarea
                label="Підтвердження після збору контактів"
                minRows={2}
                value={form.handoverCallbackAckMessage}
                onValueChange={(v) => updateField('handoverCallbackAckMessage', v)}
              />
              <div className="flex items-center gap-3">
                <Switch
                  isSelected={form.handoverEmergencyEnabled}
                  onValueChange={(v) => updateField('handoverEmergencyEnabled', v)}
                />
                <div>
                  <p className="text-sm font-medium">Екстрений виклик поза годинами</p>
                  <p className="text-xs text-default-500">Keywords зараз; пізніше – класифікація Jev</p>
                </div>
              </div>
              <Input
                label="Emergency keywords"
                value={form.handoverEmergencyKeywordsText}
                onValueChange={(v) => updateField('handoverEmergencyKeywordsText', v)}
              />
              <Textarea
                label="Повідомлення клієнту (екстрений виклик)"
                minRows={2}
                value={form.handoverMessageEmergency}
                onValueChange={(v) => updateField('handoverMessageEmergency', v)}
              />
            </CardBody>
            <CardFooter className="p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="flex flex-col gap-6 min-w-0 max-h-full min-h-0 pr-1">
          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="rotate-ccw" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Reclaim (повернення діалогу боту)</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <p className="text-xs text-default-500">
                Якщо діалог уже у людини-оператора, бот може знову відповідати клієнту за правилами нижче.
                Для перевірки «офлайн» і таймаутів мовчання потрібен User PAT (поле Inbox API token).
              </p>
              <FormSwitchField
                isSelected={form.reclaimEnabled}
                onValueChange={(v) => updateField('reclaimEnabled', v)}
                title="Увімкнути reclaim"
                description="Якщо вимкнено – бот лише ігнорує повідомлення, поки діалог у оператора."
              />
              <FormSwitchField
                isSelected={form.resolveCleanupEnabled}
                onValueChange={(v) => updateField('resolveCleanupEnabled', v)}
                title="Скидати «замок» при «Вирішити»"
                description="Зняти оператора з діалогу й дозволити боту після reopen (без публічного повідомлення)."
              />
              <Divider />
              <p className="text-sm font-semibold text-default-800">Завжди (і в робочі, і поза годинами)</p>
              <FormSwitchField
                isSelected={form.reclaimOnAssigneeOffline}
                isDisabled={!form.reclaimEnabled}
                onValueChange={(v) => updateField('reclaimOnAssigneeOffline', v)}
                title="Оператор офлайн у Chatwoot"
                description="Бот відповідає замість оператора, якщо призначений агент не в мережі."
              />
              <Textarea
                label="Текст клієнту (оператор офлайн)"
                minRows={2}
                isDisabled={!form.reclaimEnabled}
                value={form.reclaimMessageOffline}
                onValueChange={(v) => updateField('reclaimMessageOffline', v)}
              />
              <Divider />
              <p className="text-sm font-semibold text-default-800">Поза робочими годинами</p>
              <FormSwitchField
                isSelected={form.reclaimOnOohAgentSilent}
                isDisabled={!form.reclaimEnabled}
                onValueChange={(v) => updateField('reclaimOnOohAgentSilent', v)}
                title="Якщо оператор довго мовчить"
                description="Повернути діалог боту, коли з останньої публічної відповіді оператора минуло N хвилин."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Хвилин мовчання (поза годинами)"
                  isDisabled={!form.reclaimEnabled || !form.reclaimOnOohAgentSilent}
                  value={String(form.reclaimOohSilentMinutes)}
                  onValueChange={(v) =>
                    updateField('reclaimOohSilentMinutes', Number(v) || 10)
                  }
                />
                <FormSwitchField
                  isSelected={form.reclaimOohTreatNoAgentReplyAsSilent}
                  isDisabled={!form.reclaimEnabled || !form.reclaimOnOohAgentSilent}
                  onValueChange={(v) => updateField('reclaimOohTreatNoAgentReplyAsSilent', v)}
                  title="Одразу, якщо оператор ще не відповідав"
                  description="Вважати «мовчання» з моменту передачі діалогу людині."
                />
              </div>
              <Textarea
                label="Текст клієнту (поза годинами, після мовчання)"
                minRows={2}
                isDisabled={!form.reclaimEnabled}
                value={form.reclaimMessageOoh}
                onValueChange={(v) => updateField('reclaimMessageOoh', v)}
              />
              <Divider />
              <p className="text-sm font-semibold text-default-800">У робочі години</p>
              <FormSwitchField
                isSelected={form.reclaimInHoursAgentSilentEnabled}
                isDisabled={!form.reclaimEnabled}
                onValueChange={(v) => updateField('reclaimInHoursAgentSilentEnabled', v)}
                title="Reclaim за таймаутом мовчання (опційно)"
                description="За замовчуванням вимкнено: у робочі години бот не перехоплює діалог лише через мовчання."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Хвилин мовчання (у робочі години)"
                  isDisabled={
                    !form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled
                  }
                  value={String(form.reclaimInHoursSilentMinutes)}
                  onValueChange={(v) =>
                    updateField('reclaimInHoursSilentMinutes', Number(v) || 10)
                  }
                />
                <FormSwitchField
                  isSelected={form.reclaimInHoursTreatNoAgentReplyAsSilent}
                  isDisabled={
                    !form.reclaimEnabled || !form.reclaimInHoursAgentSilentEnabled
                  }
                  onValueChange={(v) =>
                    updateField('reclaimInHoursTreatNoAgentReplyAsSilent', v)
                  }
                  title="Одразу, якщо оператор ще не відповідав"
                  description="Те саме правило, що й поза годинами, але лише в робочий час."
                />
              </div>
              <Textarea
                label="Текст клієнту (робочі години, після мовчання)"
                minRows={2}
                isDisabled={!form.reclaimEnabled}
                value={form.reclaimMessageInHours}
                onValueChange={(v) => updateField('reclaimMessageInHours', v)}
              />
              <Divider />
              <FormSwitchField
                isSelected={form.reclaimContinueWithEcho}
                isDisabled={!form.reclaimEnabled}
                onValueChange={(v) => updateField('reclaimContinueWithEcho', v)}
                title="Після reclaim відповісти на це ж повідомлення"
                description="Echo або handover на поточний webhook (інакше – лише текст reclaim)."
              />
            </CardBody>
            <CardFooter className="p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
            </CardFooter>
          </Card>

          <Card className="shrink-0">
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="database" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Журнал webhook</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="TTL (днів)"
                  description="Записи старші за цей термін видаляються"
                  value={String(form.eventLogRetentionDays)}
                  onValueChange={(v) => updateField('eventLogRetentionDays', Number(v) || 14)}
                />
                <Input
                  type="number"
                  label="Макс. записів"
                  description="Після перевищення видаляються найстаріші"
                  value={String(form.eventLogMaxRecords)}
                  onValueChange={(v) => updateField('eventLogMaxRecords', Number(v) || 300)}
                />
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Switch
                    isSelected={form.eventLogStoreFullPayload}
                    onValueChange={(v) => updateField('eventLogStoreFullPayload', v)}
                  />
                  <div>
                    <p className="text-sm font-medium">Повний JSON payload</p>
                    <p className="text-xs text-default-500">
                      Увімкніть на час діагностики; збільшує розмір БД (обрізання ~64 KB).
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    isSelected={form.eventLogPersistPrivate}
                    onValueChange={(v) => updateField('eventLogPersistPrivate', v)}
                  />
                  <div>
                    <p className="text-sm font-medium">Логувати private notes</p>
                    <p className="text-xs text-default-500">
                      Debug: внутрішні нотатки агентів (`private_message`) у «Останні події».
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    isSelected={form.eventLogPersistOtherNoise}
                    onValueChange={(v) => updateField('eventLogPersistOtherNoise', v)}
                  />
                  <div>
                    <p className="text-sm font-medium">Логувати інший шум webhook</p>
                    <p className="text-xs text-default-500">
                      Debug: outgoing, unsupported_event, sender_not_contact (не duplicate).
                    </p>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex gap-2 px-4 items-center justify-between border-b border-default-200 shrink-0">
              <div className="flex gap-2 items-center">
                <DynamicIcon name="scroll-text" size={20} className="text-default-600" />
                <h2 className="text-lg font-semibold">Останні події</h2>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isDisabled={isClearingEvents}
                  onPress={() => void handleClearEvents()}
                  className={cn(
                    'transition-[width,padding,background-color,box-shadow,color] duration-300 ease-out',
                    clearEventsConfirm &&
                      'bg-danger/20 font-medium shadow-sm ring-1 ring-danger/30',
                  )}
                  startContent={
                    <DynamicIcon
                      name={isClearingEvents ? 'loader-2' : 'trash-2'}
                      className={isClearingEvents ? 'animate-spin' : ''}
                      size={16}
                    />
                  }
                >
                  {clearEventsConfirm ? 'Підтверджуєте очистку?' : 'Очистити історію'}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    setClearEventsConfirm(false);
                    void loadEvents();
                  }}
                >
                  Оновити
                </Button>
              </div>
            </CardHeader>
            <CardBody className="flex flex-col flex-1 min-h-0 max-h-full p-0">
              <div className="overflow-hidden relative h-full min-h-96">
                <div className="pointer-events-none absolute bottom-0 left-0 right-4 h-12 z-10 bg-white [mask-image:linear-gradient(to_top,black_20%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_top,black_20%,transparent_100%)]"/>
                
                <div className="absolute inset-0 overflow-y-auto p-4">
                  {events.length === 0 ? (
                    <p className="text-sm text-default-500">Подій ще немає. Запустіть симуляцію.</p>
                  ) : (
                    <ul className="space-y-3">
                      {events.map((ev) => (
                        <li key={ev.id} className="text-sm border-b border-default-100 pb-2 last:border-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip size="sm" color={actionColor(ev.action)} variant="flat">
                              {ev.action}
                            </Chip>
                            {ev.dryRun && (
                              <Chip size="sm" variant="bordered">
                                dry_run
                              </Chip>
                            )}
                            <span className="text-xs text-default-400 font-mono">
                              {new Date(ev.at).toLocaleString('uk-UA')}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-default-700">
                              {ev.reason}
                              {ev.conversationId != null ? ` · conv #${ev.conversationId}` : ''}
                            </p>
                            {ev.reason === 'human_agent_active' && ev.conversationId != null && (
                              <Button
                                size="sm"
                                variant="flat"
                                color="warning"
                                className="h-7 min-w-0 px-2 text-xs"
                                isDisabled={unassigningConvId != null}
                                onPress={() => void handleUnassignConversation(ev.conversationId!)}
                                startContent={
                                  <DynamicIcon
                                    name={
                                      unassigningConvId === ev.conversationId
                                        ? 'loader-2'
                                        : 'user-round-x'
                                    }
                                    className={
                                      unassigningConvId === ev.conversationId ? 'animate-spin' : ''
                                    }
                                    size={14}
                                  />
                                }
                              >
                                Зняти assignee
                              </Button>
                            )}
                          </div>
                          {ev.contentPreview && (
                            <p className="text-xs text-default-500 mt-0.5">«{ev.contentPreview}»</p>
                          )}
                          {ev.details && (
                            <p className="text-xs text-default-400 mt-0.5 font-mono break-words">
                              {formatEventLogDetails(ev.details)}
                            </p>
                          )}
                          {ev.headersMeta && (
                            <p className="text-xs text-default-400 mt-0.5 font-mono">
                              {[
                                ev.headersMeta.detectedScheme,
                                ev.webhookEvent,
                                ev.source === 'webhook' ? 'webhook' : 'simulate',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {ev.payloadJson != null && (
                            <div className="mt-1">
                              <Button
                                size="sm"
                                variant="flat"
                                className="h-7 min-w-0 pl-2 pr-3 text-xs text-default-500 gap-1"
                                onPress={() => togglePayloadExpanded(ev.id)}
                                disableRipple
                                startContent={
                                  <DynamicIcon
                                    name="chevron-right"
                                    className={expandedPayloadIds.has(ev.id) ? 'rotate-90 duration-200' : 'duration-200'}
                                    size={14}
                                  />
                                }
                              >
                                {expandedPayloadIds.has(ev.id) ? 'Сховати payload' : 'Показати повний payload'}
                              </Button>
                              {expandedPayloadIds.has(ev.id) && (
                                <pre className="text-xs text-default-500 mt-1 p-2 bg-default-100 rounded-medium overflow-x-auto h-60 resize-y">
                                  {JSON.stringify(ev.payloadJson, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <Divider className="shrink-0" />
              <p className="text-xs text-default-400 shrink-0 p-4">
                Зберігається в БД (TTL і ліміт записів – у блоці «Журнал webhook»). Показує схему auth у
                заголовках без значень secret/signature.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsChatwootBot;
