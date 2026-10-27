import React, { useCallback, useEffect, useState } from 'react';
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  llmSettingsApi,
  toLlmFormState,
  type LlmSettingsFormState,
} from '@/services/LlmSettingsService';
import type { LlmModelOption, LlmProvider } from '@shared/types/llm';

type ProviderKey = 'openai' | 'google';

type ProviderCardConfig = {
  provider: ProviderKey;
  title: string;
  modelField: 'openaiDefaultModel' | 'googleDefaultModel';
  apiKeyField: 'openaiApiKey' | 'googleApiKey';
  hasKeyField: 'hasOpenaiApiKey' | 'hasGoogleApiKey';
  maskedField: 'openaiApiKeyMasked' | 'googleApiKeyMasked';
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
    placeholder: 'gemini-2.0-flash',
  },
];

function LlmProviderCard({
  config,
  form,
  isSaving,
  keyVisible,
  onToggleKeyVisible,
  onRevealKey,
  onClearKey,
  onUpdateField,
}: {
  config: ProviderCardConfig;
  form: LlmSettingsFormState;
  isSaving: boolean;
  keyVisible: boolean;
  onToggleKeyVisible: () => void;
  onRevealKey: () => void;
  onClearKey: () => void;
  onUpdateField: <K extends keyof LlmSettingsFormState>(key: K, value: LlmSettingsFormState[K]) => void;
}) {
  const [models, setModels] = useState<LlmModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const hasStoredKey = form[config.hasKeyField];
  const draftKey = form[config.apiKeyField];
  const selectedModel = form[config.modelField];

  const loadModels = useCallback(async () => {
    if (!draftKey.trim() && !hasStoredKey) {
      setModels([]);
      setModelsError('Спочатку вкажіть API key або збережіть ключ');
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await llmSettingsApi.listModels(
        config.provider,
        draftKey.trim() || undefined,
      );
      setModels(list);
    } catch (error) {
      setModels([]);
      setModelsError(error instanceof Error ? error.message : 'Не вдалося завантажити моделі');
    } finally {
      setModelsLoading(false);
    }
  }, [config.provider, draftKey, hasStoredKey]);

  useEffect(() => {
    if (hasStoredKey) {
      void loadModels();
    }
  }, [hasStoredKey, loadModels]);

  const modelOptions =
    selectedModel && !models.some((m) => m.id === selectedModel)
      ? [
          { id: selectedModel, label: selectedModel, pricingHint: null, pricingSource: null },
          ...models,
        ]
      : models;

  const modelMetaLine = (m: LlmModelOption): string | null => {
    if (!m.pricingHint) return null;
    if (m.pricingSource === 'openai_official_docs') {
      return `Pricing: ${m.pricingHint}`;
    }
    if (m.pricingSource === 'google_official_docs') {
      return `Pricing: ${m.pricingHint}`;
    }
    return `Pricing: ${m.pricingHint}`;
  };

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
            <Autocomplete
              className="flex-1 min-w-[200px]"
              label="Модель за замовчуванням"
              placeholder={config.placeholder}
              selectedKey={selectedModel || null}
              inputValue={selectedModel}
              onInputChange={(v) => onUpdateField(config.modelField, v)}
              onSelectionChange={(key) => {
                if (key) onUpdateField(config.modelField, String(key));
              }}
              isLoading={modelsLoading}
              allowsCustomValue
              menuTrigger="focus"
              isDisabled={!hasStoredKey && !draftKey.trim()}
              description={
                modelsError ??
                'Моделі з API. Ціни: OpenAI — developers.openai.com/api/docs/pricing.md; Gemini — ai.google.dev/gemini-api/docs/pricing (Standard, Paid tier).'
              }
              isInvalid={Boolean(modelsError)}
            >
              {modelOptions.map((m) => (
                <AutocompleteItem
                  key={m.id}
                  textValue={`${m.id} ${m.pricingHint ?? ''}`}
                >
                  <div className="flex flex-col gap-0.5 py-0.5">
                    <span className="text-sm font-medium">{m.label}</span>
                    {modelMetaLine(m) ? (
                      <span className="text-xs text-default-500">{modelMetaLine(m)}</span>
                    ) : null}
                  </div>
                </AutocompleteItem>
              ))}
            </Autocomplete>
            <Button
              size="md"
              variant="flat"
              isDisabled={!hasStoredKey && !draftKey.trim()}
              onPress={() => void loadModels()}
              startContent={<DynamicIcon name="refresh-cw" className={modelsLoading ? 'animate-spin' : ''} size={16} />}
              className="shrink-0 h-14"
            >
              Оновити
            </Button>
          </div>
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
      } else {
        updateField('googleApiKey', data.googleApiKey);
        setGoogleVisible(true);
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
        maxOutputTokens: form.maxOutputTokens,
        openaiApiKey: form.openaiApiKey || undefined,
        googleApiKey: form.googleApiKey || undefined,
      });
      setForm(toLlmFormState(saved));
      setOpenaiVisible(false);
      setGoogleVisible(false);
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
        provider === 'openai' ? { clearOpenaiApiKey: true } : { clearGoogleApiKey: true },
      );
      setForm(toLlmFormState(saved));
      if (provider === 'openai') setOpenaiVisible(false);
      else setGoogleVisible(false);
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
          <code className="text-xs">LLM_DEFAULT_PROVIDER</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDER_CARDS.map((config) => (
          <LlmProviderCard
            key={config.provider}
            config={config}
            form={form}
            isSaving={isSaving}
            keyVisible={config.provider === 'openai' ? openaiVisible : googleVisible}
            onToggleKeyVisible={() => {
              if (config.provider === 'openai') {
                setOpenaiVisible((v) => !v);
              } else {
                setGoogleVisible((v) => !v);
              }
            }}
            onRevealKey={() => void revealKey(config.provider)}
            onClearKey={() => void clearKey(config.provider)}
            onUpdateField={updateField}
          />
        ))}

        <Card>
          <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
            <DynamicIcon name="sparkles" size={20} className="text-default-600" />
            <h2 className="text-lg font-semibold">Провайдер за замовчуванням</h2>
          </CardHeader>
          <CardBody className="flex-col sm:flex-row gap-4 p-4">
            <Select
              label="defaultProvider"
              selectedKeys={[form.defaultProvider]}
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                if (key === 'openai' || key === 'google') {
                  updateField('defaultProvider', key as LlmProvider);
                }
              }}
            >
              <SelectItem key="openai">OpenAI</SelectItem>
              <SelectItem key="google">Google Gemini</SelectItem>
            </Select>
            <Input
              type="number"
              label="maxOutputTokens"
              value={String(form.maxOutputTokens)}
              onValueChange={(v) => updateField('maxOutputTokens', Number(v) || 1024)}
            />
          </CardBody>
        </Card>
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
