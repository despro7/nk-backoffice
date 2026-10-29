import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  cn,
  DatePicker,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import { getLocalTimeZone, today } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { formatLlmTestOutput } from '@shared/utils/llmTestOutputFormat';
import { LlmModelAutocomplete } from '@/components/llm/LlmModelAutocomplete';
import type { LlmProvider } from '@shared/types/llm';
import type { FormState } from '../chatwootBotFormState';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';
import { ChatwootBotLlmToolsPanel } from '../components/ChatwootBotLlmToolsPanel';
import { FormSwitchField } from '../components/FormSwitchField';
import {
  dateValueToVerifyTestDate,
  defaultChatwootAiModelForProvider,
  defaultLlmPlatformSnapshot,
  llmDefaultModelForProvider,
  llmProviderHasApiKey,
  verifyTestDateToDateValue,
} from '../llmPlatformHelpers';

type Props = { page: ChatwootBotSettingsPageModel };

export function AiVerifyTab({ page }: Props) {
  const {
    form,
    updateField,
    isSaving,
    handleSave,
    llmPlatform,
    setForm,
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
  } = page;

  if (!form) return null;

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      <Card className="flex-1">
        <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
          <DynamicIcon name="bot" size={20} className="text-default-600" />
          <h2 className="text-lg font-semibold">AI і verify</h2>
        </CardHeader>
        <CardBody className="gap-4 p-4">
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
                const key = String(Array.from(keys)[0] ?? 'platform');
                const nextProvider: FormState['aiProvider'] =
                  key === 'openai' || key === 'google' || key === 'openrouter' ? key : '';
                const snapshot = llmPlatform ?? defaultLlmPlatformSnapshot();
                setForm((prev) =>
                  prev
                    ? {
                        ...prev,
                        aiProvider: nextProvider,
                        aiModel: defaultChatwootAiModelForProvider(snapshot, nextProvider),
                      }
                    : prev,
                );
              }}
            >
              <SelectItem key="platform">З платформи</SelectItem>
              <SelectItem key="openai">OpenAI</SelectItem>
              <SelectItem key="google">Google Gemini</SelectItem>
              <SelectItem key="openrouter">OpenRouter</SelectItem>
            </Select>
          </div>
          {(() => {
            const llmSnapshot = llmPlatform ?? defaultLlmPlatformSnapshot();
            const modelsProvider: LlmProvider = form.aiProvider || llmSnapshot.defaultProvider;
            return (
              <LlmModelAutocomplete
                provider={modelsProvider}
                value={form.aiModel}
                onChange={(v) => updateField('aiModel', v)}
                label="Модель (override, опційно)"
                placeholder={llmDefaultModelForProvider(llmSnapshot, modelsProvider)}
                modelPriceHighlight={llmSnapshot.modelPriceHighlight}
                hasStoredApiKey={llmProviderHasApiKey(llmSnapshot, modelsProvider)}
                showReloadButton
                descriptionWhenEmpty="Порожньо — модель платформи для обраного провайдера. Ключі API — Налаштування → LLM."
              />
            );
          })()}
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
        </CardBody>
        <CardFooter className="p-4">
          <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
            Зберегти
          </Button>
        </CardFooter>
      </Card>

      <div className="flex-1 space-y-4">
        <Card>
          <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
            <DynamicIcon name="flask-conical" size={20} className="text-default-600" />
            <h2 className="text-lg font-semibold">Тестування верифікації замовлень і AI відповідей</h2>
          </CardHeader>
          <CardBody className="gap-4 p-4">
            <p className="text-sm font-medium">Тести (без PII у відповіді)</p>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Input
                className="flex-1 min-w-[10rem]"
                label="Телефон"
                placeholder="Формат: 0991234567"
                value={verifyTestPhone}
                onValueChange={setVerifyTestPhone}
              />
              <Input
                className="flex-1 min-w-[8rem]"
                label="Номер замовлення"
                placeholder="Напр. 24155"
                value={verifyTestOrder}
                onValueChange={(v) => {
                  setVerifyTestOrder(v);
                  if (v.trim()) setVerifyTestDate('');
                }}
                isDisabled={Boolean(verifyTestDate.trim())}
                isClearable
              />
              <span className="text-sm text-default-500 shrink-0">або</span>
              <I18nProvider locale="uk-UA">
                <DatePicker
                  className="flex-1 min-w-[11rem]"
                  label="Дата останнього замовлення"
                  labelPlacement="inside"
                  granularity="day"
                  showMonthAndYearPickers
                  selectorButtonPlacement="start"
                  value={verifyTestDateToDateValue(verifyTestDate)}
                  maxValue={today(getLocalTimeZone())}
                  onChange={(date) => {
                    setVerifyTestDate(dateValueToVerifyTestDate(date));
                    if (date) setVerifyTestOrder('');
                  }}
                  endContent={
                    verifyTestDate.trim() ? (
                      <Tooltip content="Очистити дату" placement="top">
                        <Button
                          size="sm"
                          color="danger"
                          variant="light"
                          isIconOnly
                          aria-label="Очистити дату"
                          onPress={() => setVerifyTestDate('')}
                          className="shrink-0 h-6 w-6 min-w-0"
                        >
                          <DynamicIcon name="x" size={14} />
                        </Button>
                      </Tooltip>
                    ) : null
                  }
                  classNames={{
                    base: 'w-full',
                    segment: 'rounded',
                  }}
                />
              </I18nProvider>
            </div>
            
            <Button
              variant="flat"
              color="success"
              className="px-3 min-w-0 shrink-0 self-start"
              startContent={<DynamicIcon name={isVerifyTesting ? 'loader' : 'circle-dashed-check'} size={16} className={isVerifyTesting ? 'animate-spin' : ''} />}
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
            {verifyTestResult ? (
              <pre className="text-xs bg-default-100 p-2 rounded-lg overflow-auto max-h-40">
                {verifyTestResult}
              </pre>
            ) : null}

            <Divider />
            
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <Textarea
                label="Повідомлення для тесту AI"
                labelPlacement="outside"
                minRows={1}
                value={aiTestMessage}
                onValueChange={setAiTestMessage}
                classNames={{
                  label: 'font-semibold text-xs',
                  inputWrapper: 'data-[hover=true]:bg-default-100',
                  input: 'text-sm',
                }}
              />
              <Button
                variant="flat"
                color="primary"
                data-btn-tone="primary-blue-flat"
                startContent={<DynamicIcon name={isAiTesting ? 'loader' : 'bot'} size={16} className={isAiTesting ? 'animate-spin' : ''} />}
                className="px-3 min-w-0 shrink-0"
                onPress={async () => {
                  setIsAiTesting(true);
                  setAiTestReply('');
                  try {
                    const data = await chatwootBotApi.testAi(aiTestMessage, {
                      aiProvider: form.aiProvider,
                      aiModel: form.aiModel,
                      aiMaskId: form.aiMaskId,
                      aiMasks: form.aiMasks,
                    });
                    setAiTestReply(
                      data.meta
                        ? formatLlmTestOutput({ ...data.meta, usedFallback: data.usedFallback }, data.reply)
                        : data.reply,
                    );
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
            {aiTestReply ? (
              <Textarea
                label="Відповідь AI"
                minRows={3}
                maxRows={48}
                isReadOnly
                disableAutosize={false}
                value={aiTestReply}
                classNames={{
                  label: 'font-semibold',
                  inputWrapper: 'data-[hover=true]:bg-default-100',
                  input: 'text-xs font-mono max-h-120 resize-y',
                }}
              />
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
