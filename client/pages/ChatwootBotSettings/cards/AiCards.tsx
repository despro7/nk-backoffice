import React from 'react';
import { Link, Select, SelectItem, Textarea } from '@heroui/react';
import { LlmModelAutocomplete } from '@/components/llm/LlmModelAutocomplete';
import type { LlmProvider } from '@shared/types/llm';
import type { FormState } from '../chatwootBotFormState';
import { FormSwitchField } from '../components/FormSwitchField';
import {
  defaultChatwootAiModelForProvider,
  defaultLlmPlatformSnapshot,
  llmDefaultModelForProvider,
  llmProviderHasApiKey,
} from '../llmPlatformHelpers';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';

/** Увімкнення LLM, маска, провайдер / модель і system prompt. */
export function AiModelCard({ page }: SettingsCardProps) {
  const { form, updateField, llmPlatform, setForm, setActiveTab } = page;
  if (!form) return null;

  const llmSnapshot = llmPlatform ?? defaultLlmPlatformSnapshot();
  const modelsProvider: LlmProvider = form.aiProvider || llmSnapshot.defaultProvider;

  return (
    <SettingsCard icon="bot" title="Маска і модель">
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
            setForm((prev) =>
              prev
                ? { ...prev, aiProvider: nextProvider, aiModel: defaultChatwootAiModelForProvider(llmSnapshot, nextProvider) }
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
      <Textarea
        label="System prompt обраної маски"
        minRows={6}
        maxRows={30}
        value={form.aiMasks.find((m) => m.id === form.aiMaskId)?.systemPrompt ?? ''}
        onValueChange={(v) =>
          updateField(
            'aiMasks',
            form.aiMasks.map((m) => (m.id === form.aiMaskId ? { ...m, systemPrompt: v } : m)),
          )
        }
        description="Поверх маски код додає обовʼязкові правила: чоловічий рід, пошук перед «не знаю», оператор лише через інструмент."
      />
      <p className="text-xs text-default-500">
        Перевірити відповіді з цією маською (зокрема незбереженою) –{' '}
        <Link size="sm" as="button" onPress={() => setActiveTab('sandbox')}>
          Пісочниця
        </Link>
        .
      </p>
    </SettingsCard>
  );
}
