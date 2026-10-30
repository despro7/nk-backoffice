import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  RadioGroup,
  Switch,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import type { ChatwootBotReplyMode } from '@shared/types/chatwootBot';
import { ReplyModeRadio } from '../components/FormSwitchField';
import { DevWebhookSwitch } from '../components/DevWebhookSwitch';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

export function ConnectionTab({ page }: Props) {
  const {
    form,
    updateField,
    isSaving,
    handleSave,
    isTesting,
    handleTest,
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
    loadWebhookProcessorHealth,
  } = page;

  if (!form) return null;

  return (
    <Card>
      <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name="bot" size={20} className="text-default-600" />
        <h2 className="text-lg font-semibold">Підключення</h2>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Switch isSelected={form.enabled} onValueChange={(v) => updateField('enabled', v)} />
            <div>
              <p className="text-sm font-medium">Бот увімкнено</p>
              <p className="text-xs text-default-500">
                Вимкнено – у журналі <span className="font-mono">bot_disabled</span>, без echo/handover
              </p>
            </div>
          </div>
          <DevWebhookSwitch onChanged={() => void loadWebhookProcessorHealth()} />
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
  );
}
