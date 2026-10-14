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
  type ChatwootBotReplyMode,
  type ChatwootBotSettingsResponse,
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
  echoMessage: string;
  handoverKeywordsText: string;
  replyMode: ChatwootBotReplyMode;
  outgoingUrlHint: string;
  eventLogRetentionDays: number;
  eventLogMaxRecords: number;
  eventLogStoreFullPayload: boolean;
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
    echoMessage: data.echoMessage,
    handoverKeywordsText: keywordsToText(data.handoverKeywords),
    replyMode: data.replyMode,
    outgoingUrlHint: data.outgoingUrlHint || DEFAULT_CHATWOOT_BOT_SETTINGS.outgoingUrlHint,
    eventLogRetentionDays: data.eventLogRetentionDays,
    eventLogMaxRecords: data.eventLogMaxRecords,
    eventLogStoreFullPayload: data.eventLogStoreFullPayload,
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
    'group relative inline-flex max-w-none w-full min-w-[min(100%,280px)] flex-1 flex-row items-center',
    'justify-start gap-4 m-0 p-4 cursor-pointer select-none tap-highlight-transparent',
    'border-2 border-default rounded-large',
    'hover:opacity-70 active:opacity-50',
    'data-[selected=true]:border-primary',
  ),
  wrapper: cn(
    'shrink-0',
    'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
    'group-data-[focus-visible=true]:outline-none',
  ),
  labelWrapper: 'flex flex-col gap-0.5 flex-1 min-w-0 ms-0 ml-0',
  label: 'font-medium text-foreground',
  description: 'text-small text-foreground-500',
};

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
  const [isSimulating, setIsSimulating] = useState<'echo' | 'handover' | null>(null);
  const [events, setEvents] = useState<ChatwootBotEventRecord[]>([]);
  const [agents, setAgents] = useState<ChatwootBotAgentSummary[]>([]);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [isClearingWebhookSecret, setIsClearingWebhookSecret] = useState(false);
  const [isClearingEvents, setIsClearingEvents] = useState(false);
  const [inboxTokenVisible, setInboxTokenVisible] = useState(false);
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Set<string>>(new Set());

  const togglePayloadExpanded = (eventId: string) => {
    setExpandedPayloadIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

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
      await loadEvents();
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
  }, [loadEvents]);

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
        echoMessage: form.echoMessage,
        handoverKeywords: textToKeywords(form.handoverKeywordsText),
        replyMode: form.replyMode,
        outgoingUrlHint: form.outgoingUrlHint,
        eventLogRetentionDays: Number(form.eventLogRetentionDays),
        eventLogMaxRecords: Number(form.eventLogMaxRecords),
        eventLogStoreFullPayload: form.eventLogStoreFullPayload,
        handoverAssigneeId: form.handoverAssigneeId,
        handoverDefaultInboxId: form.handoverDefaultInboxId,
        inboxApiAccessToken: form.inboxApiAccessToken || undefined,
        handoverMessageInHours: form.handoverMessageInHours,
        handoverMessageOutOfHours: form.handoverMessageOutOfHours,
        handoverCallbackAckMessage: form.handoverCallbackAckMessage,
        handoverEmergencyEnabled: form.handoverEmergencyEnabled,
        handoverEmergencyKeywords: textToKeywords(form.handoverEmergencyKeywordsText),
        handoverMessageEmergency: form.handoverMessageEmergency,
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
    if (!window.confirm('Очистити всю історію webhook-подій у БД?')) return;
    setIsClearingEvents(true);
    try {
      const deleted = await chatwootBotApi.clearRecentEvents();
      setEvents([]);
      ToastService.show({
        title: 'Історію очищено',
        description: `Видалено записів: ${deleted}`,
        color: 'success',
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося очистити',
        color: 'danger',
      });
    } finally {
      setIsClearingEvents(false);
    }
  };

  const handleSimulate = async (fixture: 'echo' | 'handover') => {
    setIsSimulating(fixture);
    try {
      const result = await chatwootBotApi.simulate({ fixture });
      ToastService.show({
        title: `Симуляція: ${result.action}`,
        description: `${result.reason}${result.dryRun ? ' (dry_run)' : ''}`,
        color: result.success ? 'success' : 'danger',
      });
      await loadEvents();
    } catch (error) {
      ToastService.show({
        title: 'Помилка симуляції',
        description: error instanceof Error ? error.message : 'Simulate failed',
        color: 'danger',
      });
    } finally {
      setIsSimulating(null);
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
        Echo + handover з робочими годинами, OOH і екстреним викликом. LLM (Jev) — наступна фаза.
      </p>

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
                  <p className="text-xs text-default-500">Якщо вимкнено — webhook ігнорує повідомлення</p>
                </div>
              </div>

              <Input
                label="Base URL Chatwoot"
                placeholder="https://chat.example.com"
                value={form.baseUrl}
                onValueChange={(v) => updateField('baseUrl', v)}
              />

              <Input
                type="number"
                label="Account ID"
                value={String(form.accountId)}
                onValueChange={(v) => updateField('accountId', Number(v) || 1)}
              />

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
                description="Токен Agent Bot — для echo/handover і POST assignments (assign конкретного агента через API, не плутати з UI «політики призначення» Business plan)."
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
                description="Для списку агентів і робочих годин inbox (GET /agents, GET /inboxes). Agent Bot token сюди не підходить."
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

              <Input
                label="Webhook Secret"
                type={secretVisible ? 'text' : 'password'}
                placeholder={
                  form.hasWebhookSecret
                    ? `Збережено: ${form.webhookSecretMasked}`
                    : 'Порожньо — без plain header (рекомендовано до HMAC)'
                }
                value={form.webhookSecret}
                onValueChange={(v) => updateField('webhookSecret', v)}
                description="Новий secret — введіть і «Зберегти». Порожнє поле не змінює збережене; іконка справа очищає його."
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

              <Input
                label="Outgoing URL hint"
                value={form.outgoingUrlHint}
                onValueChange={(v) => updateField('outgoingUrlHint', v)}
                description="Підказка для Agent Bot у Chatwoot (не викликається кодом)"
              />

              <RadioGroup
                label="Режим відповіді"
                orientation="horizontal"
                value={form.replyMode}
                onValueChange={(v) => updateField('replyMode', v as ChatwootBotReplyMode)}
                classNames={{
                  wrapper: 'flex flex-row flex-wrap gap-3 w-full data-[orientation=horizontal]:flex-row',
                }}
              >
                <ReplyModeRadio value="dry_run" description="Лише лог, без відправки в Chatwoot">
                  dry_run
                </ReplyModeRadio>
                <ReplyModeRadio value="live" description="POST у Chatwoot API">
                  live
                </ReplyModeRadio>
              </RadioGroup>
            </CardBody>
            <CardFooter className="gap-2 flex-wrap p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
              <Button
                variant="bordered"
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
              <h2 className="text-lg font-semibold">Поведінка v0</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <Textarea
                label="Echo-повідомлення"
                minRows={3}
                value={form.echoMessage}
                onValueChange={(v) => updateField('echoMessage', v)}
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
            </CardBody>
            <CardFooter className="gap-2 flex-wrap items-center p-4">
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Зберегти
              </Button>
              <Button
                variant="flat"
                color="success"
                isDisabled={isSimulating !== null}
                onPress={() => void handleSimulate('echo')}
                startContent={
                  <DynamicIcon
                    name={isSimulating === 'echo' ? 'loader-2' : 'play'}
                    className={isSimulating === 'echo' ? 'animate-spin' : ''}
                    size={16}
                  />
                }
              >
                Симулювати echo
              </Button>
              <Button
                variant="flat"
                color="warning"
                isDisabled={isSimulating !== null}
                onPress={() => void handleSimulate('handover')}
                startContent={
                  <DynamicIcon
                    name={isSimulating === 'handover' ? 'loader-2' : 'user-round'}
                    className={isSimulating === 'handover' ? 'animate-spin' : ''}
                    size={16}
                  />
                }
              >
                Симулювати handover
              </Button>
              <p className="text-xs text-default-400 w-full">
                Для симуляції увімкніть бота й збережіть. Режим dry_run лише логує (без POST у Chatwoot).
              </p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="headset" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Handover і робочі години</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <Select
                label="Агент для виклику (робочі години / екстрений)"
                placeholder="Оберіть агента або введіть ID нижче"
                selectedKeys={
                  form.handoverAssigneeId != null ? [String(form.handoverAssigneeId)] : []
                }
                onSelectionChange={(keys) => {
                  const key = Array.from(keys)[0];
                  updateField('handoverAssigneeId', key ? Number(key) : null);
                }}
                description="ID користувача-агента в Chatwoot (не Agent Bot). Список — через User PAT у полі «Inbox API token»."
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
                value={form.handoverAssigneeId != null ? String(form.handoverAssigneeId) : ''}
                onValueChange={(v) =>
                  updateField('handoverAssigneeId', v.trim() ? Number(v) || null : null)
                }
              />
              <Input
                type="number"
                label="Inbox ID (fallback / симуляція)"
                description="Робочі години беруться з Chatwoot → Inbox → Робочий час. У webhook використовується inbox_id з conversation; це поле — якщо його немає."
                value={form.handoverDefaultInboxId != null ? String(form.handoverDefaultInboxId) : ''}
                onValueChange={(v) =>
                  updateField('handoverDefaultInboxId', v.trim() ? Number(v) || null : null)
                }
              />
              <Textarea
                label="Повідомлення клієнту (робочі години, виклик оператора)"
                minRows={2}
                value={form.handoverMessageInHours}
                onValueChange={(v) => updateField('handoverMessageInHours', v)}
              />
              <Textarea
                label="Повідомлення клієнту (поза годинами — бот лишається)"
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
                  <p className="text-xs text-default-500">Keywords зараз; пізніше — класифікація Jev</p>
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
                  variant="flat"
                  color="danger"
                  isDisabled={isClearingEvents}
                  onPress={() => void handleClearEvents()}
                  startContent={
                    <DynamicIcon
                      name={isClearingEvents ? 'loader-2' : 'trash-2'}
                      className={isClearingEvents ? 'animate-spin' : ''}
                      size={16}
                    />
                  }
                >
                  Очистити історію
                </Button>
                <Button size="sm" variant="flat" onPress={() => void loadEvents()}>
                  Оновити
                </Button>
              </div>
            </CardHeader>
            <CardBody className="flex flex-col flex-1 min-h-0 max-h-full p-0">
              <div className="overflow-hidden relative h-full">
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
                          <p className="mt-1 text-default-700">
                            {ev.reason}
                            {ev.conversationId != null ? ` · conv #${ev.conversationId}` : ''}
                          </p>
                          {ev.contentPreview && (
                            <p className="text-xs text-default-500 mt-0.5">«{ev.contentPreview}»</p>
                          )}
                          {ev.details && (
                            <p className="text-xs text-default-400 mt-0.5 font-mono">{ev.details}</p>
                          )}
                          {ev.headersMeta && (
                            <p className="text-xs text-default-400 mt-0.5 font-mono">
                              auth: {ev.headersMeta.detectedScheme}
                              {ev.webhookEvent ? ` · event: ${ev.webhookEvent}` : ''}
                              {ev.source === 'webhook' ? ' · webhook' : ' · simulate'}
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
                Зберігається в БД (TTL і ліміт записів — у блоці «Журнал webhook»). Показує схему auth у
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
