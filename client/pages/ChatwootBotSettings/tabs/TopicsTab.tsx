import React from 'react';
import { Button, Card, CardBody, CardFooter, CardHeader, Divider, Input, Link, Radio, RadioGroup, Slider } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { CHATWOOT_BOT_TOPICS_LIMITS as LIMITS } from '@shared/types/chatwootBot';
import type { FormState } from '../chatwootBotFormState';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

type NumberField = 'topicsJevExamplesPerTopic' | 'topicsJevMaxPerSync' | 'topicsSyncDelaySeconds' | 'topicsCronMinutes';

export function TopicsTab({ page }: Props) {
  const { form, updateField, isSaving, handleSave, llmPlatform } = page;

  if (!form) return null;

  const numberInput = (
    field: NumberField,
    range: { min: number; max: number },
    label: string,
    description: string,
    isDisabled = false,
  ) => (
    <Input
      type="number"
      label={label}
      description={description}
      min={range.min}
      max={range.max}
      isDisabled={isDisabled}
      value={String(form[field])}
      onValueChange={(v) => updateField(field, (v === '' ? range.min : Number(v)) as FormState[NumberField])}
    />
  );

  const jevWithoutKey = form.topicsClassifier === 'jev' && llmPlatform != null && !llmPlatform.hasTypesafeApiKey;

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name="tags" size={20} className="text-default-600" />
        <h2 className="text-lg font-semibold">Теми питань</h2>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        <p className="text-sm text-default-500">
          Нові питання клієнтів розкладаються по темах статистики у фоні після кожного повідомлення. Ручні правки
          менеджерів класифікатор не змінює.
        </p>
        <RadioGroup
          label="Класифікатор"
          value={form.topicsClassifier}
          onValueChange={(v) => updateField('topicsClassifier', v === 'jev' ? 'jev' : 'local')}
        >
          <Radio value="local" description="Схожість слів з учасниками тем. Безкоштовно, без зовнішніх сервісів.">
            Локальний
          </Radio>
          <Radio
            value="jev"
            description="TypeSafe Jev вибирає тему за змістом. Невпевнені й нові питання — локальному алгоритму."
          >
            Jev
          </Radio>
        </RadioGroup>
        {jevWithoutKey && (
          <div className="flex gap-2 items-start rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
            <DynamicIcon name="triangle-alert" size={16} className="shrink-0 mt-0.5" />
            <span>
              TypeSafe API key не налаштовано — працюватиме локальний алгоритм. Додайте ключ у{' '}
              <Link href="/settings/llm" size="sm" underline="always">
                налаштуваннях LLM
              </Link>
              .
            </span>
          </div>
        )}
        <Slider
          label="Мінімальна впевненість Jev"
          isDisabled={form.topicsClassifier !== 'jev'}
          minValue={0.3}
          maxValue={0.95}
          step={0.05}
          value={form.topicsJevMinConfidence}
          onChange={(v) => updateField('topicsJevMinConfidence', Array.isArray(v) ? v[0] : v)}
          getValue={(v) => (Array.isArray(v) ? v[0] : v).toFixed(2)}
          className="max-w-md"
        />
        <p className="text-xs text-default-500">
          Нижче порогу Jev не призначає тему: питання розкладає локальний алгоритм або створює нову тему.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {numberInput(
            'topicsJevExamplesPerTopic',
            LIMITS.jevExamplesPerTopic,
            'Прикладів на тему для Jev',
            `${LIMITS.jevExamplesPerTopic.min}–${LIMITS.jevExamplesPerTopic.max}. Більше — точніше, але дорожче (input tokens)`,
            form.topicsClassifier !== 'jev',
          )}
          {numberInput(
            'topicsJevMaxPerSync',
            LIMITS.jevMaxPerSync,
            'Викликів Jev за прохід',
            `${LIMITS.jevMaxPerSync.min}–${LIMITS.jevMaxPerSync.max}. Решту нових питань розкладе локальний алгоритм`,
            form.topicsClassifier !== 'jev',
          )}
        </div>

        <Divider />

        <p className="text-sm font-medium">Розклад</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {numberInput(
            'topicsSyncDelaySeconds',
            LIMITS.syncDelaySeconds,
            'Затримка після повідомлення, с',
            `${LIMITS.syncDelaySeconds.min}–${LIMITS.syncDelaySeconds.max}. Повідомлення за цей час розкладаються разом`,
          )}
          {numberInput(
            'topicsCronMinutes',
            LIMITS.cronMinutes,
            'Інтервал cron, хв',
            `${LIMITS.cronMinutes.min}–${LIMITS.cronMinutes.max}; 0 — вимкнено. Підстраховка, лише на проді`,
          )}
        </div>
      </CardBody>
      <CardFooter className="p-4">
        <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
          Зберегти
        </Button>
      </CardFooter>
    </Card>
  );
}
