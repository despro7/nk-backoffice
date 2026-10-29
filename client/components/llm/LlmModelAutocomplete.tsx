import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, AutocompleteItem, Avatar, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { llmSettingsApi } from '@/services/LlmSettingsService';
import { LlmModelPricingHint } from '@/components/llm/LlmModelPricingHint';
import type { LlmModelOption, LlmModelPriceHighlightSettings, LlmProvider } from '@shared/types/llm';

const LLM_MODEL_PRICING_PLACEHOLDER = 'N/A in · N/A out';

function modelMetaLine(m: LlmModelOption): string | null {
  if (!m.pricingHint) return null;
  if (m.pricingSource === 'openai_official_docs') {
    return `Ціна (OpenAI docs): ${m.pricingHint}`;
  }
  if (m.pricingSource === 'google_official_docs') {
    return `Ціна (Google docs): ${m.pricingHint}`;
  }
  if (m.pricingSource === 'openrouter_api') {
    return `Ціна (OpenRouter): ${m.pricingHint}`;
  }
  return `Ціна: ${m.pricingHint}`;
}

export type LlmModelAutocompleteProps = {
  provider: LlmProvider;
  value: string;
  onChange: (modelId: string) => void;
  label: string;
  placeholder?: string;
  modelPriceHighlight: LlmModelPriceHighlightSettings;
  hasStoredApiKey: boolean;
  draftApiKey?: string;
  className?: string;
  showReloadButton?: boolean;
  descriptionWhenEmpty?: string;
};

export function LlmModelAutocomplete({
  provider,
  value,
  onChange,
  label,
  placeholder,
  modelPriceHighlight,
  hasStoredApiKey,
  draftApiKey = '',
  className,
  showReloadButton = false,
  descriptionWhenEmpty = 'Моделі з API. Відкрийте список — показ усіх моделей; фільтр лише під час вводу.',
}: LlmModelAutocompleteProps) {
  const [models, setModels] = useState<LlmModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const closingFromSelectionRef = useRef(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const selectedModel = value;
  const canListModels = hasStoredApiKey || Boolean(draftApiKey.trim());

  const loadModels = useCallback(async () => {
    if (!canListModels) {
      setModels([]);
      setModelsError('Спочатку налаштуйте API key у Налаштування → LLM');
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await llmSettingsApi.listModels(provider, draftApiKey.trim() || undefined);
      setModels(list);
    } catch (error) {
      setModels([]);
      setModelsError(error instanceof Error ? error.message : 'Не вдалося завантажити моделі');
    } finally {
      setModelsLoading(false);
    }
  }, [canListModels, draftApiKey, provider]);

  useEffect(() => {
    if (hasStoredApiKey) {
      void loadModels();
    }
  }, [hasStoredApiKey, loadModels, provider]);

  const modelOptions =
    !isModelMenuOpen && selectedModel && !models.some((m) => m.id === selectedModel)
      ? [{ id: selectedModel, label: selectedModel, pricingHint: null, pricingSource: null }, ...models]
      : models;

  const filteredModelOptions = useMemo(() => {
    if (!isModelMenuOpen) return modelOptions;
    const q = modelQuery.trim().toLowerCase();
    if (!q) return modelOptions;
    if (selectedModel && q === selectedModel.trim().toLowerCase()) {
      return modelOptions;
    }
    return modelOptions.filter((m) => {
      const id = m.id.toLowerCase();
      const hint = m.pricingHint?.toLowerCase() ?? '';
      const labelText = m.label.toLowerCase();
      return id.includes(q) || hint.includes(q) || labelText.includes(q);
    });
  }, [modelOptions, modelQuery, isModelMenuOpen, selectedModel]);

  const selectedOption = modelOptions.find((m) => m.id === selectedModel);
  const selectedMeta = selectedOption ? modelMetaLine(selectedOption) : null;

  const autocomplete = (
    <Autocomplete
      className={className ?? 'llm-model-autocomplete flex-1 min-w-[200px]'}
      label={label}
      placeholder={placeholder}
      selectedKey={isModelMenuOpen ? null : selectedModel || null}
      inputValue={isModelMenuOpen ? modelQuery : selectedModel}
      onOpenChange={(open) => {
        if (!open) {
          if (!closingFromSelectionRef.current) {
            const q = modelQuery.trim();
            if (q && (models.some((m) => m.id === q) || q.includes('/'))) {
              onChange(q);
            }
          }
          closingFromSelectionRef.current = false;
          setModelQuery('');
        } else {
          setModelQuery(selectedModel);
        }
        setIsModelMenuOpen(open);
      }}
      onInputChange={(v) => {
        if (isModelMenuOpen) {
          setModelQuery(v);
          return;
        }
        onChange(v);
      }}
      onSelectionChange={(key) => {
        if (key) {
          const id = String(key);
          closingFromSelectionRef.current = true;
          onChange(id);
          setModelQuery('');
          setIsModelMenuOpen(false);
          requestAnimationFrame(() => modelInputRef.current?.blur());
        }
      }}
      inputProps={{ ref: modelInputRef }}
      isLoading={modelsLoading}
      allowsCustomValue
      menuTrigger="focus"
      isDisabled={!canListModels}
      description={
        modelsError ??
        (models.length > 0
          ? `Завантажено ${models.length} моделей. ${selectedMeta ?? ''}`.trim()
          : undefined) ??
        selectedMeta ??
        descriptionWhenEmpty
      }
      isInvalid={Boolean(modelsError)}
      defaultFilter={() => true}
      isVirtualized={false}
      maxListboxHeight={320}
      listboxProps={{
        className: 'max-h-80 overflow-y-auto',
        itemClasses: {
          base: '!h-auto !min-h-0 py-2 items-start data-[hover=true]:bg-default-100',
        },
      }}
      popoverProps={{ placement: 'bottom-start', className: 'llm-model-autocomplete-popover' }}
    >
      {filteredModelOptions.map((m) => (
        <AutocompleteItem
          key={m.id}
          textValue={m.pricingHint ? `${m.id} ${m.pricingHint}` : m.id}
          classNames={{ base: '!h-auto !min-h-0' }}
        >
          <div className="flex w-full min-w-0 items-center gap-2">
            {provider === 'openrouter' ? (
              <Avatar
                src={m.iconUrl ?? undefined}
                name={m.id}
                size="sm"
                className="h-8 w-8 shrink-0 bg-default-100"
                imgProps={{ referrerPolicy: 'no-referrer' }}
                showFallback
                fallback={
                  <DynamicIcon name="box" size={16} className="text-default-500" aria-hidden />
                }
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-small truncate">{m.id}</span>
              <LlmModelPricingHint
                hint={m.pricingHint}
                placeholder={LLM_MODEL_PRICING_PLACEHOLDER}
                highlight={modelPriceHighlight}
              />
            </div>
          </div>
        </AutocompleteItem>
      ))}
    </Autocomplete>
  );

  if (!showReloadButton) {
    return autocomplete;
  }

  return (
    <div className="flex flex-wrap items-start gap-2 flex-1 min-w-[200px]">
      {autocomplete}
      <Button
        size="md"
        variant="flat"
        isDisabled={!canListModels}
        onPress={() => void loadModels()}
        startContent={
          <DynamicIcon name="refresh-cw" className={modelsLoading ? 'animate-spin' : ''} size={16} />
        }
        className="shrink-0 h-14"
        aria-label="Оновити список моделей"
      >
        Оновити
      </Button>
    </div>
  );
}
