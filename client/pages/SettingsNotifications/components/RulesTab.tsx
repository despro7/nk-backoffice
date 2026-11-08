import { useMemo, useState } from 'react';
import { Button, Card, CardBody, Chip, Input, Switch, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { findMatchingRule } from '@shared/notifications/ruleEngine';
import { NOTIFICATION_KINDS, notificationGroupLabel } from '@shared/constants/notifications';
import type { NotificationRuleDef } from '@shared/types/notificationRules';
import type { NotificationRawLog } from '@shared/types/notificationSettings';
import { describeMatch, toSourceLog } from '../notificationPlayground';

interface RulesTabProps {
  rules: NotificationRuleDef[];
  logs: NotificationRawLog[];
  onEdit: (rule: NotificationRuleDef) => void;
  onCreate: () => void;
  onToggle: (rule: NotificationRuleDef, enabled: boolean) => void;
  onMove: (rule: NotificationRuleDef, direction: -1 | 1) => void;
  busy?: boolean;
}

const KIND_LABEL = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.id, k.label]));

export function RulesTab({ rules, logs, onEdit, onCreate, onToggle, onMove, busy }: RulesTabProps) {
  const [query, setQuery] = useState('');

  const hits = useMemo(() => {
    const map = new Map<number, number>();
    let unmatched = 0;
    for (const log of logs) {
      const hit = findMatchingRule(toSourceLog(log), rules);
      if (hit?.rule.id != null) map.set(hit.rule.id, (map.get(hit.rule.id) ?? 0) + 1);
      else unmatched += 1;
    }
    return { map, unmatched };
  }, [rules, logs]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? rules.filter((r) => `${r.name} ${describeMatch(r)} ${r.output.title ?? ''}`.toLowerCase().includes(q))
    : rules;

  return (
    <Card className="shadow-container">
      <CardBody className="gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="rules-search"
            size="sm"
            className="max-w-xs"
            placeholder="Пошук правила"
            startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
            value={query}
            onValueChange={setQuery}
            isClearable
            onClear={() => setQuery('')}
          />
          <span className="text-xs text-default-500">
            Порядок важливий: спрацьовує перше увімкнене правило. Без правила – {hits.unmatched} з {logs.length} останніх записів.
          </span>
          <span className="flex-1" />
          <Button color="primary" size="sm" startContent={<DynamicIcon name="plus" size={16} />} onPress={onCreate}>
            Нове правило
          </Button>
        </div>

        <div className="divide-y divide-default-100 rounded-lg border border-default-200">
          {visible.map((rule) => {
            const index = rules.indexOf(rule);
            const count = rule.id != null ? hits.map.get(rule.id) ?? 0 : 0;
            return (
              <div
                key={rule.id}
                className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-100/60 ${rule.enabled ? '' : 'opacity-55'}`}
              >
                <div className="flex flex-col">
                  <Button isIconOnly size="sm" variant="light" className="h-6 min-w-6" aria-label="Вище" isDisabled={busy || index === 0 || !!q} onPress={() => onMove(rule, -1)}>
                    <DynamicIcon name="chevron-up" size={14} />
                  </Button>
                  <Button isIconOnly size="sm" variant="light" className="h-6 min-w-6" aria-label="Нижче" isDisabled={busy || index === rules.length - 1 || !!q} onPress={() => onMove(rule, 1)}>
                    <DynamicIcon name="chevron-down" size={14} />
                  </Button>
                </div>

                <button type="button" className="min-w-0 text-left" onClick={() => onEdit(rule)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-default-900">{rule.name}</span>
                    {rule.output.visibility === 'hidden' ? (
                      <Chip size="sm" variant="flat" className="h-5 text-[11px]">Лише журнал</Chip>
                    ) : (
                      <>
                        {rule.output.kind && (
                          <Chip size="sm" variant="flat" color={rule.output.kind === 'task' ? 'primary' : rule.output.kind === 'alert' ? 'danger' : 'success'} className="h-5 text-[11px]">
                            {KIND_LABEL[rule.output.kind]}
                          </Chip>
                        )}
                        {rule.output.group && (
                          <Chip size="sm" variant="flat" className="h-5 text-[11px]">{notificationGroupLabel(rule.output.group)}</Chip>
                        )}
                      </>
                    )}
                    {rule.key && (
                      <Tooltip content="Стандартне правило. Поки його не змінено, воно оновлюється разом із застосунком." delay={300}>
                        <Chip size="sm" variant="dot" className="h-5 border-none text-[11px]">
                          стандартне
                        </Chip>
                      </Tooltip>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-default-500">{describeMatch(rule)}</div>
                </button>

                <div className="flex items-center gap-3">
                  <Tooltip content="Скільки з останніх записів обробляє це правило" delay={300}>
                    <span className={`min-w-10 text-right text-xs tabular-nums ${count ? 'text-default-700' : 'text-default-400'}`}>{count}</span>
                  </Tooltip>
                  <Switch size="sm" aria-label="Увімкнено" isSelected={rule.enabled} isDisabled={busy} onValueChange={(v) => onToggle(rule, v)} />
                  <Button isIconOnly size="sm" variant="light" className="text-blue-600" aria-label="Редагувати" onPress={() => onEdit(rule)}>
                    <DynamicIcon name="pencil" size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="py-8 text-center text-sm text-default-400">Правил не знайдено</p>}
        </div>
      </CardBody>
    </Card>
  );
}
