import React from 'react';
import { Button, Input, Select, SelectItem, Switch, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ChatwootBotAutoReplyRule } from '@shared/types/chatwootBot';
import { SettingsCard, type SettingsCardProps } from './SettingsCard';

export function FallbackCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;
  return (
    <SettingsCard icon="message-square-dashed" title="Fallback">
      <Textarea
        label="Якщо патерн і AI не відповіли"
        minRows={3}
        value={form.fallbackMessage}
        onValueChange={(v) => updateField('fallbackMessage', v)}
      />
    </SettingsCard>
  );
}

/** Автовідповіді за патерном: спрацьовують до LLM. */
export function AutoReplyRulesCard({ page }: SettingsCardProps) {
  const { form, updateField } = page;
  if (!form) return null;

  const updateRule = (idx: number, patch: Partial<ChatwootBotAutoReplyRule>) => {
    const next = [...form.autoReplyRules];
    next[idx] = { ...next[idx], ...patch };
    updateField('autoReplyRules', next);
  };

  return (
    <SettingsCard
      icon="message-square"
      title="Патерни (автовідповіді)"
      headerEnd={
        <Button
          size="sm"
          variant="flat"
          startContent={<DynamicIcon name="plus" size={14} />}
          onPress={() =>
            updateField('autoReplyRules', [
              ...form.autoReplyRules,
              {
                id: `rule_${Date.now()}`,
                enabled: true,
                priority: (form.autoReplyRules.length + 1) * 10,
                matchType: 'substring',
                pattern: '',
                reply: '',
                caseInsensitive: true,
              },
            ])
          }
        >
          Додати правило
        </Button>
      }
    >
      <p className="text-xs text-default-500">
        Спрацьовують до AI: якщо повідомлення клієнта збіглося з патерном – бот одразу відповідає текстом правила.
      </p>
      {form.autoReplyRules.length === 0 ? <p className="text-sm text-default-400">Правил ще немає.</p> : null}
      {form.autoReplyRules.map((rule, idx) => (
        <div key={rule.id} className="grid gap-2 p-3 border border-default-200 rounded-lg">
          <div className="flex flex-wrap gap-2">
            <Input
              size="sm"
              className="flex-1 min-w-[120px]"
              label="Патерн"
              value={rule.pattern}
              onValueChange={(v) => updateRule(idx, { pattern: v })}
            />
            <Select
              size="sm"
              className="w-40"
              label="Тип"
              selectedKeys={[rule.matchType]}
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                if (key === 'substring' || key === 'regex') updateRule(idx, { matchType: key });
              }}
            >
              <SelectItem key="substring">substring</SelectItem>
              <SelectItem key="regex">regex</SelectItem>
            </Select>
            <Input
              size="sm"
              type="number"
              className="w-24"
              label="Пріоритет"
              value={String(rule.priority)}
              onValueChange={(v) => updateRule(idx, { priority: Number(v) || 0 })}
            />
          </div>
          <Textarea
            size="sm"
            label="Відповідь"
            minRows={2}
            value={rule.reply}
            onValueChange={(v) => updateRule(idx, { reply: v })}
          />
          <div className="flex gap-2">
            <Switch size="sm" isSelected={rule.enabled} onValueChange={(v) => updateRule(idx, { enabled: v })}>
              Увімкнено
            </Switch>
            <Button
              size="sm"
              color="danger"
              variant="light"
              onPress={() =>
                updateField(
                  'autoReplyRules',
                  form.autoReplyRules.filter((r) => r.id !== rule.id),
                )
              }
            >
              Видалити
            </Button>
          </div>
        </div>
      ))}
    </SettingsCard>
  );
}
