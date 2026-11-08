import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Chip, Input, Select, SelectItem, Tab, Tabs, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { findMatchingRule } from '@shared/notifications/ruleEngine';
import type { NotificationGlossaryEntry, NotificationRuleDef } from '@shared/types/notificationRules';
import type { NotificationRawLog } from '@shared/types/notificationSettings';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { notificationSettingsApi } from '@/services/NotificationSettingsService';
import { previewItem, render, ruleFromSample, toSourceLog } from '../notificationPlayground';

interface TesterTabProps {
  rules: NotificationRuleDef[];
  glossary: NotificationGlossaryEntry[];
  logs: NotificationRawLog[];
  /** Запис, з якого відкрито тестер (з «Джерел» або «Без шаблону»). */
  focusLogId: number | null;
  onEditRule: (rule: NotificationRuleDef) => void;
}

const EMPTY_RAW: NotificationRawLog = {
  id: 0,
  createdAt: new Date().toISOString(),
  category: 'dilovod',
  status: 'error',
  title: '',
  message: '',
  orderNumber: '',
  initiatedBy: '',
  data: null,
  actorUserId: null,
  actorName: null,
};

export function TesterTab({ rules, glossary, logs, focusLogId, onEditRule }: TesterTabProps) {
  const [mode, setMode] = useState<'log' | 'manual'>('log');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<NotificationRawLog[] | null>(null);
  const [selected, setSelected] = useState<NotificationRawLog | null>(null);
  const [manual, setManual] = useState<NotificationRawLog>(EMPTY_RAW);
  const [dataText, setDataText] = useState('');
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusLogId) return;
    const local = logs.find((l) => l.id === focusLogId);
    if (local) {
      setSelected(local);
      setMode('log');
      return;
    }
    notificationSettingsApi.logs({ ids: [focusLogId] }).then((rows) => {
      if (rows[0]) {
        setSelected(rows[0]);
        setMode('log');
      }
    }).catch(() => undefined);
  }, [focusLogId, logs]);

  const search = async () => {
    const q = query.trim();
    if (!q) {
      setFound(null);
      return;
    }
    try {
      setFound(await notificationSettingsApi.logs({ search: q, limit: 50 }));
    } catch {
      setFound([]);
    }
  };

  const base = found ?? logs.slice(0, 60);
  const list = selected && !base.some((l) => l.id === selected.id) ? [selected, ...base] : base;
  const subject = mode === 'log' ? selected : manual;

  const result = useMemo(() => {
    if (!subject) return null;
    const source = toSourceLog(subject);
    const trace = rules
      .filter((r) => r.enabled)
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ rule: r, hit: findMatchingRule(source, [r]) !== null }));
    return { rendered: render(subject, rules, glossary), trace };
  }, [subject, rules, glossary]);

  const updateData = (text: string) => {
    setDataText(text);
    if (!text.trim()) {
      setDataError(null);
      setManual((m) => ({ ...m, data: null }));
      return;
    }
    try {
      setManual((m) => ({ ...m, data: JSON.parse(text) }));
      setDataError(null);
    } catch {
      setDataError('Невірний JSON');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Card className="shadow-container">
        <CardHeader className="pb-0">
          <Tabs size="sm" selectedKey={mode} onSelectionChange={(k) => setMode(k as 'log' | 'manual')}>
            <Tab key="log" title="Запис з журналу" />
            <Tab key="manual" title="Ввести вручну" />
          </Tabs>
        </CardHeader>
        <CardBody className="gap-3">
          {mode === 'log' ? (
            <>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
                <Input
                  id="tester-search"
                  size="sm"
                  placeholder="Пошук у заголовку, тексті або №замовлення"
                  value={query}
                  onValueChange={setQuery}
                  startContent={<DynamicIcon name="search" size={16} className="text-default-400" />}
                />
                <Button size="sm" type="submit" variant="flat">Знайти</Button>
              </form>
              <div className="max-h-[520px] divide-y divide-default-100 overflow-y-auto rounded-lg border border-default-200">
                {list.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => setSelected(log)}
                    className={`block w-full px-3 py-2 text-left transition-colors hover:bg-gray-100/60 ${selected?.id === log.id ? 'bg-default-100' : ''}`}
                  >
                    <div className="flex items-center gap-2 text-[11px] text-default-500">
                      <span className="font-mono">#{log.id}</span>
                      <span>{log.category}</span>
                      <Chip size="sm" variant="flat" color={log.status === 'error' ? 'danger' : log.status === 'warning' ? 'warning' : log.status === 'success' ? 'success' : 'default'} className="h-4 text-[10px]">
                        {log.status}
                      </Chip>
                      <span>{new Date(log.createdAt).toLocaleString('uk-UA')}</span>
                    </div>
                    <div className="truncate text-sm text-default-900">{log.title}</div>
                    <div className="truncate text-xs text-default-500">{log.message}</div>
                  </button>
                ))}
                {list.length === 0 && <p className="py-8 text-center text-sm text-default-400">Нічого не знайдено</p>}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input id="manual-category" size="sm" label="category" value={manual.category} onValueChange={(v) => setManual({ ...manual, category: v })} />
              <Select
                size="sm"
                label="status"
                selectedKeys={[manual.status]}
                onSelectionChange={(k) => setManual({ ...manual, status: (Array.from(k)[0] as string) ?? 'error' })}
              >
                {['error', 'warning', 'success', 'info'].map((s) => <SelectItem key={s}>{s}</SelectItem>)}
              </Select>
              <Input id="manual-title" size="sm" label="title" className="md:col-span-2" value={manual.title ?? ''} onValueChange={(v) => setManual({ ...manual, title: v })} />
              <Textarea id="manual-message" size="sm" minRows={4} label="message" className="md:col-span-2" classNames={{ input: 'font-mono text-xs' }} value={manual.message ?? ''} onValueChange={(v) => setManual({ ...manual, message: v })} />
              <Input id="manual-order" size="sm" label="orderNumber" value={manual.orderNumber ?? ''} onValueChange={(v) => setManual({ ...manual, orderNumber: v || null })} />
              <Input id="manual-initiator" size="sm" label="initiatedBy" value={manual.initiatedBy ?? ''} onValueChange={(v) => setManual({ ...manual, initiatedBy: v || null })} />
              <Textarea
                id="manual-data"
                size="sm"
                minRows={3}
                label="data (JSON)"
                className="md:col-span-2"
                classNames={{ input: 'font-mono text-xs' }}
                value={dataText}
                onValueChange={updateData}
                isInvalid={!!dataError}
                errorMessage={dataError}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="shadow-container">
          <CardHeader className="justify-between">
            <span className="text-sm font-semibold">Як побачить користувач</span>
            {subject && result && (
              result.rendered.ruleId != null ? (
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<DynamicIcon name="pencil" size={14} />}
                  onPress={() => {
                    const rule = rules.find((r) => r.id === result.rendered.ruleId);
                    if (rule) onEditRule(rule);
                  }}
                >
                  {result.rendered.ruleName}
                </Button>
              ) : (
                <Button
                  size="sm"
                  color="primary"
                  startContent={<DynamicIcon name="plus" size={14} />}
                  onPress={() => onEditRule(ruleFromSample(subject))}
                >
                  Створити правило
                </Button>
              )
            )}
          </CardHeader>
          <CardBody className="p-0">
            {subject && result ? (
              <>
                {result.rendered.visible ? (
                  <NotificationRow item={previewItem(subject, result.rendered)} isAdmin showRuleHints onOpen={() => undefined} onResolve={() => undefined} />
                ) : (
                  <p className="px-5 py-6 text-sm text-default-500">
                    Не показується в дропдауні: {result.rendered.ruleId ? 'правило позначає запис як «Лише журнал»' : 'без правила видно лише помилки й попередження'}.
                  </p>
                )}
                <table className="m-4 w-[calc(100%-2rem)] text-[11px]">
                  <tbody>
                    {Object.entries(result.rendered.vars).filter(([k]) => !['rawMessage', 'rawTitle'].includes(k)).map(([k, v]) => (
                      <tr key={k} className="align-top">
                        <td className="w-28 py-0.5 pr-2 font-mono text-default-500">{k}</td>
                        <td className="whitespace-pre-wrap break-words py-0.5 font-mono text-default-800">{v || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-default-400">Оберіть запис або введіть дані</p>
            )}
          </CardBody>
        </Card>

        {subject && result && (
          <Card className="shadow-container">
            <CardHeader className="text-sm font-semibold">Перевірка правил за порядком</CardHeader>
            <CardBody className="max-h-[360px] gap-1 overflow-y-auto pt-0">
              {result.trace.map(({ rule, hit }) => {
                const winner = rule.id === result.rendered.ruleId;
                return (
                  <div key={rule.id} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${winner ? 'bg-success-50 text-success-700' : hit ? 'text-default-700' : 'text-default-400'}`}>
                    <DynamicIcon name={winner ? 'circle-check' : hit ? 'circle-dot' : 'circle'} size={13} />
                    <span className="truncate">{rule.name}</span>
                    {winner && <span className="ml-auto shrink-0">спрацювало</span>}
                    {hit && !winner && <span className="ml-auto shrink-0">підходить, але нижче</span>}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
