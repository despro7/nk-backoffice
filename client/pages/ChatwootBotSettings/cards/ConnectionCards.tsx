import React, { useState } from 'react';
import { Button, Input, RadioGroup, Switch, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import type { ChatwootBotReplyMode } from '@shared/types/chatwootBot';
import { ReplyModeRadio } from '../components/FormSwitchField';
import { DevWebhookSwitch } from '../components/DevWebhookSwitch';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';

function VisibilityToggle({ visible, onToggle, label }: { visible: boolean; onToggle: () => void; label: string }) {
  return (
    <Tooltip content={visible ? 'Приховати' : 'Показати'} placement="top">
      <Button size="sm" variant="light" isIconOnly aria-label={`${visible ? 'Приховати' : 'Показати'} ${label}`} onPress={onToggle}>
        <DynamicIcon name={visible ? 'eye-off' : 'eye'} size={16} />
      </Button>
    </Tooltip>
  );
}

/** Увімкнення, режим live / dry_run, dev-webhook і перевірка зʼєднання. */
export function BotStatusCard({ page }: SettingsCardProps) {
  const { form, updateField, isTesting, handleTest, loadWebhookProcessorHealth } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="power" title="Стан бота">
      <div className="flex items-center gap-3">
        <Switch size="sm" isSelected={form.enabled} onValueChange={(v) => updateField('enabled', v)} />
        <div>
          <p className="text-sm font-medium">Бот увімкнено</p>
          <p className="text-xs text-default-500">
            Вимкнено – у журналі <span className="font-mono">bot_disabled</span>, без echo/handover
          </p>
        </div>
      </div>
      <RadioGroup
        label="Режим відповіді"
        size="sm"
        orientation="horizontal"
        value={form.replyMode}
        onValueChange={(v) => updateField('replyMode', v as ChatwootBotReplyMode)}
        classNames={{ base: 'gap-2', wrapper: 'flex flex-row flex-wrap gap-2 w-full' }}
      >
        <ReplyModeRadio value="dry_run" description="Лише журнал">
          dry_run
        </ReplyModeRadio>
        <ReplyModeRadio value="live" description="POST у Chatwoot">
          live
        </ReplyModeRadio>
      </RadioGroup>
      <DevWebhookSwitch onChanged={() => void loadWebhookProcessorHealth()} />
      <Button
        variant="flat"
        color="warning"
        className="self-start"
        isDisabled={isTesting}
        onPress={() => void handleTest()}
        startContent={
          <DynamicIcon name={isTesting ? 'loader-2' : 'plug'} className={isTesting ? 'animate-spin' : ''} size={16} />
        }
      >
        Перевірити зʼєднання
      </Button>
    </SettingsCard>
  );
}

/** Адреса, акаунт, токени, Webhook Secret і Outgoing URL. */
export function ChatwootConnectionCard({ page }: SettingsCardProps) {
  const {
    form,
    updateField,
    tokenVisible,
    setTokenVisible,
    secretVisible,
    setSecretVisible,
    isClearingWebhookSecret,
    handleClearWebhookSecret,
    inboxTokenVisible,
    setInboxTokenVisible,
    isProbingWebhook,
    setIsProbingWebhook,
    loadEvents,
  } = page;
  if (!form) return null;

  const probe = async () => {
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
  };

  return (
    <SettingsCard icon="bot" title="Chatwoot">
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
      <Input
        label="API Access Token"
        type={tokenVisible ? 'text' : 'password'}
        placeholder={form.hasApiAccessToken ? `Збережено: ${form.apiAccessTokenMasked}` : 'Вставте api_access_token'}
        value={form.apiAccessToken}
        onValueChange={(v) => updateField('apiAccessToken', v)}
        description="Токен Agent Bot – для echo/handover і POST assignments (assign конкретного агента через API, не плутати з UI «політики призначення» Business plan)."
        endContent={
          form.apiAccessToken.trim() ? (
            <VisibilityToggle visible={tokenVisible} onToggle={() => setTokenVisible((v) => !v)} label="token" />
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
        description="Handover: спочатку Agent Bot token (bot_handoff + assign). PAT – fallback для assign на старих Chatwoot, список агентів, години inbox і профіль контакту."
        endContent={
          form.inboxApiAccessToken.trim() ? (
            <VisibilityToggle
              visible={inboxTokenVisible}
              onToggle={() => setInboxTokenVisible((v) => !v)}
              label="inbox token"
            />
          ) : null
        }
      />
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
                isDisabled={isClearingWebhookSecret}
                onPress={() => void handleClearWebhookSecret()}
              >
                <DynamicIcon
                  name={isClearingWebhookSecret ? 'loader-2' : 'trash-2'}
                  size={16}
                  className={isClearingWebhookSecret ? 'animate-spin' : 'text-danger'}
                />
              </Button>
            </Tooltip>
          ) : form.webhookSecret.trim() ? (
            <VisibilityToggle visible={secretVisible} onToggle={() => setSecretVisible((v) => !v)} label="secret" />
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
            isDisabled={!form.outgoingUrlHint.trim() || isProbingWebhook}
            onPress={() => void probe()}
            startContent={
              <DynamicIcon
                name={isProbingWebhook ? 'loader-2' : 'radar'}
                size={16}
                className={isProbingWebhook ? 'animate-spin' : ''}
              />
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
    </SettingsCard>
  );
}

/** Окремий Telegram-бот для сповіщень операторів (дзвінки поза годинами, скасування). */
export function TelegramNotifyCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  const [tokenVisible, setTokenVisible] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  if (!form) return null;

  const test = async () => {
    setIsTesting(true);
    try {
      await chatwootBotApi.testTelegram(form.telegramNotifyBotToken || undefined, form.telegramNotifyChatId || undefined);
      ToastService.show({ title: 'Telegram', description: 'Тестове повідомлення надіслано', color: 'success' });
    } catch (e) {
      ToastService.show({
        title: 'Telegram',
        description: e instanceof Error ? e.message : 'Не вдалося надіслати',
        color: 'danger',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SettingsCard icon="send" title="Telegram для сповіщень">
      <p className="text-xs text-default-500">
        Куди бот пише операторам: запити на дзвінок поза робочими годинами і запити на скасування. Що саме слати –
        вкладки «Оператор» і «Замовлення й клієнти».
      </p>
      <Input
        label="Токен Telegram-бота"
        type={tokenVisible ? 'text' : 'password'}
        isDisabled={form.clearTelegramNotifyBotToken}
        placeholder={
          form.hasTelegramNotifyBotToken ? `Збережено: ${form.telegramNotifyBotTokenMasked}` : '123456789:AA… від @BotFather'
        }
        value={form.telegramNotifyBotToken}
        onValueChange={(v) => updateField('telegramNotifyBotToken', v)}
        endContent={
          <div className="flex items-center">
            {form.telegramNotifyBotToken.trim() ? (
              <VisibilityToggle visible={tokenVisible} onToggle={() => setTokenVisible((v) => !v)} label="токен" />
            ) : null}
            {form.hasTelegramNotifyBotToken ? (
              <Tooltip
                content={form.clearTelegramNotifyBotToken ? 'Не очищати' : 'Очистити при збереженні'}
                placement="top"
              >
                <Button
                  size="sm"
                  variant="light"
                  isIconOnly
                  aria-label="Очистити токен Telegram"
                  color={form.clearTelegramNotifyBotToken ? 'danger' : 'default'}
                  onPress={() => updateField('clearTelegramNotifyBotToken', !form.clearTelegramNotifyBotToken)}
                >
                  <DynamicIcon name="trash-2" size={16} />
                </Button>
              </Tooltip>
            ) : null}
          </div>
        }
      />
      <div className="flex gap-3 items-start">
        <Input
          label="Chat ID"
          placeholder="-100… для групи"
          description="Додайте бота в групу операторів; chat id групи – через @getidsbot або getUpdates."
          value={form.telegramNotifyChatId}
          onValueChange={(v) => updateField('telegramNotifyChatId', v)}
        />
        <Button
          size="lg"
          variant="flat"
          className="h-14 shrink-0"
          isDisabled={isTesting}
          startContent={
            <DynamicIcon name={isTesting ? 'loader-2' : 'send'} size={16} className={isTesting ? 'animate-spin' : ''} />
          }
          onPress={() => void test()}
        >
          Тест
        </Button>
      </div>
    </SettingsCard>
  );
}
