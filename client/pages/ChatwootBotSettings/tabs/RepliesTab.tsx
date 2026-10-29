import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { textToKeywords } from '../chatwootBotFormState';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

type Props = { page: ChatwootBotSettingsPageModel };

export function RepliesTab({ page }: Props) {
  const { form, updateField, isSaving, handleSave } = page;

  if (!form) return null;

  const keywordChips = textToKeywords(form.handoverKeywordsText);

  return (
              <Card>
                <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
                  <DynamicIcon name="message-square" size={20} className="text-default-600" />
                  <h2 className="text-lg font-semibold">Відповіді та патерни</h2>
                </CardHeader>
                <CardBody className="gap-4 p-4">
                  <Textarea
                    label="Fallback (якщо патерн і AI не відповіли)"
                    minRows={3}
                    value={form.fallbackMessage}
                    onValueChange={(v) => updateField('fallbackMessage', v)}
                  />
    
                  <Input
                    label="Handover keywords"
                    placeholder="оператор, людина, менеджер"
                    value={form.handoverKeywordsText}
                    onValueChange={(v) => updateField('handoverKeywordsText', v)}
                    description="Через кому. Substring match, без урахування регістру"
                  />
                  {keywordChips.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {keywordChips.map((kw) => (
                        <Chip key={kw} size="sm" variant="flat">
                          {kw}
                        </Chip>
                      ))}
                    </div>
                  )}
    
                  <Divider />
                  <div className="flex flex-wrap gap-2 items-center">
                    <p className="text-sm font-medium w-full">Патерни (автовідповіді)</p>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        const id = `rule_${Date.now()}`;
                        updateField('autoReplyRules', [
                          ...form.autoReplyRules,
                          {
                            id,
                            enabled: true,
                            priority: (form.autoReplyRules.length + 1) * 10,
                            matchType: 'substring',
                            pattern: '',
                            reply: '',
                            caseInsensitive: true,
                          },
                        ]);
                      }}
                    >
                      Додати правило
                    </Button>
                  </div>
                  {form.autoReplyRules.map((rule, idx) => (
                    <div key={rule.id} className="grid gap-2 p-3 border border-default-200 rounded-lg">
                      <div className="flex flex-wrap gap-2">
                        <Input
                          size="sm"
                          className="flex-1 min-w-[120px]"
                          label="Патерн"
                          value={rule.pattern}
                          onValueChange={(v) => {
                            const next = [...form.autoReplyRules];
                            next[idx] = { ...rule, pattern: v };
                            updateField('autoReplyRules', next);
                          }}
                        />
                        <Select
                          size="sm"
                          className="w-40"
                          label="Тип"
                          selectedKeys={[rule.matchType]}
                          onSelectionChange={(keys) => {
                            const key = Array.from(keys)[0];
                            if (key !== 'substring' && key !== 'regex') return;
                            const next = [...form.autoReplyRules];
                            next[idx] = { ...rule, matchType: key };
                            updateField('autoReplyRules', next);
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
                          onValueChange={(v) => {
                            const next = [...form.autoReplyRules];
                            next[idx] = { ...rule, priority: Number(v) || 0 };
                            updateField('autoReplyRules', next);
                          }}
                        />
                      </div>
                      <Textarea
                        size="sm"
                        label="Відповідь"
                        minRows={2}
                        value={rule.reply}
                        onValueChange={(v) => {
                          const next = [...form.autoReplyRules];
                          next[idx] = { ...rule, reply: v };
                          updateField('autoReplyRules', next);
                        }}
                      />
                      <div className="flex gap-2">
                        <Switch
                          size="sm"
                          isSelected={rule.enabled}
                          onValueChange={(v) => {
                            const next = [...form.autoReplyRules];
                            next[idx] = { ...rule, enabled: v };
                            updateField('autoReplyRules', next);
                          }}
                        >
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
                </CardBody>
                <CardFooter className="p-4">
                  <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                    Зберегти
                  </Button>
                </CardFooter>
              </Card>
  );
}
