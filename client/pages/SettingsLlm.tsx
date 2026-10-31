import React, { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Avatar,
  Button,
  Radio,
  RadioGroup,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Switch,
  Tab,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { LlmModelAutocomplete } from '@/components/llm/LlmModelAutocomplete';
import { LlmModelPricingHint } from '@/components/llm/LlmModelPricingHint';
import { LlmUsageCard } from '@/components/llm/LlmUsageCard';
import PageTabs from '@/components/PageTabs';
import { parseUrlHash, useUrlHashSync } from '@/hooks/useUrlHashSync';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import { llmSettingsApi, toLlmFormState, type LlmSettingsFormState } from '@/services/LlmSettingsService';
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
  logo: string;
};

const LLM_SETTINGS_TAB_LABELS = {
  providers: 'Провайдери',
  usage: 'Витрати і баланси',
} as const;

type LlmSettingsTabKey = keyof typeof LLM_SETTINGS_TAB_LABELS;

function parseLlmSettingsTabKey(raw: string | null): LlmSettingsTabKey {
  return raw === 'usage' ? 'usage' : 'providers';
}

const PROVIDER_CARDS: ProviderCardConfig[] = [
  {
    provider: 'openai',
    title: 'OpenAI',
    modelField: 'openaiDefaultModel',
    apiKeyField: 'openaiApiKey',
    hasKeyField: 'hasOpenaiApiKey',
    maskedField: 'openaiApiKeyMasked',
    placeholder: 'gpt-4.1-mini',
    logo: '/icons/llm/openai.svg',
  },
  {
    provider: 'google',
    title: 'Google Gemini',
    modelField: 'googleDefaultModel',
    apiKeyField: 'googleApiKey',
    hasKeyField: 'hasGoogleApiKey',
    maskedField: 'googleApiKeyMasked',
    placeholder: 'gemini-3.5-flash',
    logo: '/icons/llm/gemini.svg',
  },
  {
    provider: 'openrouter',
    title: 'OpenRouter',
    modelField: 'openrouterDefaultModel',
    apiKeyField: 'openrouterApiKey',
    hasKeyField: 'hasOpenrouterApiKey',
    maskedField: 'openrouterApiKeyMasked',
    placeholder: 'openai/gpt-6-luna-pro',
    logo: '/icons/llm/openrouter.png',
  },
];

const DEFAULT_PLATFORM_TEST_MESSAGE =
  'Скільки буде 17 + 25? Відповідай лише числом без пояснень. Очікувана відповідь: 42.';
const DEFAULT_PLATFORM_TEST_SYSTEM = 'Ти коректний асистент. Відповідай українською, коротко і по суті запиту.';

const LLM_MODEL_PRICING_PLACEHOLDER = 'N/A in · N/A out';

function formatLlmTestBlock(result: LlmTestModelResponse): string {
  const { reply, ...meta } = result;
  return formatLlmTestOutput(meta, reply);
}

/** Поля провайдера всередині AccordionItem спільної картки «Провайдери». */
function LlmProviderFields({
  config,
  form,
  modelPriceHighlight,
  isSaving,
  keyVisible,
  onToggleKeyVisible,
  onRevealKey,
  onClearKey,
  onUpdateField,
  extra,
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
  /** Додаткові поля провайдера внизу. */
  extra?: React.ReactNode;
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
      const result = await llmSettingsApi.testModel(config.provider, model, draftKey.trim() || undefined);
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
    <div className="flex flex-col gap-4 pb-2">
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
            isDisabled={(!hasStoredKey && !draftKey.trim()) || !selectedModel.trim()}
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
      {extra}
    </div>
  );
}

function providerSubtitle(config: ProviderCardConfig, form: LlmSettingsFormState): string {
  const model = form[config.modelField];
  if (!form[config.hasKeyField]) return `Ключ не налаштовано${model ? ` · ${model}` : ''}`;
  return `Ключ ${form[config.maskedField]}${model ? ` · ${model}` : ''}`;
}

function TypesafeJevCard({
  form,
  isSaving,
  keyVisible,
  onToggleKeyVisible,
  onRevealKey,
  onClearKey,
  onUpdateField,
}: {
  form: LlmSettingsFormState;
  isSaving: boolean;
  keyVisible: boolean;
  onToggleKeyVisible: () => void;
  onRevealKey: () => void;
  onClearKey: () => void;
  onUpdateField: <K extends keyof LlmSettingsFormState>(key: K, value: LlmSettingsFormState[K]) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testFailed, setTestFailed] = useState(false);
  const viaOpenRouter = form.typesafeSource === 'openrouter';
  const hasDirectKey = form.hasTypesafeApiKey || Boolean(form.typesafeApiKey.trim());
  const hasKey = viaOpenRouter ? form.hasOpenrouterApiKey : hasDirectKey;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestFailed(false);
    try {
      const r = await llmSettingsApi.testTypesafe(form.typesafeApiKey, form.typesafeModel, form.typesafeSource);
      const probabilities = Object.entries(r.probabilities)
        .sort((a, b) => b[1] - a[1])
        .map(([key, p]) => `  ${key}: ${p.toFixed(3)}`)
        .join('\n');
      setTestResult(
        `Питання: ${r.question}\nВідповідь: ${r.choice} (confidence ${r.confidence.toFixed(3)})\n` +
          `Ймовірності:\n${probabilities}\n` +
          `Модель: ${r.model} · ${r.latencyMs} мс · input ${r.inputTokens} / output ${r.outputTokens} tokens` +
          (r.costUsd != null ? ` · $${r.costUsd.toFixed(6)}` : '') +
          ` · ${r.source === 'openrouter' ? 'OpenRouter' : 'TypeSafe'}`,
      );
      ToastService.show({ title: 'Jev OK', description: `${r.choice} · ${r.confidence.toFixed(2)}`, color: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Тест не вдався';
      setTestResult(msg);
      setTestFailed(true);
      ToastService.show({ title: 'Тест Jev', description: msg, color: 'danger' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name="tags" size={20} className="text-default-600" />
        <h2 className="text-lg font-semibold">TypeSafe Jev</h2>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        <p className="text-xs text-default-500">
          Швидкий класифікатор (не чат-модель): розкладає питання клієнтів чат-бота по темах. Вмикається в налаштуваннях
          Chatwoot Bot → «Теми питань». Платні лише input tokens.
        </p>
        <RadioGroup
          label="Джерело"
          orientation="horizontal"
          size="sm"
          value={form.typesafeSource}
          onValueChange={(v) => onUpdateField('typesafeSource', v === 'typesafe' ? 'typesafe' : 'openrouter')}
        >
          <Radio value="openrouter">OpenRouter</Radio>
          <Radio value="typesafe">TypeSafe напряму</Radio>
        </RadioGroup>
        {viaOpenRouter ? (
          <p className="text-xs text-default-500">
            Ключ і кредити OpenRouter з картки «Провайдери»
            {form.hasOpenrouterApiKey ? '' : ' — ключ OpenRouter не налаштовано'}. Вартість кожного виклику OpenRouter
            повертає сам (<code className="text-xs">usage.cost</code>).
          </p>
        ) : (
          <Input
            label="API key"
            type={keyVisible ? 'text' : 'password'}
            placeholder={form.hasTypesafeApiKey ? form.typesafeApiKeyMasked : 'Не налаштовано'}
            value={form.typesafeApiKey}
            onValueChange={(v) => onUpdateField('typesafeApiKey', v)}
            description="Порожнє при збереженні не змінює збережений ключ"
            endContent={
              <div className="flex gap-0.5">
                {hasKey ? (
                  <Tooltip content={keyVisible ? 'Приховати' : 'Показати'} placement="top">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      aria-label={keyVisible ? 'Приховати API key' : 'Показати API key'}
                      onPress={() => {
                        if (keyVisible || form.typesafeApiKey.trim()) {
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
                {form.hasTypesafeApiKey ? (
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
        )}
        <div className="flex flex-wrap items-start gap-2">
          <Input
            className="flex-1 min-w-[12rem]"
            label="Модель"
            placeholder="jev-latest"
            value={form.typesafeModel}
            onValueChange={(v) => onUpdateField('typesafeModel', v)}
          />
          {!viaOpenRouter ? (
            <Input
              className="w-40"
              type="number"
              min={0}
              step={0.01}
              label="$ / 1M input"
              placeholder="0"
              value={form.typesafeInputPricePer1M ? String(form.typesafeInputPricePer1M) : ''}
              onValueChange={(v) => onUpdateField('typesafeInputPricePer1M', Math.max(0, Number(v) || 0))}
              description="Для звіту витрат"
            />
          ) : null}
          <Button
            size="md"
            variant="bordered"
            color="primary"
            isLoading={testing}
            isDisabled={!hasKey}
            onPress={() => void runTest()}
            startContent={!testing ? <DynamicIcon name="sparkles" size={16} /> : undefined}
            className="shrink-0 h-14"
          >
            Тест Jev
          </Button>
        </div>
        {testResult ? (
          <pre
            className={`text-xs rounded-md p-2 overflow-auto max-h-full whitespace-pre-wrap ${
              testFailed ? 'bg-danger-50 text-danger' : 'bg-default-100 text-default-800'
            }`}
          >
            {testResult}
          </pre>
        ) : null}
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
  const [typesafeVisible, setTypesafeVisible] = useState(false);
  const [platformTestMessage, setPlatformTestMessage] = useState(DEFAULT_PLATFORM_TEST_MESSAGE);
  const [platformTestSystem, setPlatformTestSystem] = useState(DEFAULT_PLATFORM_TEST_SYSTEM);
  const [platformTesting, setPlatformTesting] = useState(false);
  const [platformTestResult, setPlatformTestResult] = useState<string | null>(null);
  const [platformTestFailed, setPlatformTestFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<LlmSettingsTabKey>(() =>
    parseLlmSettingsTabKey(parseUrlHash(window.location.hash).get('tab')),
  );

  useUrlHashSync({ tab: activeTab === 'providers' ? null : activeTab }, (params) => {
    setActiveTab(parseLlmSettingsTabKey(params.get('tab')));
  });

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

  const revealKey = async (provider: ProviderKey | 'typesafe') => {
    try {
      const data = await llmSettingsApi.getSettings(true);
      if (provider === 'typesafe') {
        updateField('typesafeApiKey', data.typesafeApiKey);
        setTypesafeVisible(true);
      } else if (provider === 'openai') {
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
        typesafeApiKey: form.typesafeApiKey || undefined,
        typesafeModel: form.typesafeModel,
        typesafeSource: form.typesafeSource,
        typesafeInputPricePer1M: form.typesafeInputPricePer1M,
        openaiAdminKey: form.openaiAdminKey || undefined,
      });
      setForm(toLlmFormState(saved));
      setOpenaiVisible(false);
      setGoogleVisible(false);
      setOpenrouterVisible(false);
      setTypesafeVisible(false);
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

  const clearKey = async (provider: ProviderKey | 'typesafe' | 'openaiAdmin') => {
    setIsSaving(true);
    try {
      const saved = await llmSettingsApi.updateSettings(
        provider === 'openaiAdmin'
          ? { clearOpenaiAdminKey: true }
          : provider === 'typesafe'
            ? { clearTypesafeApiKey: true }
            : provider === 'openai'
              ? { clearOpenaiApiKey: true }
              : provider === 'google'
                ? { clearGoogleApiKey: true }
                : { clearOpenrouterApiKey: true },
      );
      setForm(toLlmFormState(saved));
      if (provider === 'openaiAdmin') {
        // Admin key не розкривається — лише маска.
      } else if (provider === 'typesafe') setTypesafeVisible(false);
      else if (provider === 'openai') setOpenaiVisible(false);
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
          <code className="text-xs">LLM_OPENAI_API_KEY</code>, <code className="text-xs">LLM_GOOGLE_API_KEY</code>,{' '}
          <code className="text-xs">LLM_OPENROUTER_API_KEY</code>,{' '}
          <code className="text-xs">LLM_OPENROUTER_BASE_URL</code> (опц., EU:{' '}
          <code className="text-xs">https://eu.openrouter.ai/api/v1</code>),{' '}
          <code className="text-xs">LLM_DEFAULT_PROVIDER</code>.
        </p>
      </div>

      <PageTabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(parseLlmSettingsTabKey(String(key)))}>
        {(Object.keys(LLM_SETTINGS_TAB_LABELS) as LlmSettingsTabKey[]).map((key) => (
          <Tab key={key} title={LLM_SETTINGS_TAB_LABELS[key]} />
        ))}
      </PageTabs>

      {activeTab === 'usage' ? <LlmUsageCard /> : null}

      {activeTab === 'providers' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
                  <DynamicIcon name="plug" size={20} className="text-default-600" />
                  <h2 className="text-lg font-semibold">Провайдери</h2>
                </CardHeader>
                <CardBody className="px-2 py-0">
                  <Accordion selectionMode="multiple">
                    {PROVIDER_CARDS.map((config, index) => (
                      <AccordionItem
                        key={String(index + 1)}
                        aria-label={config.title}
                        title={<span className="font-semibold">{config.title}</span>}
                        subtitle={providerSubtitle(config, form)}
                        startContent={
                          <Avatar
                            radius="lg"
                            src={config.logo}
                            name={config.title}
                            classNames={{ base: 'bg-white border border-default-200', img: 'object-contain p-1.5' }}
                          />
                        }
                      >
                        <LlmProviderFields
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
                          extra={
                            config.provider === 'openai' ? (
                              <Input
                                label="Admin key (необовʼязково)"
                                type="password"
                                placeholder={form.hasOpenaiAdminKey ? form.openaiAdminKeyMasked : 'sk-admin-…'}
                                value={form.openaiAdminKey}
                                onValueChange={(v) => updateField('openaiAdminKey', v)}
                                description="Лише для звіту: витрати організації за 30 днів. Fallback: env LLM_OPENAI_ADMIN_KEY"
                                endContent={
                                  form.hasOpenaiAdminKey ? (
                                    <Tooltip content="Очистити збережений admin key" placement="top">
                                      <Button
                                        size="sm"
                                        variant="light"
                                        isIconOnly
                                        color="danger"
                                        aria-label="Очистити збережений admin key"
                                        isDisabled={isSaving}
                                        onPress={() => void clearKey('openaiAdmin')}
                                      >
                                        <DynamicIcon name="trash-2" size={16} className="text-danger" />
                                      </Button>
                                    </Tooltip>
                                  ) : null
                                }
                              />
                            ) : null
                          }
                        />
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardBody>
              </Card>

              <TypesafeJevCard
                form={form}
                isSaving={isSaving}
                keyVisible={typesafeVisible}
                onToggleKeyVisible={() => setTypesafeVisible((v) => !v)}
                onRevealKey={() => void revealKey('typesafe')}
                onClearKey={() => void clearKey('typesafe')}
                onUpdateField={updateField}
              />
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
                    startContent={!platformTesting ? <DynamicIcon name="message-square" size={16} /> : undefined}
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
        </>
      ) : null}
    </div>
  );
};

export default SettingsLlm;
