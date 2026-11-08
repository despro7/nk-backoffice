import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Chip,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LEVELS,
  type NotificationLevel,
} from '@shared/constants/notifications';
import { validateRule } from '@shared/notifications/ruleEngine';
import type {
  NotificationGlossaryEntry,
  NotificationReplacement,
  NotificationRuleDef,
} from '@shared/types/notificationRules';
import type { NotificationRawLog } from '@shared/types/notificationSettings';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import {
  BASE_TEMPLATE_VARS,
  logsHandledBy,
  logsMatchedAnywhere,
  namedGroups,
  previewItem,
  render,
  withDraft,
} from '../notificationPlayground';

interface RuleEditorDrawerProps {
  isOpen: boolean;
  initial: NotificationRuleDef | null;
  rules: NotificationRuleDef[];
  glossary: NotificationGlossaryEntry[];
  logs: NotificationRawLog[];
  onClose: () => void;
  onSave: (rule: NotificationRuleDef) => Promise<string[] | null>;
  onDelete?: (rule: NotificationRuleDef) => Promise<void>;
  onReset?: (rule: NotificationRuleDef) => Promise<void>;
}

const SECTION = 'flex flex-col gap-3';
const SECTION_TITLE = 'flex items-center gap-2 text-sm font-semibold text-default-800';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function RuleEditorDrawer({
  isOpen,
  initial,
  rules,
  glossary,
  logs,
  onClose,
  onSave,
  onDelete,
  onReset,
}: RuleEditorDrawerProps) {
  const [draft, setDraft] = useState<NotificationRuleDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'delete' | 'reset' | 'discard' | null>(null);
  const [showVars, setShowVars] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && initial) {
      setDraft(clone(initial));
      setServerErrors([]);
    }
  }, [isOpen, initial]);

  const dirty = useMemo(() => !!draft && !!initial && JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const errors = useMemo(() => (draft ? validateRule(draft) : []), [draft]);
  const handled = useMemo(() => (draft && errors.length === 0 ? logsHandledBy(draft, rules, logs) : []), [draft, rules, logs, errors]);
  const anywhere = useMemo(() => (draft && errors.length === 0 ? logsMatchedAnywhere(draft, logs) : []), [draft, logs, errors]);
  const draftRules = useMemo(() => (draft ? withDraft(rules, draft) : rules), [draft, rules]);

  if (!draft) return null;

  const set = (patch: Partial<NotificationRuleDef>) => setDraft({ ...draft, ...patch });
  const setMatch = (patch: Partial<NotificationRuleDef['match']>) => setDraft({ ...draft, match: { ...draft.match, ...patch } });
  const setOutput = (patch: Partial<NotificationRuleDef['output']>) => setDraft({ ...draft, output: { ...draft.output, ...patch } });
  const replacements = draft.output.replacements ?? [];
  const setReplacement = (index: number, patch: Partial<NotificationReplacement>) =>
    setOutput({ replacements: replacements.map((r, i) => (i === index ? { ...r, ...patch } : r)) });

  const vars = [...namedGroups(draft), ...BASE_TEMPLATE_VARS];
  const canSave = errors.length === 0 && handled.length > 0 && dirty && !saving;
  const saveHint =
    errors.length > 0
      ? 'Виправте помилки правила'
      : handled.length === 0
        ? 'Правило не спрацювало на жодному з останніх записів. Перевірте умови або порядок правил.'
        : !dirty
          ? 'Змін немає'
          : '';

  const handleSave = async () => {
    setSaving(true);
    const res = await onSave(draft);
    setSaving(false);
    if (res) setServerErrors(res);
  };

  const requestClose = () => (dirty ? setConfirm('discard') : onClose());
  const shadowed = anywhere.length - handled.length;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && requestClose()}
        placement="right"
        size="5xl"
        classNames={{ base: 'flex flex-col', body: 'flex-1 min-h-0 overflow-y-auto', closeButton: 'top-3 right-3' }}
      >
        <DrawerContent>
          <DrawerHeader className="shrink-0 flex-col gap-0.5 border-b border-default-200">
            <span>{draft.id ? 'Правило сповіщення' : 'Нове правило'}</span>
            <span className="text-xs font-normal text-default-500">
              Спрацьовує перше увімкнене правило за порядком. Перевірка нижче рахує останні {logs.length} записів журналу.
            </span>
          </DrawerHeader>

          <DrawerBody className="grid min-h-0 grid-cols-1 gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            {/* ── Form ── */}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex items-center gap-3">
                <Input
                  id="rule-name"
                  label="Назва правила"
                  value={draft.name}
                  onValueChange={(name) => set({ name })}
                  size="sm"
                  className="flex-1"
                />
                <Switch size="sm" isSelected={draft.enabled} onValueChange={(enabled) => set({ enabled })}>
                  Увімкнено
                </Switch>
              </div>

              <section className={SECTION}>
                <h4 className={SECTION_TITLE}>
                  <DynamicIcon name="filter" size={16} /> Коли спрацьовує
                </h4>
                <Input
                  id="rule-categories"
                  size="sm"
                  label="Категорії (через кому)"
                  description="meta_logs.category, напр. dilovod, product_sync. Порожньо – будь-яка."
                  value={(draft.match.categories ?? []).join(', ')}
                  onValueChange={(v) => setMatch({ categories: v.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
                <CheckboxGroup
                  label="Статус запису"
                  orientation="horizontal"
                  size="sm"
                  value={draft.match.statuses ?? []}
                  onValueChange={(v) => setMatch({ statuses: v as NotificationLevel[] })}
                  description="Порожньо – будь-який."
                >
                  {NOTIFICATION_LEVELS.map((l) => (
                    <Checkbox key={l.id} value={l.id}>{l.label}</Checkbox>
                  ))}
                </CheckboxGroup>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    id="rule-match-title"
                    size="sm"
                    label="Regex заголовка"
                    classNames={{ input: 'font-mono text-xs' }}
                    value={draft.match.title ?? ''}
                    onValueChange={(v) => setMatch({ title: v || undefined })}
                  />
                  <Input
                    id="rule-match-initiator"
                    size="sm"
                    label="Regex ініціатора"
                    classNames={{ input: 'font-mono text-xs' }}
                    value={draft.match.initiatedBy ?? ''}
                    onValueChange={(v) => setMatch({ initiatedBy: v || undefined })}
                  />
                </div>
                <Textarea
                  id="rule-match-message"
                  size="sm"
                  minRows={2}
                  label="Regex тексту"
                  description="Іменовані групи (?<name>…) стають змінними {{name}} у шаблонах. Регістр ігнорується."
                  classNames={{ input: 'font-mono text-xs' }}
                  value={draft.match.message ?? ''}
                  onValueChange={(v) => setMatch({ message: v || undefined })}
                />
                <Input
                  id="rule-match-data"
                  size="sm"
                  label="У data є поле"
                  description="Шлях у meta_logs.data, напр. releaseId або exportResult.success"
                  value={draft.match.dataHas ?? ''}
                  onValueChange={(v) => setMatch({ dataHas: v || undefined })}
                />
              </section>

              <Divider className="bg-default-200/60" />

              <section className={SECTION}>
                <h4 className={SECTION_TITLE}>
                  <DynamicIcon name="layout-template" size={16} /> Що показати
                </h4>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Select
                    size="sm"
                    label="Видимість"
                    selectedKeys={[draft.output.visibility]}
                    onSelectionChange={(k) => setOutput({ visibility: (Array.from(k)[0] as 'show' | 'hidden') ?? 'show' })}
                  >
                    <SelectItem key="show">Показувати</SelectItem>
                    <SelectItem key="hidden">Лише журнал</SelectItem>
                  </Select>
                  <Select
                    size="sm"
                    label="Тип"
                    selectedKeys={draft.output.kind ? [draft.output.kind] : ['auto']}
                    onSelectionChange={(k) => {
                      const v = Array.from(k)[0] as string;
                      setOutput({ kind: v === 'auto' ? undefined : (v as any) });
                    }}
                  >
                    {[{ id: 'auto', label: 'За рівнем' }, ...NOTIFICATION_KINDS].map((k) => (
                      <SelectItem key={k.id}>{k.label}</SelectItem>
                    ))}
                  </Select>
                  <Select
                    size="sm"
                    label="Група"
                    selectedKeys={draft.output.group ? [draft.output.group] : ['auto']}
                    onSelectionChange={(k) => {
                      const v = Array.from(k)[0] as string;
                      setOutput({ group: v === 'auto' ? undefined : (v as any) });
                    }}
                  >
                    {[{ id: 'auto', label: 'За категорією' }, ...NOTIFICATION_GROUPS].map((g) => (
                      <SelectItem key={g.id}>{g.label}</SelectItem>
                    ))}
                  </Select>
                  <Select
                    size="sm"
                    label="Рівень"
                    selectedKeys={draft.output.level ? [draft.output.level] : ['auto']}
                    onSelectionChange={(k) => {
                      const v = Array.from(k)[0] as string;
                      setOutput({ level: v === 'auto' ? undefined : (v as NotificationLevel) });
                    }}
                  >
                    {[{ id: 'auto', label: 'Як у записі' }, ...NOTIFICATION_LEVELS].map((l) => (
                      <SelectItem key={l.id}>{l.label}</SelectItem>
                    ))}
                  </Select>
                </div>
                <Input
                  id="rule-out-title"
                  size="sm"
                  label="Шаблон заголовка"
                  description="Порожньо – заголовок запису після замін."
                  value={draft.output.title ?? ''}
                  onValueChange={(v) => setOutput({ title: v || undefined })}
                />
                <Textarea
                  id="rule-out-message"
                  size="sm"
                  minRows={2}
                  label="Шаблон тексту"
                  description="Порожньо – текст запису після замін ({{message}})."
                  value={draft.output.message ?? ''}
                  onValueChange={(v) => setOutput({ message: v || undefined })}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-default-500">Змінні:</span>
                  {vars.map((v) => (
                    <Chip key={v} size="sm" variant="flat" className="h-5 font-mono text-[11px]">{`{{${v}}}`}</Chip>
                  ))}
                  <Chip size="sm" variant="flat" className="h-5 font-mono text-[11px]">{'{{data.шлях}}'}</Chip>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    id="rule-out-action-label"
                    size="sm"
                    label="Підпис кнопки"
                    description="Порожньо – за типом посилання."
                    value={draft.output.actionLabel ?? ''}
                    onValueChange={(v) => setOutput({ actionLabel: v || undefined })}
                  />
                  <Input
                    id="rule-out-action-link"
                    size="sm"
                    label="Посилання кнопки"
                    description="Внутрішній шлях, напр. /orders/{{orderNumber}}"
                    value={draft.output.actionLink ?? ''}
                    onValueChange={(v) => setOutput({ actionLink: v || undefined })}
                  />
                </div>
              </section>

              <Divider className="bg-default-200/60" />

              <section className={SECTION}>
                <div className="flex items-center justify-between">
                  <h4 className={SECTION_TITLE}>
                    <DynamicIcon name="replace" size={16} /> Заміни в тексті
                  </h4>
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<DynamicIcon name="plus" size={14} />}
                    onPress={() => setOutput({ replacements: [...replacements, { pattern: '', replace: '', target: 'message' }] })}
                  >
                    Додати заміну
                  </Button>
                </div>
                <p className="text-xs text-default-500">
                  Виконуються по черзі до шаблонів. У заміні доступні $1, $2 і $&lt;name&gt;. Прапорець m – ^ і $ для кожного рядка, s – крапка ловить перенос.
                </p>
                {replacements.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)_120px_auto] items-start gap-2">
                    <Input id={`rep-pattern-${i}`} size="sm" label="Regex" classNames={{ input: 'font-mono text-xs' }} value={r.pattern} onValueChange={(v) => setReplacement(i, { pattern: v })} />
                    <Input id={`rep-flags-${i}`} size="sm" label="Прап." classNames={{ input: 'font-mono text-xs' }} value={r.flags ?? ''} onValueChange={(v) => setReplacement(i, { flags: v || undefined })} />
                    <Input id={`rep-replace-${i}`} size="sm" label="Заміна" classNames={{ input: 'font-mono text-xs' }} value={r.replace} onValueChange={(v) => setReplacement(i, { replace: v })} />
                    <Select
                      size="sm"
                      label="Де"
                      selectedKeys={[r.target ?? 'message']}
                      onSelectionChange={(k) => setReplacement(i, { target: (Array.from(k)[0] as any) ?? 'message' })}
                    >
                      <SelectItem key="message">Текст</SelectItem>
                      <SelectItem key="title">Заголовок</SelectItem>
                      <SelectItem key="both">Обидва</SelectItem>
                    </Select>
                    <div className="flex flex-col">
                      <Button isIconOnly size="sm" variant="light" aria-label="Вище" isDisabled={i === 0} onPress={() => {
                        const next = [...replacements];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        setOutput({ replacements: next });
                      }}>
                        <DynamicIcon name="chevron-up" size={14} />
                      </Button>
                      <Button isIconOnly size="sm" variant="light" aria-label="Видалити заміну" className="text-rose-600" onPress={() => setOutput({ replacements: replacements.filter((_, j) => j !== i) })}>
                        <DynamicIcon name="trash-2" size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            </div>

            {/* ── Live check ── */}
            <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
              <h4 className={SECTION_TITLE}>
                <DynamicIcon name="flask-conical" size={16} /> Перевірка на записах
              </h4>
              {errors.length > 0 || serverErrors.length > 0 ? (
                <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
                  <ul className="list-disc space-y-1 pl-4">
                    {[...errors, ...serverErrors].map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg bg-default-50 p-3 text-xs text-default-600">
                  Обробляє <b className="text-default-900">{handled.length}</b> з {logs.length} останніх записів
                  {shadowed > 0 && <> · ще {shadowed} перехоплюють правила вище</>}
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-default-200">
                {handled.slice(0, 6).map((log) => {
                  const rendered = render(log, draftRules, glossary);
                  return (
                    <div key={log.id}>
                      <NotificationRow item={previewItem(log, rendered)} onOpen={() => undefined} />
                      <button
                        type="button"
                        className="flex w-full items-center gap-1 border-b border-default-100 bg-default-50 px-5 py-1 text-left text-[11px] text-default-500 hover:text-default-800"
                        onClick={() => setShowVars(showVars === log.id ? null : log.id)}
                      >
                        <DynamicIcon name={showVars === log.id ? 'chevron-down' : 'chevron-right'} size={12} />
                        Запис #{log.id}: оригінал і змінні
                      </button>
                      {showVars === log.id && (
                        <div className="space-y-2 border-b border-default-100 bg-default-50 px-5 pb-3 text-[11px]">
                          <div>
                            <div className="text-default-500">{log.category} · {log.status} · {log.title}</div>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-default-700">{log.message}</pre>
                          </div>
                          <table className="w-full">
                            <tbody>
                              {Object.entries(rendered.vars).filter(([k]) => !['rawMessage', 'rawTitle'].includes(k)).map(([k, v]) => (
                                <tr key={k} className="align-top">
                                  <td className="w-28 py-0.5 pr-2 font-mono text-default-500">{k}</td>
                                  <td className="whitespace-pre-wrap break-words py-0.5 font-mono text-default-800">{v || '–'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {handled.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-default-400">Немає записів, які обробляє це правило</p>
                )}
              </div>
            </aside>
          </DrawerBody>

          <DrawerFooter className="shrink-0 border-t border-default-200">
            {draft.id != null && onDelete && (
              <Button variant="light" color="danger" startContent={<DynamicIcon name="trash-2" size={16} />} onPress={() => setConfirm('delete')}>
                Видалити
              </Button>
            )}
            {draft.id != null && draft.key && onReset && (
              <Button variant="light" startContent={<DynamicIcon name="rotate-ccw" size={16} />} onPress={() => setConfirm('reset')}>
                Скинути до стандартного
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="light" onPress={requestClose}>Скасувати</Button>
            <Tooltip content={saveHint} isDisabled={!saveHint} delay={200}>
              <span>
                <Button
                  color="primary"
                  isDisabled={!canSave}
                  startContent={<DynamicIcon name={saving ? 'loader-2' : 'save'} size={16} className={saving ? 'animate-spin' : ''} />}
                  onPress={handleSave}
                >
                  Зберегти
                </Button>
              </span>
            </Tooltip>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <ConfirmModal
        isOpen={confirm !== null}
        title={confirm === 'delete' ? 'Видалити правило?' : confirm === 'reset' ? 'Скинути до стандартного?' : 'Закрити без збереження?'}
        message={
          confirm === 'delete'
            ? 'Записи, які воно обробляло, перейдуть до наступного правила або показуватимуться як є. Відкотити можна в «Історії».'
            : confirm === 'reset'
              ? 'Правило повернеться до версії з коду і знову оновлюватиметься автоматично. Ваші зміни збережуться в «Історії».'
              : 'Зміни в правилі буде втрачено.'
        }
        confirmText={confirm === 'delete' ? 'Видалити' : confirm === 'reset' ? 'Скинути' : 'Закрити'}
        confirmColor={confirm === 'delete' || confirm === 'discard' ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const action = confirm;
          setConfirm(null);
          if (action === 'delete') await onDelete?.(draft);
          else if (action === 'reset') await onReset?.(draft);
          else onClose();
        }}
      />
    </>
  );
}
