import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { LlmModelAutocomplete } from '@/components/llm/LlmModelAutocomplete';
import { LlmModelPricingHint } from '@/components/llm/LlmModelPricingHint';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  llmSettingsApi,
  toLlmFormState,
  type LlmSettingsFormState,
} from '@/services/LlmSettingsService';
import type { LlmModelPriceHighlightSettings, LlmProvider, LlmTestModelResponse } from '@shared/types/llm';
import { formatLlmTestOutput } from '@shared/utils/llmTestOutputFormat';

type ProviderKey = LlmProvider;

type ProviderCardConfig = {
  provider: ProviderKey;
  title: string;
  modelField: 'openaiDefaultModel' | 'googleDefaultModel' | 'openrouterDefaultModel';
  apiKeyField: 'openaiApiKey' | 'googleApiKey' | 'openrouterApiKey';
  hasKeyField: 'hasOpenaiApiKey' | 'hasGoogleApiKey' | 'hasOpenrouterApiKey';
  maskedField: 'openaiApiKeyMasked' | 'googleApiKeyMasked' | 'openrouterApiKeyMasked';
  placeholder: string;
};

const PROVIDER_CARDS: ProviderCardConfig[] = [
  {
    provider: 'openai',
    title: 'OpenAI',
    modelField: 'openaiDefaultModel',
    apiKeyField: 'openaiApiKey',
    hasKeyField: 'hasOpenaiApiKey',
    maskedField: 'openaiApiKeyMasked',
    placeholder: 'gpt-4.1-mini',
  },
  {
    provider: 'google',
    title: 'Google Gemini',
    modelField: 'googleDefaultModel',
    apiKeyField: 'googleApiKey',
    hasKeyField: 'hasGoogleApiKey',
    maskedField: 'googleApiKeyMasked',
    placeholder: 'gemini-3.5-flash',
  },
  {
    provider: 'openrouter',
    title: 'OpenRouter',
    modelField: 'openrouterDefaultModel',
    apiKeyField: 'openrouterApiKey',
    hasKeyField: 'hasOpenrouterApiKey',
    maskedField: 'openrouterApiKeyMasked',
    placeholder: 'openai/gpt-6-luna-pro',
  },
];

const DEFAULT_PLATFORM_TEST_MESSAGE =
  'Скільки буде 17 + 25? Відповідай лише числом без пояснень. Очікувана відповідь: 42.';
const DEFAULT_PLATFORM_TEST_SYSTEM =
  'Ти коректний асистент. Відповідай українською, коротко і по суті запиту.';

const LLM_MODEL_PRICING_PLACEHOLDER = 'N/A in · N/A out';

function formatLlmTestBlock(result: LlmTestModelResponse): string {
  const { reply, ...meta } = result;
  return formatLlmTestOutput(meta, reply);
}

function LlmProviderCard({
  config,
  form,
  modelPriceHighlight,
  isSaving,
  keyVisible,
  onToggleKeyVisible,
  onRevealKey,
  onClearKey,
  onUpdateField,
}: {
  config: ProviderCardConfig;
  form: LlmSettingsFormState;
  modelPriceHighlight: LlmModelPriceHighlightSettings;
  isSaving: boolean;
  keyVisible: boolean;
  onToggleKeyVisible: () => void;
  onRevealKey: () => void;
  onClearKey: () => void;
  onUpdateField: <K extends keyof LlmSettingsFormState>(key: K, value: LlmSettingsFormState[K]) => void;
}) {
  const [modelTesting, setModelTesting] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [modelTestFailed, setModelTestFailed] = useState(false);

  const hasStoredKey = form[config.hasKeyField];
  const draftKey = form[config.apiKeyField];
  const selectedModel = form[config.modelField];

  const testSelectedModel = useCallback(async () => {
    if (!draftKey.trim() && !hasStoredKey) {
      setModelTestResult('Спочатку вкажіть або збережіть API key');
      return;
    }
    const model = selectedModel.trim();
    if (!model) {
      setModelTestResult('Оберіть або введіть id моделі');
      return;
    }
    setModelTesting(true);
    setModelTestResult(null);
    setModelTestFailed(false);
    try {
      const result = await llmSettingsApi.testModel(
        config.provider,
        model,
        draftKey.trim() || undefined,
      );
      setModelTestResult(formatLlmTestBlock(result));
      setModelTestFailed(false);
      ToastService.show({
        title: 'Модель OK',
        description: result.reply,
        color: 'success',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Тест не вдався';
      setModelTestResult(msg);
      setModelTestFailed(true);
      ToastService.show({ title: 'Тест моделі', description: msg, color: 'danger' });
    } finally {
      setModelTesting(false);
    }
  }, [config.provider, draftKey, hasStoredKey, selectedModel]);

  return (
    <Card>
      <CardHeader className="px-4 border-b border-default-200">
        <h2 className="text-lg font-semibold">{config.title}</h2>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        <Input
          label="API key"
          type={keyVisible ? 'text' : 'password'}
          placeholder={hasStoredKey ? form[config.maskedField] : 'Не налаштовано'}
          value={draftKey}
          onValueChange={(v) => onUpdateField(config.apiKeyField, v)}
          description="Порожнє при збереженні не змінює збережений ключ"
          endContent={
            <div className="flex gap-0.5">
              {hasStoredKey || draftKey.trim() ? (
                <Tooltip content={keyVisible ? 'Приховати' : 'Показати'} placement="top">
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    aria-label={keyVisible ? 'Приховати API key' : 'Показати API key'}
                    onPress={() => {
                      if (keyVisible) {
                        onToggleKeyVisible();
                        return;
                      }
                      if (draftKey.trim()) {
                        onToggleKeyVisible();
                        return;
                      }
                      onRevealKey();
                    }}
                  >
                    <DynamicIcon name={keyVisible ? 'eye-off' : 'eye'} size={16} />
                  </Button>
                </Tooltip>
              ) : null}
              {hasStoredKey ? (
                <Tooltip content="Очистити збережений ключ" placement="top">
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    color="danger"
                    aria-label="Очистити збережений API key"
                    isDisabled={isSaving}
                    onPress={onClearKey}
                  >
                    <DynamicIcon name="trash-2" size={16} className="text-danger" />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start gap-2">
            <LlmModelAutocomplete
              provider={config.provider}
              value={selectedModel}
              onChange={(id) => onUpdateField(config.modelField, id)}
              label="Модель за замовчуванням"
              placeholder={config.placeholder}
              modelPriceHighlight={modelPriceHighlight}
              hasStoredApiKey={hasStoredKey}
              draftApiKey={draftKey}
              showReloadButton
            />
            <Button
              size="md"
              variant="bordered"
              color="primary"
              isLoading={modelTesting}
              isDisabled={!hasStoredKey && !draftKey.trim() || !selectedModel.trim()}
              onPress={() => void testSelectedModel()}
              startContent={!modelTesting ? <DynamicIcon name="sparkles" size={16} /> : undefined}
              className="shrink-0 h-14"
            >
              Тест моделі
            </Button>
          </div>
          {modelTestResult ? (
            <pre
              className={`text-xs rounded-md p-2 overflow-auto max-h-full whitespace-pre-wrap ${
                modelTestFailed ? 'bg-danger-50 text-danger' : 'bg-default-100 text-default-800'
              }`}
            >
              {modelTestResult}
            </pre>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

const SettingsLlm: React.FC = () => {
  const { hasPermission } = useRoleAccess();
  const [form, setForm] = useState<LlmSettingsFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [openaiVisible, setOpenaiVisible] = useState(false);
  const [googleVisible, setGoogleVisible] = useState(false);
  const [openrouterVisible, setOpenrouterVisible] = useState(false);
  const [platformTestMessage, setPlatformTestMessage] = useState(DEFAULT_PLATFORM_TEST_MESSAGE);
  const [platformTestSystem, setPlatformTestSystem] = useState(DEFAULT_PLATFORM_TEST_SYSTEM);
  const [platformTesting, setPlatformTesting] = useState(false);
  const [platformTestResult, setPlatformTestResult] = useState<string | null>(null);
  const [platformTestFailed, setPlatformTestFailed] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await llmSettingsApi.getSettings(false);
      setForm(toLlmFormState(data));
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося завантажити LLM',
        color: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  if (!hasPermission(PERMISSIONS.PAGE_SETTINGS_ADMIN)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">Потрібні адмінські права.</p>
        </div>
      </div>
    );
  }

  const updateField = <K extends keyof LlmSettingsFormState>(key: K, value: LlmSettingsFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const revealKey = async (provider: ProviderKey) => {
    try {
      const data = await llmSettingsApi.getSettings(true);
      if (provider === 'openai') {
        updateField('openaiApiKey', data.openaiApiKey);
        setOpenaiVisible(true);
      } else if (provider === 'google') {
        updateField('googleApiKey', data.googleApiKey);
        setGoogleVisible(true);
      } else {
        updateField('openrouterApiKey', data.openrouterApiKey);
        setOpenrouterVisible(true);
      }
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося показати ключ',
        color: 'danger',
      });
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    try {
      const saved = await llmSettingsApi.updateSettings({
        defaultProvider: form.defaultProvider,
        openaiDefaultModel: form.openaiDefaultModel,
        googleDefaultModel: form.googleDefaultModel,
        openrouterDefaultModel: form.openrouterDefaultModel,
        maxOutputTokens: form.maxOutputTokens,
        openaiApiKey: form.openaiApiKey || undefined,
        googleApiKey: form.googleApiKey || undefined,
        openrouterApiKey: form.openrouterApiKey || undefined,
        modelPriceHighlight: form.modelPriceHighlight,
      });
      setForm(toLlmFormState(saved));
      setOpenaiVisible(false);
      setGoogleVisible(false);
      setOpenrouterVisible(false);
      ToastService.show({
        title: 'Збережено',
        description: 'Налаштування LLM оновлено',
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

  const clearKey = async (provider: ProviderKey) => {
    setIsSaving(true);
    try {
      const saved = await llmSettingsApi.updateSettings(
        provider === 'openai'
          ? { clearOpenaiApiKey: true }
          : provider === 'google'
            ? { clearGoogleApiKey: true }
            : { clearOpenrouterApiKey: true },
      );
      setForm(toLlmFormState(saved));
      if (provider === 'openai') setOpenaiVisible(false);
      else if (provider === 'google') setGoogleVisible(false);
      else setOpenrouterVisible(false);
      ToastService.show({ title: 'Ключ очищено', color: 'success' });
    } catch (error) {
      ToastService.show({
        title: 'Помилка',
        description: error instanceof Error ? error.message : 'Не вдалося очистити',
        color: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !form) {
    return (
      <div className="flex justify-center py-16 text-default-500">
        <DynamicIcon name="loader-2" className="animate-spin" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-default-500 mt-1">
          Ключі та моделі для Chatwoot Bot, HR та інших модулів. Fallback: env{' '}
          <code className="text-xs">LLM_OPENAI_API_KEY</code>,{' '}
          <code className="text-xs">LLM_GOOGLE_API_KEY</code>,{' '}
          <code className="text-xs">LLM_OPENROUTER_API_KEY</code>,{' '}
          <code className="text-xs">LLM_OPENROUTER_BASE_URL</code> (опц., EU:{' '}
          <code className="text-xs">https://eu.openrouter.ai/api/v1</code>),{' '}
          <code className="text-xs">LLM_DEFAULT_PROVIDER</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
        {PROVIDER_CARDS.map((config) => (
          <LlmProviderCard
            key={config.provider}
            config={config}
            form={form}
            isSaving={isSaving}
            keyVisible={
              config.provider === 'openai'
                ? openaiVisible
                : config.provider === 'google'
                  ? googleVisible
                  : openrouterVisible
            }
            onToggleKeyVisible={() => {
              if (config.provider === 'openai') {
                setOpenaiVisible((v) => !v);
              } else if (config.provider === 'google') {
                setGoogleVisible((v) => !v);
              } else {
                setOpenrouterVisible((v) => !v);
              }
            }}
            onRevealKey={() => void revealKey(config.provider)}
            onClearKey={() => void clearKey(config.provider)}
            onUpdateField={updateField}
            modelPriceHighlight={form.modelPriceHighlight}
          />
        ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="palette" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Кольори цін у списках моделей</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <Switch
                size="sm"
                isSelected={form.modelPriceHighlight.enabled}
                onValueChange={(enabled) =>
                  updateField('modelPriceHighlight', { ...form.modelPriceHighlight, enabled })
                }
              >
                Увімкнути кольорове виділення (in / out, USD / 1M)
              </Switch>
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  label="Зелений, до $"
                  isDisabled={!form.modelPriceHighlight.enabled}
                  value={String(form.modelPriceHighlight.greenMaxUsdPerM)}
                  onValueChange={(v) =>
                    updateField('modelPriceHighlight', {
                      ...form.modelPriceHighlight,
                      greenMaxUsdPerM: Number(v) || 0,
                    })
                  }
                  description="≤ порогу — зелений"
                />
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  label="Жовтий, до $"
                  isDisabled={!form.modelPriceHighlight.enabled}
                  value={String(form.modelPriceHighlight.yellowMaxUsdPerM)}
                  onValueChange={(v) =>
                    updateField('modelPriceHighlight', {
                      ...form.modelPriceHighlight,
                      yellowMaxUsdPerM: Number(v) || 0,
                    })
                  }
                  description="вище зеленого і ≤ порогу — жовтий; далі — червоний"
                />
              </div>
              <p className="text-xs text-default-500">
                Приклад:{' '}
                <LlmModelPricingHint
                  hint="$0.5/1M in · $8/1M out"
                  placeholder={LLM_MODEL_PRICING_PLACEHOLDER}
                  highlight={form.modelPriceHighlight}
                  className="inline"
                />
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
              <DynamicIcon name="sparkles" size={20} className="text-default-600" />
              <h2 className="text-lg font-semibold">Провайдер за замовчуванням</h2>
            </CardHeader>
            <CardBody className="gap-4 p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Select
                  className="sm:max-w-xs"
                  label="defaultProvider"
                  selectedKeys={[form.defaultProvider]}
                  onSelectionChange={(keys) => {
                    const key = Array.from(keys)[0];
                  if (key === 'openai' || key === 'google' || key === 'openrouter') {
                    updateField('defaultProvider', key as LlmProvider);
                  }
                }}
              >
                <SelectItem key="openai">OpenAI</SelectItem>
                <SelectItem key="google">Google Gemini</SelectItem>
                <SelectItem key="openrouter">OpenRouter</SelectItem>
              </Select>
                <Input
                  className="sm:max-w-xs"
                  type="number"
                  label="maxOutputTokens"
                  value={String(form.maxOutputTokens)}
                  onValueChange={(v) => updateField('maxOutputTokens', Number(v) || 1024)}
                />
              </div>

              <p className="text-xs text-default-500">
                Тест використовує збережені ключі та модель:{' '}
                <code className="text-xs">
                  {form.defaultProvider === 'google'
                    ? form.googleDefaultModel
                    : form.defaultProvider === 'openrouter'
                      ? form.openrouterDefaultModel
                      : form.openaiDefaultModel}
                </code>{' '}
                ({form.defaultProvider}). Збережіть налаштування перед тестом, якщо змінювали ключі.
              </p>

              <Textarea
                label="System (тест)"
                minRows={2}
                value={platformTestSystem}
                onValueChange={setPlatformTestSystem}
              />
              <Textarea
                label="Повідомлення (тест)"
                minRows={2}
                value={platformTestMessage}
                onValueChange={setPlatformTestMessage}
                description="Перевірте, що відповідь змістовна (наприклад, 42 для прикладу вище)."
              />
              <Button
                color="primary"
                variant="flat"
                isLoading={platformTesting}
                onPress={async () => {
                  setPlatformTesting(true);
                  setPlatformTestResult(null);
                  setPlatformTestFailed(false);
                  try {
                    const result = await llmSettingsApi.testDefaultPlatform({
                      message: platformTestMessage,
                      system: platformTestSystem,
                      maxOutputTokens: form.maxOutputTokens,
                      provider: form.defaultProvider,
                      model:
                        form.defaultProvider === 'google'
                          ? form.googleDefaultModel
                          : form.defaultProvider === 'openrouter'
                            ? form.openrouterDefaultModel
                            : form.openaiDefaultModel,
                    });
                    setPlatformTestResult(formatLlmTestBlock(result));
                    ToastService.show({
                      title: 'Тест AI',
                      description: result.reply.slice(0, 120),
                      color: 'success',
                    });
                  } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Тест не вдався';
                    setPlatformTestResult(msg);
                    setPlatformTestFailed(true);
                    ToastService.show({ title: 'Тест AI', description: msg, color: 'danger' });
                  } finally {
                    setPlatformTesting(false);
                  }
                }}
                startContent={
                  !platformTesting ? <DynamicIcon name="message-square" size={16} /> : undefined
                }
              >
                Тест AI (провайдер за замовчуванням)
              </Button>
              {platformTestResult ? (
                <pre
                  className={`text-xs rounded-lg p-3 overflow-auto max-h-full whitespace-pre-wrap font-mono ${
                    platformTestFailed ? 'bg-danger-50 text-danger' : 'bg-default-100 text-default-800'
                  }`}
                >
                  {platformTestResult}
                </pre>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
          Зберегти
        </Button>
      </div>
    </div>
  );
};

export default SettingsLlm;
